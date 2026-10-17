// ============================================================
// THE MAILING LIST
// ------------------------------------------------------------
// Readers leave an address to hear when new analysis is published.
// The list lives in the same KV namespace as the read counts, under
// its own prefix, so switching it on needs no new Cloudflare setup:
//
//   s/<sha256(address)>  →  { email, language, at, page }
//
// The key is a hash, so the same address never lands twice and a
// key name leaks nothing. The public endpoint answers the same way
// whether the address is new or already there, so nobody can test
// who is on the list. Only the desk's writer can read or prune it.
// Nothing here sends mail: the writer exports the list for whatever
// newsletter tool she chooses.
// ============================================================

import type { KvStore } from "./env";
import { requireWriter } from "./auth";
import { HttpError, clientKey, isAllowedOrigin, json, readJson, sha256, type Exchange } from "./http";
import { enforce } from "./rate-limit";

export const SUBSCRIBER_PREFIX = "s/";
/** A cap on the export, far above what a personal publication will reach for years. */
const MAX_EXPORT = 10_000;

export interface Subscriber {
  email: string;
  language: "en" | "tr";
  at: string;
  page?: string;
}

/** A plausible address, normalised; null when it is not one. Deliberately not RFC-complete. */
export function normaliseEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  if (email.length < 6 || email.length > 254) return null;
  if (!/^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[a-z]{2,}$/.test(email)) return null;
  const [local, domain] = email.split("@");
  if (local.length > 64 || domain.includes("..") || domain.startsWith(".") || domain.startsWith("-")) return null;
  return email;
}

const keyFor = async (email: string) => `${SUBSCRIBER_PREFIX}${await sha256(email)}`;

const listStore = (exchange: Exchange): KvStore => {
  const store = exchange.env.VIEWS;
  if (!store) throw new HttpError(503, "subscriptions_off", "Sign-ups are not switched on yet.");
  return store;
};

/** POST /api/subscribe: { email, language?, consent: true, page?, website? } */
export async function subscribe(exchange: Exchange): Promise<Response> {
  const { request, env } = exchange;
  if (!isAllowedOrigin(request, env)) throw new HttpError(403, "origin_not_allowed", "Sign up on statevera.org.");
  await enforce(env, "subscribe", clientKey(request));
  const store = listStore(exchange);
  const body = await readJson(request, 2048);

  // A field people never see: a bot that fills it is told yes and stored nowhere.
  if (typeof body.website === "string" && body.website.trim()) return json({ ok: true }, { status: 202 });

  const email = normaliseEmail(body.email);
  if (!email) throw new HttpError(400, "bad_email", "That does not look like an email address.");
  if (body.consent !== true) throw new HttpError(400, "consent_required", "Tick the box to agree to receive the emails.");

  const key = await keyFor(email);
  if (!(await store.get(key))) {
    const page = typeof body.page === "string" ? body.page.split(/[?#]/)[0].slice(0, 160) : undefined;
    const record: Subscriber = {
      email,
      language: body.language === "tr" ? "tr" : "en",
      at: new Date().toISOString(),
      ...(page && page.startsWith("/") ? { page } : {}),
    };
    await store.put(key, JSON.stringify(record));
  }
  // Same answer either way: the list does not confirm who is on it.
  return json({ ok: true }, { status: 202 });
}

/** Every record under the prefix, newest first. */
export async function allSubscribers(store: KvStore): Promise<Subscriber[]> {
  const keys: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await store.list({ prefix: SUBSCRIBER_PREFIX, ...(cursor ? { cursor } : {}), limit: 1000 });
    keys.push(...page.keys.map((key) => key.name));
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor && keys.length < MAX_EXPORT);
  const records = await Promise.all(keys.slice(0, MAX_EXPORT).map((key) => store.get(key, "json") as Promise<Subscriber | null>));
  return records
    .filter((record): record is Subscriber => Boolean(record && typeof record.email === "string"))
    .sort((a, b) => b.at.localeCompare(a.at));
}

/** GET /api/subscribers: the writer's export (json() is no-store by default). */
export async function listSubscribers(exchange: Exchange): Promise<Response> {
  await requireWriter(exchange.request, exchange.env, "Only the writer can see the list.");
  const subscribers = await allSubscribers(listStore(exchange));
  return json(
    {
      count: subscribers.length,
      byLanguage: {
        en: subscribers.filter((s) => s.language === "en").length,
        tr: subscribers.filter((s) => s.language === "tr").length,
      },
      subscribers,
    }
  );
}

/** POST /api/subscribers/remove: { email } — the writer takes someone off on request. */
export async function removeSubscriber(exchange: Exchange): Promise<Response> {
  await requireWriter(exchange.request, exchange.env, "Only the writer can change the list.");
  const store = listStore(exchange);
  const email = normaliseEmail((await readJson(exchange.request, 2048)).email);
  if (!email) throw new HttpError(400, "bad_email", "That does not look like an email address.");
  const key = await keyFor(email);
  const existed = Boolean(await store.get(key));
  if (existed) {
    if (typeof store.delete !== "function") throw new HttpError(501, "cannot_delete", "This store cannot delete.");
    await store.delete(key);
  }
  return json({ ok: true, removed: existed });
}
