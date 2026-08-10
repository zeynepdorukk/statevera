import { searchPrimarySources } from "../primary-sources/search";
import { PRIMARY_SOURCE_TYPES, type PrimarySourceEnv, type PrimarySourceType } from "../primary-sources/types";

const ALLOWED_ORIGINS = new Set([
  "https://statevera.org",
  "https://www.statevera.org",
  "https://zeynepdorukk.github.io",
  "http://localhost:4321",
  "http://127.0.0.1:4321",
]);

const windows = new Map<string, { startedAt: number; count: number }>();

function corsHeaders(request: Request): Headers {
  const headers = new Headers();
  const origin = request.headers.get("origin") ?? "";
  if (ALLOWED_ORIGINS.has(origin)) {
    headers.set("access-control-allow-origin", origin);
    headers.set("vary", "Origin");
  }
  headers.set("access-control-allow-methods", "GET, OPTIONS");
  headers.set("access-control-allow-headers", "content-type");
  return headers;
}

function response(data: unknown, request: Request, init: ResponseInit = {}): Response {
  const headers = corsHeaders(request);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "public, max-age=60, s-maxage=300, stale-while-revalidate=600");
  for (const [name, value] of Object.entries(init.headers ?? {})) headers.set(name, String(value));
  return new Response(init.status === 204 ? null : JSON.stringify(data), { ...init, headers });
}

function requestId(request: Request): string {
  return request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anonymous";
}

function allowed(request: Request): boolean {
  const id = requestId(request);
  const now = Date.now();
  const previous = windows.get(id);
  if (!previous || now - previous.startedAt > 60_000) {
    windows.set(id, { startedAt: now, count: 1 });
    return true;
  }
  if (previous.count >= 30) return false;
  previous.count += 1;
  return true;
}

export async function handlePrimarySources(request: Request, env: PrimarySourceEnv): Promise<Response> {
  if (request.method === "OPTIONS") return response(null, request, { status: 204 });
  if (request.method !== "GET") return response({ error: "Only GET is supported." }, request, { status: 405 });
  if (!allowed(request)) return response({ error: "Too many searches. Try again shortly." }, request, { status: 429 });

  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim().replace(/\s+/g, " ").slice(0, 160);
  if (query.length < 2) return response({ error: "Enter at least two characters." }, request, { status: 400 });

  const rawType = (url.searchParams.get("type") ?? "All").trim();
  const type = rawType === "All" || PRIMARY_SOURCE_TYPES.includes(rawType as PrimarySourceType)
    ? (rawType as PrimarySourceType | "All")
    : "All";
  const result = await searchPrimarySources(query, type, env, request.signal);
  return response(result, request);
}
