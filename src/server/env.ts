// ============================================================
// THE WORKER'S ENVIRONMENT
// ------------------------------------------------------------
// Everything the API can be handed by Cloudflare, described
// structurally so the project needs no Workers type package and
// the Astro dev server can pass plain in-memory stand-ins.
//
// Every binding is optional. A missing one switches its feature
// off and says so; it never takes the rest of the API down.
// ============================================================

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
 * The subset of a Cloudflare KV namespace the API uses.
 *
 * View marks ride along as KV metadata, which `list` hands back with the key:
 * one write per device per article, and a breakdown that costs no extra reads.
 * `get`/`put` with a TTL also hold the cached aggregates, so reading counts does
 * not list the namespace on every page view.
 */
export interface KvStore {
  get(key: string, type: "json"): Promise<unknown>;
  get(key: string): Promise<string | null>;
  put(
    key: string,
    value: string,
    options?: { metadata?: ViewMark; expirationTtl?: number }
  ): Promise<void>;
  list(options: { prefix: string; cursor?: string; limit?: number }): Promise<{
    keys: { name: string; metadata?: ViewMark }[];
    list_complete: boolean;
    cursor?: string;
  }>;
  delete?(key: string): Promise<void>;
}

/** @deprecated kept so older imports keep compiling; use KvStore. */
export type ViewStore = KvStore;

/** Cloudflare's Rate Limiting binding. */
export interface RateLimitBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

/** The slice of ExecutionContext the API uses. */
export interface WorkerContext {
  waitUntil(promise: Promise<unknown>): void;
}

export interface ApiEnv extends PrimarySourceEnv {
  /** Bind a KV namespace to switch read counts on. Without one they stay off. */
  VIEWS?: KvStore;

  /** Optional per-route limiters; without them an in-memory window is used. */
  LIMIT_SEARCH?: RateLimitBinding;
  LIMIT_VIEWS?: RateLimitBinding;
  LIMIT_AUTH?: RateLimitBinding;
  LIMIT_ASSISTANT?: RateLimitBinding;
  LIMIT_SUBSCRIBE?: RateLimitBinding;

  /** The GitHub app behind "Sign in with GitHub". Without it, tokens only. */
  GITHUB_CLIENT_ID?: string;
  /** Only an OAuth App needs this; a GitHub App's device flow does not. */
  GITHUB_CLIENT_SECRET?: string;
  /** Likewise the scope: a GitHub App is told its permissions when it is made. */
  GITHUB_OAUTH_SCOPE?: string;
  /** Who may sign in, comma separated. Defaults to the account that owns the publication. */
  DESK_LOGINS?: string;

  /** Bind this and the writer never has to hold an OpenAI key of her own. */
  OPENAI_KEY?: string;
  /** Which model that key should use. Left unset, the desk finds one it can reach. */
  OPENAI_MODEL?: string;

  /** Switches email on: confirmation, unsubscribe links, new-piece announcements (Resend). */
  RESEND_API_KEY?: string;
  /** Signs confirm/unsubscribe links. Falls back to RESEND_API_KEY. */
  MAIL_SECRET?: string;
  /** Sender, e.g. "Statevera <journal@statevera.org>"; the domain must be verified in Resend. */
  MAIL_FROM?: string;
  /** This Worker's public origin, used to build the links in emails. */
  PUBLIC_API_URL?: string;

  /** Extra browser origins allowed to call the API, comma separated. */
  EXTRA_ORIGINS?: string;
  /** Stamped by the deploy workflow so /api/health can say what is running. */
  RELEASE?: string;
}
