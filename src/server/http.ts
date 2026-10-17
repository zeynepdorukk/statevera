// ============================================================
// HTTP — one place for CORS, envelopes and headers
// ------------------------------------------------------------
// Before this file the API had two CORS implementations that
// disagreed about which methods were allowed. Now every route
// answers through the same helpers, so a header added here is
// added everywhere.
// ============================================================

import type { ApiEnv } from "./env";

/** Who may call this API from a browser. */
export const ALLOWED_ORIGINS: ReadonlySet<string> = new Set([
  "https://statevera.org",
  "https://www.statevera.org",
  "https://zeynepdorukk.github.io",
  "http://localhost:4321",
  "http://127.0.0.1:4321",
]);

/** Traffic from these is the site's own, not a referral worth recording. */
export const SELF_HOSTS: ReadonlySet<string> = new Set([
  "statevera.org",
  "zeynepdorukk.github.io",
  "localhost",
  "127.0.0.1",
]);

export function allowedOrigins(env: ApiEnv): Set<string> {
  const extra = (env.EXTRA_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter((origin) => /^https?:\/\/[^/]+$/.test(origin));
  return new Set([...ALLOWED_ORIGINS, ...extra]);
}

export function isAllowedOrigin(request: Request, env: ApiEnv): boolean {
  const origin = request.headers.get("origin");
  return Boolean(origin && allowedOrigins(env).has(origin));
}

/** The request's context, carried through every helper. */
export interface Exchange {
  request: Request;
  env: ApiEnv;
  url: URL;
  route: string;
  /** Echoed as x-request-id and written into every log line. */
  id: string;
  startedAt: number;
}

export function corsHeaders(exchange: Pick<Exchange, "request" | "env">): Record<string, string> {
  const origin = exchange.request.headers.get("origin") ?? "";
  return {
    ...(allowedOrigins(exchange.env).has(origin) ? { "access-control-allow-origin": origin } : {}),
    "access-control-allow-methods": "GET, POST, OPTIONS",
    // The assistant is called with the sign-in on it, and a preflight that does
    // not allow that header is a request the browser never sends.
    "access-control-allow-headers": "content-type, authorization",
    "access-control-expose-headers": "x-request-id, retry-after, x-cache",
    "access-control-max-age": "86400",
    vary: "Origin",
  };
}

/** Headers no API response should ever go without. */
const HARDENING: Record<string, string> = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "x-frame-options": "DENY",
  "cross-origin-resource-policy": "cross-origin",
};

export function finalize(exchange: Exchange, response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(corsHeaders(exchange))) {
    if (!headers.has(name)) headers.set(name, value);
  }
  for (const [name, value] of Object.entries(HARDENING)) {
    if (!headers.has(name)) headers.set(name, value);
  }
  headers.set("x-request-id", exchange.id);
  headers.set("server-timing", `app;dur=${Date.now() - exchange.startedAt}`);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export interface JsonInit {
  status?: number;
  /** Defaults to no-store; public routes pass their own. */
  cache?: string;
  headers?: Record<string, string>;
}

export function json(data: unknown, init: JsonInit = {}): Response {
  return new Response(init.status === 204 ? null : JSON.stringify(data), {
    status: init.status ?? 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": init.cache ?? "no-store",
      ...(init.headers ?? {}),
    },
  });
}

/**
 * The error envelope. `error` stays a sentence a writer can read, as the desk
 * has always shown it; `code` is a stable token for code to branch on.
 */
export function failure(status: number, code: string, message: string, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}): Response {
  return json({ error: message, code, ...extra }, { status, headers });
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly headers: Record<string, string> = {}
  ) {
    super(message);
    this.name = "HttpError";
  }
}

/** Largest JSON body any route accepts. The assistant carries whole passages. */
export const MAX_BODY_BYTES = 512 * 1024;

/** Reads a JSON object body with a size cap; a malformed body is an empty object. */
export async function readJson<T extends Record<string, unknown>>(request: Request, limit = MAX_BODY_BYTES): Promise<Partial<T>> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > limit) throw new HttpError(413, "payload_too_large", "That request is too large.");
  const text = await request.text().catch(() => "");
  if (text.length > limit) throw new HttpError(413, "payload_too_large", "That request is too large.");
  if (!text) return {};
  try {
    const value = JSON.parse(text) as unknown;
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Partial<T>) : {};
  } catch {
    return {};
  }
}

/** A short random id; crypto.randomUUID exists on Workers and in Node 22. */
export const newRequestId = (): string => crypto.randomUUID().replace(/-/g, "").slice(0, 16);

/** Who is asking, for rate limiting only. Never stored. */
export function clientKey(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "anonymous"
  );
}

const encoder = new TextEncoder();

export const hex = (buffer: ArrayBuffer): string =>
  [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");

export const sha256 = async (value: string): Promise<string> =>
  hex(await crypto.subtle.digest("SHA-256", encoder.encode(value)));

/** One JSON line per request: Workers Logs indexes the fields. */
export function logLine(exchange: Exchange, status: number, extra: Record<string, unknown> = {}): void {
  try {
    console.log(
      JSON.stringify({
        at: "api",
        id: exchange.id,
        method: exchange.request.method,
        route: exchange.route,
        status,
        ms: Date.now() - exchange.startedAt,
        colo: (exchange.request as Request & { cf?: { colo?: string } }).cf?.colo,
        ...extra,
      })
    );
  } catch {
    /* logging must never break a response */
  }
}
