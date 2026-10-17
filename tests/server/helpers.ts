import type { ApiEnv, KvStore, ViewMark, WorkerContext } from "../../src/server/env";

export const ORIGIN = "https://statevera.org";

/** An in-memory KV that behaves like the real one where the API cares. */
export function memoryKv(): KvStore & { entries: Map<string, { value: string; metadata?: ViewMark; expires: number }>; ops: Record<string, number> } {
  const entries = new Map<string, { value: string; metadata?: ViewMark; expires: number }>();
  const ops = { get: 0, put: 0, list: 0 };
  const live = (key: string) => {
    const entry = entries.get(key);
    if (!entry) return undefined;
    if (entry.expires && entry.expires < Date.now()) {
      entries.delete(key);
      return undefined;
    }
    return entry;
  };
  return {
    entries,
    ops,
    async get(key: string, type?: "json"): Promise<any> {
      ops.get += 1;
      const entry = live(key);
      if (!entry) return null;
      return type === "json" ? JSON.parse(entry.value) : entry.value;
    },
    async put(key, value, options) {
      ops.put += 1;
      entries.set(key, {
        value,
        metadata: options?.metadata,
        expires: options?.expirationTtl ? Date.now() + options.expirationTtl * 1000 : 0,
      });
    },
    async list({ prefix, cursor, limit = 2 }) {
      ops.list += 1;
      // A tiny page size, so pagination is exercised.
      const names = [...entries.keys()].filter((name) => name.startsWith(prefix) && live(name)).sort();
      const start = cursor ? Number(cursor) : 0;
      const page = names.slice(start, start + limit);
      const done = start + limit >= names.length;
      return {
        keys: page.map((name) => ({ name, metadata: entries.get(name)!.metadata })),
        list_complete: done,
        ...(done ? {} : { cursor: String(start + limit) }),
      };
    },
  };
}

export function context(): WorkerContext & { pending: Promise<unknown>[]; settle: () => Promise<void> } {
  const pending: Promise<unknown>[] = [];
  return {
    pending,
    waitUntil: (promise) => void pending.push(promise),
    settle: async () => {
      await Promise.all(pending);
    },
  };
}

export function env(overrides: Partial<ApiEnv> = {}): ApiEnv {
  return { VIEWS: memoryKv(), ...overrides };
}

export function request(path: string, init: RequestInit & { origin?: string | null; ip?: string } = {}): Request {
  const headers = new Headers(init.headers);
  const origin = init.origin === undefined ? ORIGIN : init.origin;
  if (origin) headers.set("origin", origin);
  headers.set("cf-connecting-ip", init.ip ?? "203.0.113.7");
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  return new Request(`https://statevera-desk.example.workers.dev${path}`, { ...init, headers });
}

export const post = (path: string, body: unknown, init: Parameters<typeof request>[1] = {}) =>
  request(path, { ...init, method: "POST", body: JSON.stringify(body) });

export const device = (n = 1) => `device-${String(n).padStart(4, "0")}-abcdefghijklmnop`;
