// ============================================================
// THE PUBLIC API
// ------------------------------------------------------------
// Almost nothing needs a server any more: the desk holds its own
// keys and talks to GitHub from the browser. Two things cannot
// work that way and so live here.
//
// Primary-source search, because the institutions that matter —
// EUR-Lex, the Council, the EEAS, NATO, GovInfo, the Turkish
// foreign ministry, the TBMM archive — send no CORS headers, so
// a browser is simply not allowed to read them.
//
// Article read counts, because counting needs somewhere to keep
// a count.
//
// The same handler runs as a Cloudflare Worker in production and
// behind the Astro dev server locally.
// ============================================================

import { handlePrimarySources } from "./primary-sources";
import type { PrimarySourceEnv } from "../primary-sources/types";

/**
 * The subset of a Cloudflare KV namespace this uses. Structural, so the project
 * needs no Workers types and the dev server can pass a plain in-memory stand-in.
 */
export interface ViewStore {
  put(key: string, value: string): Promise<void>;
  list(options: { prefix: string; cursor?: string }): Promise<{
    keys: { name: string }[];
    list_complete: boolean;
    cursor?: string;
  }>;
}

export interface ApiEnv extends PrimarySourceEnv {
  /** Bind a KV namespace to switch read counts on. Without one they stay off. */
  VIEWS?: ViewStore;
}

/** Who may call this API from a browser. */
const ALLOWED_ORIGINS = new Set([
  "https://zeynepdorukk.github.io",
  "http://localhost:4321",
  "http://127.0.0.1:4321",
]);

const VIEW_SLUG = /^[a-z0-9][a-z0-9-]{0,79}$/;
const VIEW_DEVICE = /^[A-Za-z0-9_-]{16,160}$/;

const encoder = new TextEncoder();

const hex = (buffer: ArrayBuffer): string =>
  [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");

/** A device is counted once per article, and never identifiably. */
const deviceKey = async (slug: string, deviceId: string): Promise<string> =>
  `devices/${slug}/${hex(await crypto.subtle.digest("SHA-256", encoder.encode(deviceId)))}`;

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin") ?? "";
  return {
    ...(ALLOWED_ORIGINS.has(origin) ? { "access-control-allow-origin": origin } : {}),
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    vary: "Origin",
  };
}

const json = (request: Request, data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...corsHeaders(request),
    },
  });

async function countViews(store: ViewStore, slug: string): Promise<number> {
  let total = 0;
  let cursor: string | undefined;
  do {
    const page = await store.list({ prefix: `devices/${slug}/`, ...(cursor ? { cursor } : {}) });
    total += page.keys.length;
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return total;
}

async function recordView(request: Request, env: ApiEnv): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as { slug?: string; deviceId?: string };
  const slug = (body.slug ?? "").trim().toLowerCase();
  const deviceId = (body.deviceId ?? "").trim();
  if (!VIEW_SLUG.test(slug) || !VIEW_DEVICE.test(deviceId)) {
    return json(request, { error: "That view could not be recorded." }, 400);
  }
  if (!env.VIEWS) return json(request, { error: "No counter is bound." }, 501);
  await env.VIEWS.put(await deviceKey(slug, deviceId), "1");
  return json(request, { ok: true });
}

async function readViews(request: Request, env: ApiEnv): Promise<Response> {
  if (!env.VIEWS) return json(request, { error: "No counter is bound." }, 501);
  const slugs = [
    ...new Set(
      (new URL(request.url).searchParams.get("slugs") ?? "")
        .split(",")
        .map((slug) => slug.trim().toLowerCase())
        .filter((slug) => VIEW_SLUG.test(slug))
    ),
  ].slice(0, 100);
  if (!slugs.length) return json(request, { error: "No article slugs supplied." }, 400);
  const counts = Object.fromEntries(
    await Promise.all(slugs.map(async (slug) => [slug, await countViews(env.VIEWS!, slug)] as const))
  );
  return json(request, { counts });
}

export async function handleApi(request: Request, env: ApiEnv): Promise<Response> {
  const route = new URL(request.url).pathname.replace(/^.*\/api\//, "");

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }

  try {
    if (route === "primary-sources") return await handlePrimarySources(request, env);
    if (route === "views" && request.method === "POST") return await recordView(request, env);
    if (route === "views" && request.method === "GET") return await readViews(request, env);
  } catch (error) {
    return json(request, { error: (error as Error).message }, 502);
  }

  return json(request, { error: "No such endpoint." }, 404);
}
