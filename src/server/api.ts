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

/** What is remembered about one device's first visit to one article. */
export interface ViewMark {
  /** Two-letter country, from Cloudflare's own edge. */
  c?: string;
  /** Referring host only — never the full address someone arrived from. */
  r?: string;
  /** Date of that first visit, UTC. */
  d?: string;
}

/**
 * The subset of a Cloudflare KV namespace this uses. Structural, so the project
 * needs no Workers types and the dev server can pass a plain in-memory stand-in.
 *
 * The mark rides along as KV metadata, which `list` hands back with the key. One
 * write per device per article, and a breakdown that costs no extra reads.
 */
export interface ViewStore {
  put(key: string, value: string, options?: { metadata?: ViewMark }): Promise<void>;
  list(options: { prefix: string; cursor?: string }): Promise<{
    keys: { name: string; metadata?: ViewMark }[];
    list_complete: boolean;
    cursor?: string;
  }>;
}

export interface ApiEnv extends PrimarySourceEnv {
  /** Bind a KV namespace to switch read counts on. Without one they stay off. */
  VIEWS?: ViewStore;
  /** The GitHub app behind "Sign in with GitHub". Without it, tokens only. */
  GITHUB_CLIENT_ID?: string;
  /** Only an OAuth App needs this; a GitHub App's device flow does not. */
  GITHUB_CLIENT_SECRET?: string;
  /** Likewise the scope: a GitHub App is told its permissions when it is made. */
  GITHUB_OAUTH_SCOPE?: string;
}

/** The one GitHub account this desk will hand a token to. */
const DESK_OWNER = "zeynepdorukk";

/** Who may call this API from a browser. */
const ALLOWED_ORIGINS = new Set([
  "https://statevera.org",
  "https://www.statevera.org",
  "https://zeynepdorukk.github.io",
  "http://localhost:4321",
  "http://127.0.0.1:4321",
]);

/** Traffic from these is the site's own, not a referral worth recording. */
const SELF_HOSTS = new Set(["statevera.org", "zeynepdorukk.github.io", "localhost"]);

const VIEW_SLUG = /^[a-z0-9][a-z0-9-]{0,79}$/;
const VIEW_DEVICE = /^[A-Za-z0-9_-]{16,160}$/;
/** How much of the past the desk panel draws. */
const SERIES_DAYS = 30;

const encoder = new TextEncoder();

const hex = (buffer: ArrayBuffer): string =>
  [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");

/** A device is counted once per article, and never identifiably. */
const deviceKey = async (slug: string, deviceId: string): Promise<string> =>
  `v/${slug}/${hex(await crypto.subtle.digest("SHA-256", encoder.encode(deviceId)))}`;

/** Only the host, and only when the reader came from somewhere else. */
function referringHost(raw: string): string {
  if (!raw) return "";
  try {
    const host = new URL(raw).hostname.replace(/^www\./, "").toLowerCase();
    return SELF_HOSTS.has(host) ? "" : host.slice(0, 80);
  } catch {
    return "";
  }
}

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

/** Every mark left on one article, read out of the key listing alone. */
async function marksFor(store: ViewStore, slug: string): Promise<ViewMark[]> {
  const marks: ViewMark[] = [];
  let cursor: string | undefined;
  do {
    const page = await store.list({ prefix: `v/${slug}/`, ...(cursor ? { cursor } : {}) });
    for (const key of page.keys) marks.push(key.metadata ?? {});
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return marks;
}

const tally = (values: string[]): { name: string; count: number }[] => {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 8);
};

/** Zero-filled so the desk can draw a line without inventing the gaps. */
function series(marks: ViewMark[]): { date: string; count: number }[] {
  const byDay = new Map<string, number>();
  for (const mark of marks) if (mark.d) byDay.set(mark.d, (byDay.get(mark.d) ?? 0) + 1);
  const out: { date: string; count: number }[] = [];
  const today = new Date();
  for (let back = SERIES_DAYS - 1; back >= 0; back -= 1) {
    const day = new Date(today);
    day.setUTCDate(day.getUTCDate() - back);
    const date = day.toISOString().slice(0, 10);
    out.push({ date, count: byDay.get(date) ?? 0 });
  }
  return out;
}

async function recordView(request: Request, env: ApiEnv): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as {
    slug?: string;
    deviceId?: string;
    referrer?: string;
  };
  const slug = (body.slug ?? "").trim().toLowerCase();
  const deviceId = (body.deviceId ?? "").trim();
  if (!VIEW_SLUG.test(slug) || !VIEW_DEVICE.test(deviceId)) {
    return json(request, { error: "That view could not be recorded." }, 400);
  }
  if (!env.VIEWS) return json(request, { error: "No counter is bound." }, 501);

  const country = (request.headers.get("cf-ipcountry") ?? "").toUpperCase();
  const mark: ViewMark = {
    ...(/^[A-Z]{2}$/.test(country) ? { c: country } : {}),
    ...((): { r?: string } => {
      const host = referringHost((body.referrer ?? "").trim());
      return host ? { r: host } : {};
    })(),
    d: new Date().toISOString().slice(0, 10),
  };
  await env.VIEWS.put(await deviceKey(slug, deviceId), "1", { metadata: mark });
  return json(request, { ok: true });
}

async function readViews(request: Request, env: ApiEnv): Promise<Response> {
  if (!env.VIEWS) return json(request, { error: "No counter is bound." }, 501);
  const params = new URL(request.url).searchParams;

  // One article, everything known about it: the desk's panel.
  const single = (params.get("slug") ?? "").trim().toLowerCase();
  if (single) {
    if (!VIEW_SLUG.test(single)) return json(request, { error: "That is not an article." }, 400);
    const marks = await marksFor(env.VIEWS, single);
    return json(request, {
      slug: single,
      total: marks.length,
      countries: tally(marks.map((m) => m.c ?? "??")),
      referrers: tally(marks.map((m) => m.r ?? "")),
      days: series(marks),
    });
  }

  const slugs = [
    ...new Set(
      (params.get("slugs") ?? "")
        .split(",")
        .map((slug) => slug.trim().toLowerCase())
        .filter((slug) => VIEW_SLUG.test(slug))
    ),
  ].slice(0, 100);
  if (!slugs.length) return json(request, { error: "No article slugs supplied." }, 400);
  const counts = Object.fromEntries(
    await Promise.all(
      slugs.map(async (slug) => [slug, (await marksFor(env.VIEWS!, slug)).length] as const)
    )
  );
  return json(request, { counts });
}

// ------------------------------------------------------------
// Signing in without a token to copy
// ------------------------------------------------------------
// GitHub's device flow, proxied. The browser cannot call it directly
// — those endpoints send no CORS headers — and this is the only
// reason the desk touches a server to sign in.
//
// The gate is here rather than in the browser: the token is handed
// back only when it belongs to the account this publication is
// written by. Anyone else can complete the approval on GitHub and
// still get nothing.
// ------------------------------------------------------------

const DEVICE_CODE = "https://github.com/login/device/code";
const DEVICE_TOKEN = "https://github.com/login/oauth/access_token";

const github = (env: ApiEnv, url: string, body: Record<string, string>) =>
  fetch(url, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({ client_id: env.GITHUB_CLIENT_ID, ...body }),
  });

/** Starts the flow: GitHub returns the code the writer types into github.com. */
async function startDeviceLogin(request: Request, env: ApiEnv): Promise<Response> {
  if (!env.GITHUB_CLIENT_ID) {
    return json(request, { error: "No GitHub app is configured on this desk." }, 501);
  }
  const response = await github(env, DEVICE_CODE, {
    // A GitHub App carries its own permissions; only an OAuth App wants a scope.
    ...(env.GITHUB_OAUTH_SCOPE ? { scope: env.GITHUB_OAUTH_SCOPE } : {}),
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok || !data.device_code) {
    return json(request, { error: String(data.error_description ?? "GitHub refused to start the sign-in.") }, 502);
  }
  return json(request, {
    deviceCode: data.device_code,
    userCode: data.user_code,
    verificationUri: data.verification_uri,
    interval: Number(data.interval ?? 5),
    expiresIn: Number(data.expires_in ?? 900),
  });
}

/** Finishes it, once the writer has approved — and only for the writer. */
async function finishDeviceLogin(request: Request, env: ApiEnv): Promise<Response> {
  if (!env.GITHUB_CLIENT_ID) {
    return json(request, { error: "No GitHub app is configured on this desk." }, 501);
  }
  const body = (await request.json().catch(() => ({}))) as { deviceCode?: string };
  const deviceCode = typeof body.deviceCode === "string" ? body.deviceCode : "";
  if (!/^[\w-]{10,120}$/.test(deviceCode)) return json(request, { error: "No device code." }, 400);

  const response = await github(env, DEVICE_TOKEN, {
    device_code: deviceCode,
    grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    ...(env.GITHUB_CLIENT_SECRET ? { client_secret: env.GITHUB_CLIENT_SECRET } : {}),
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;

  // Still waiting, or being told to slow down: not an error, just not yet.
  if (typeof data.error === "string") {
    return json(request, { pending: data.error === "authorization_pending" || data.error === "slow_down", error: String(data.error_description ?? data.error) }, data.error === "authorization_pending" || data.error === "slow_down" ? 200 : 400);
  }

  const accessToken = typeof data.access_token === "string" ? data.access_token : "";
  if (!accessToken) return json(request, { error: "GitHub returned no token." }, 502);

  const who = await fetch("https://api.github.com/user", {
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${accessToken}`,
      "user-agent": "statevera-desk",
    },
  });
  const login = String(((await who.json().catch(() => ({}))) as { login?: string }).login ?? "");
  if (login.toLowerCase() !== DESK_OWNER) {
    return json(request, { error: "This desk belongs to someone else." }, 403);
  }

  return json(request, { token: accessToken, login });
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
    if (route === "sign-in" && request.method === "POST") return await startDeviceLogin(request, env);
    if (route === "sign-in/finish" && request.method === "POST") return await finishDeviceLogin(request, env);
  } catch (error) {
    return json(request, { error: (error as Error).message }, 502);
  }

  return json(request, { error: "No such endpoint." }, 404);
}
