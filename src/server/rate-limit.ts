// ============================================================
// RATE LIMITS
// ------------------------------------------------------------
// Cloudflare's Rate Limiting binding when it is bound: shared by
// every isolate in a location, no network round trip. Without it
// (local dev, tests, an account that has not added it) a sliding
// window in this isolate's memory does the same job less exactly.
// ============================================================

import type { ApiEnv, RateLimitBinding } from "./env";
import { HttpError } from "./http";

export type Bucket = "search" | "views" | "auth" | "assistant";

interface Policy {
  binding: keyof Pick<ApiEnv, "LIMIT_SEARCH" | "LIMIT_VIEWS" | "LIMIT_AUTH" | "LIMIT_ASSISTANT">;
  /** Requests allowed per window by the in-memory fallback. */
  limit: number;
  windowMs: number;
  message: string;
}

/** The fallback mirrors the wrangler.toml limits so dev behaves like prod. */
export const POLICIES: Record<Bucket, Policy> = {
  search: { binding: "LIMIT_SEARCH", limit: 30, windowMs: 60_000, message: "Too many searches. Try again shortly." },
  views: { binding: "LIMIT_VIEWS", limit: 120, windowMs: 60_000, message: "Too many requests. Try again shortly." },
  auth: { binding: "LIMIT_AUTH", limit: 20, windowMs: 60_000, message: "Too many sign-in attempts. Wait a minute." },
  assistant: { binding: "LIMIT_ASSISTANT", limit: 60, windowMs: 60_000, message: "The assistant is busy. Try again in a moment." },
};

/** Timestamps of recent hits per bucket+key, trimmed as they age out. */
const windows = new Map<string, number[]>();
const MAX_TRACKED = 5_000;

function memoryAllows(key: string, policy: Policy, now = Date.now()): boolean {
  const since = now - policy.windowMs;
  const hits = (windows.get(key) ?? []).filter((at) => at > since);
  if (hits.length >= policy.limit) {
    windows.set(key, hits);
    return false;
  }
  hits.push(now);
  windows.set(key, hits);
  if (windows.size > MAX_TRACKED) {
    // Evict the oldest-inserted keys; a Map iterates in insertion order.
    for (const old of [...windows.keys()].slice(0, MAX_TRACKED / 5)) windows.delete(old);
  }
  return true;
}

/** True when the request may proceed. */
export async function allows(env: ApiEnv, bucket: Bucket, key: string): Promise<boolean> {
  const policy = POLICIES[bucket];
  const binding = env[policy.binding] as RateLimitBinding | undefined;
  if (binding && typeof binding.limit === "function") {
    try {
      return (await binding.limit({ key: `${bucket}:${key}` })).success;
    } catch {
      // A limiter outage must not become an API outage: fall through.
    }
  }
  return memoryAllows(`${bucket}:${key}`, policy);
}

/** Throws a 429 the router turns into a response. */
export async function enforce(env: ApiEnv, bucket: Bucket, key: string): Promise<void> {
  if (!(await allows(env, bucket, key))) {
    throw new HttpError(429, "rate_limited", POLICIES[bucket].message, {
      "retry-after": String(Math.ceil(POLICIES[bucket].windowMs / 1000)),
    });
  }
}

/** Tests only. */
export const resetRateLimits = (): void => windows.clear();
