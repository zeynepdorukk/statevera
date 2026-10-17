// ============================================================
// EDGE CACHE
// ------------------------------------------------------------
// Workers' Cache API is shared by every isolate in a Cloudflare
// location, unlike a Map in module scope, which dies with its
// isolate. Responses are stored with the time they were made, so
// a stale entry can be served at once while a fresh one is built
// in the background (stale-while-revalidate, by hand, because the
// Cache API itself does not implement it).
//
// Off Workers — the dev server, tests — there is no caches.default
// and every call simply computes.
// ============================================================

import type { WorkerContext } from "./env";

interface CacheLike {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
}

function edge(): CacheLike | null {
  const store = (globalThis as { caches?: { default?: CacheLike } }).caches?.default;
  return store && typeof store.match === "function" ? store : null;
}

const STORED_AT = "x-stored-at";

export interface CachedJson<T> {
  value: T;
  /** hit, stale (served while refreshing), or miss. */
  state: "hit" | "stale" | "miss";
}

/**
 * Returns the cached JSON for `key` when it is younger than `freshMs`; serves it
 * and refreshes in the background when younger than `staleMs`; otherwise computes.
 * `shouldStore` lets a caller refuse to cache a degraded answer.
 */
export async function cachedJson<T>(
  key: string,
  compute: () => Promise<T>,
  options: { freshMs: number; staleMs: number; ctx?: WorkerContext; shouldStore?: (value: T) => boolean }
): Promise<CachedJson<T>> {
  const cache = edge();
  const cacheKey = new Request(`https://cache.statevera.internal/${encodeURIComponent(key)}`);

  const store = async (value: T): Promise<void> => {
    if (!cache || (options.shouldStore && !options.shouldStore(value))) return;
    const response = new Response(JSON.stringify(value), {
      headers: {
        "content-type": "application/json",
        "cache-control": `public, max-age=${Math.ceil(options.staleMs / 1000)}`,
        [STORED_AT]: String(Date.now()),
      },
    });
    await cache.put(cacheKey, response).catch(() => undefined);
  };

  if (cache) {
    const hit = await cache.match(cacheKey).catch(() => undefined);
    if (hit) {
      const age = Date.now() - Number(hit.headers.get(STORED_AT) ?? 0);
      const value = (await hit.json().catch(() => undefined)) as T | undefined;
      if (value !== undefined && age < options.freshMs) return { value, state: "hit" };
      if (value !== undefined && age < options.staleMs) {
        const refresh = compute().then(store).catch(() => undefined);
        if (options.ctx) options.ctx.waitUntil(refresh);
        return { value, state: "stale" };
      }
    }
  }

  const value = await compute();
  const write = store(value);
  if (options.ctx) options.ctx.waitUntil(write);
  else await write;
  return { value, state: "miss" };
}
