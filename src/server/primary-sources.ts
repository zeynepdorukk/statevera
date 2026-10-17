// ============================================================
// PRIMARY-SOURCE SEARCH — the route
// ------------------------------------------------------------
// The institutions that matter send no CORS headers, so the
// browser cannot read them; this fans one query out to every
// adapter and returns one ranked list.
//
// A cold search waits on twelve governments at once, so answers
// are cached at the edge (shared by every isolate in a location)
// and served stale while a fresh copy is fetched behind them. A
// search in which most institutions failed is not cached, so one
// bad minute upstream is not remembered for ten.
// ============================================================

import { searchPrimarySources } from "../primary-sources/search";
import { PRIMARY_SOURCE_TYPES, type PrimarySourceEnv, type PrimarySourceSearchResponse, type PrimarySourceType } from "../primary-sources/types";
import type { ApiEnv, WorkerContext } from "./env";
import { HttpError, clientKey, corsHeaders, finalize, json, newRequestId, type Exchange } from "./http";
import { enforce } from "./rate-limit";
import { cachedJson } from "./edge-cache";

const FRESH_MS = 10 * 60_000;
const STALE_MS = 60 * 60_000;

export function normalizeQuery(raw: string | null): string {
  return (raw ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").slice(0, 160);
}

export function normalizeType(raw: string | null): PrimarySourceType | "All" {
  const value = (raw ?? "All").trim();
  return value === "All" || PRIMARY_SOURCE_TYPES.includes(value as PrimarySourceType)
    ? (value as PrimarySourceType | "All")
    : "All";
}

/** Worth remembering only when at least half the institutions answered. */
const healthy = (result: PrimarySourceSearchResponse): boolean =>
  result.sources.length === 0 || result.sources.filter((source) => source.ok).length * 2 >= result.sources.length;

export async function primarySources(exchange: Exchange, ctx?: WorkerContext): Promise<Response> {
  const { request, env, url } = exchange;
  if (request.method !== "GET") throw new HttpError(405, "method_not_allowed", "Only GET is supported.");

  const query = normalizeQuery(url.searchParams.get("q"));
  if (query.length < 2) throw new HttpError(400, "query_too_short", "Enter at least two characters.");
  const type = normalizeType(url.searchParams.get("type"));

  await enforce(env, "search", clientKey(request));

  const { value, state } = await cachedJson(
    `ps:v1:${type}:${query.toLowerCase()}`,
    // The client's abort signal is deliberately not passed: a refresh that runs
    // after the reader has gone still fills the cache for the next one.
    () => searchPrimarySources(query, type, env),
    { freshMs: FRESH_MS, staleMs: STALE_MS, ctx, shouldStore: healthy }
  );

  return json(value, {
    cache: "public, max-age=60, s-maxage=300, stale-while-revalidate=600",
    headers: { "x-cache": state },
  });
}

/**
 * Kept for anything that still imports the old standalone handler: it now runs
 * through the same route, envelope and limits as the rest of the API.
 */
export async function handlePrimarySources(request: Request, env: PrimarySourceEnv): Promise<Response> {
  const url = new URL(request.url);
  const exchange: Exchange = { request, env: env as ApiEnv, url, route: "primary-sources", id: newRequestId(), startedAt: Date.now() };
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(exchange) });
  try {
    return finalize(exchange, await primarySources(exchange));
  } catch (error) {
    if (error instanceof HttpError) {
      return finalize(exchange, json({ error: error.message, code: error.code }, { status: error.status, headers: error.headers }));
    }
    return finalize(exchange, json({ error: (error as Error).message, code: "internal" }, { status: 500 }));
  }
}
