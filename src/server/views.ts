// ============================================================
// READ COUNTS
// ------------------------------------------------------------
// One KV key per device per article (the device id is hashed, so
// nobody is identifiable), with country, referring host and date
// carried as metadata.
//
// Counting is cheap; reading the count used to be expensive: every
// request listed the whole prefix, and KV lists are the scarcest
// operation on the free plan. Reads now go through an aggregate
// that is computed once, kept in KV for a few minutes and in the
// edge cache for less, so a busy index page costs almost nothing.
// ============================================================

import type { ApiEnv, KvStore, ViewMark, WorkerContext } from "./env";
import { HttpError, SELF_HOSTS, clientKey, isAllowedOrigin, json, readJson, sha256, type Exchange } from "./http";
import { enforce } from "./rate-limit";
import { cachedJson } from "./edge-cache";

export const VIEW_SLUG = /^[a-z0-9][a-z0-9-]{0,119}$/;
const VIEW_DEVICE = /^[A-Za-z0-9_-]{16,160}$/;
/** How much of the past the desk panel draws. */
export const SERIES_DAYS = 30;
/** "Recent" in the batch and popularity answers. */
const RECENT_DAYS = 7;
/** How long a computed aggregate is trusted before it is recomputed. */
const AGGREGATE_FRESH_MS = 2 * 60_000;
const AGGREGATE_TTL_S = 10 * 60;
const AGGREGATE_VERSION = "agg2";

/** User agents that are never readers. Previews and crawlers fetch pages too. */
const NOT_A_READER =
  /bot|crawl|spider|slurp|facebookexternalhit|embedly|quora link preview|whatsapp|telegrambot|discordbot|slackbot|linkedinbot|headless|phantomjs|lighthouse|pagespeed|gtmetrix|python-requests|curl\/|wget\/|go-http-client|okhttp|axios\//i;

export interface ViewAggregate {
  slug: string;
  total: number;
  recent: number;
  countries: { name: string; count: number }[];
  referrers: { name: string; count: number }[];
  days: { date: string; count: number }[];
  /** When this aggregate was computed, ms since epoch. */
  at: number;
}

const deviceKey = async (slug: string, deviceId: string): Promise<string> =>
  `v/${slug}/${await sha256(deviceId)}`;

/** Only the host, and only when the reader came from somewhere else. */
export function referringHost(raw: string): string {
  if (!raw) return "";
  try {
    const host = new URL(raw).hostname.replace(/^www\./, "").toLowerCase();
    return SELF_HOSTS.has(host) ? "" : host.slice(0, 80);
  } catch {
    return "";
  }
}

const today = (): string => new Date().toISOString().slice(0, 10);

function daysAgo(back: number, from = new Date()): string {
  const day = new Date(from);
  day.setUTCDate(day.getUTCDate() - back);
  return day.toISOString().slice(0, 10);
}

/** Every mark left on one article, read out of the key listing alone. */
async function marksFor(store: KvStore, slug: string): Promise<ViewMark[]> {
  const marks: ViewMark[] = [];
  let cursor: string | undefined;
  do {
    const page = await store.list({ prefix: `v/${slug}/`, ...(cursor ? { cursor } : {}) });
    for (const key of page.keys) marks.push(key.metadata ?? {});
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return marks;
}

export const tally = (values: string[], top = 8): { name: string; count: number }[] => {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, top);
};

/** Zero-filled so the desk can draw a line without inventing the gaps. */
export function series(marks: ViewMark[], days = SERIES_DAYS, now = new Date()): { date: string; count: number }[] {
  const byDay = new Map<string, number>();
  for (const mark of marks) if (mark.d) byDay.set(mark.d, (byDay.get(mark.d) ?? 0) + 1);
  const out: { date: string; count: number }[] = [];
  for (let back = days - 1; back >= 0; back -= 1) {
    const date = daysAgo(back, now);
    out.push({ date, count: byDay.get(date) ?? 0 });
  }
  return out;
}

export function aggregate(slug: string, marks: ViewMark[], now = new Date()): ViewAggregate {
  const since = daysAgo(RECENT_DAYS - 1, now);
  return {
    slug,
    total: marks.length,
    recent: marks.filter((mark) => (mark.d ?? "") >= since).length,
    countries: tally(marks.map((m) => m.c ?? "??")),
    referrers: tally(marks.map((m) => m.r ?? "")),
    days: series(marks, SERIES_DAYS, now),
    at: now.getTime(),
  };
}

/** The aggregate for one article: KV-cached, recomputed when it ages out. */
async function aggregateFor(store: KvStore, slug: string, ctx?: WorkerContext): Promise<ViewAggregate> {
  const key = `${AGGREGATE_VERSION}/${slug}`;
  const cached = (await store.get(key, "json").catch(() => null)) as ViewAggregate | null;
  if (cached && typeof cached.total === "number" && Date.now() - cached.at < AGGREGATE_FRESH_MS) return cached;

  const fresh = aggregate(slug, await marksFor(store, slug));
  const write = store.put(key, JSON.stringify(fresh), { expirationTtl: AGGREGATE_TTL_S }).catch(() => undefined);
  if (ctx) ctx.waitUntil(write);
  else await write;
  return fresh;
}

/** Edge-cached for a short while on top of KV, so a burst of readers is one KV read. */
const aggregateCached = async (env: ApiEnv, slug: string, ctx?: WorkerContext): Promise<ViewAggregate> =>
  (
    await cachedJson(`views:${slug}`, () => aggregateFor(env.VIEWS!, slug, ctx), {
      freshMs: 30_000,
      staleMs: 120_000,
      ctx,
    })
  ).value;

function parseSlugs(raw: string | null, max = 100): string[] {
  return [
    ...new Set(
      (raw ?? "")
        .split(",")
        .map((slug) => slug.trim().toLowerCase())
        .filter((slug) => VIEW_SLUG.test(slug))
    ),
  ].slice(0, max);
}

const noCounter = (): never => {
  throw new HttpError(501, "not_configured", "No counter is bound.");
};

// ------------------------------------------------------------
// Routes
// ------------------------------------------------------------

export async function recordView(exchange: Exchange, ctx?: WorkerContext): Promise<Response> {
  const { request, env } = exchange;
  // A real reader's browser always sends the page's origin with this POST.
  // Anything else is a script, and a script's count is not a reader.
  if (!isAllowedOrigin(request, env)) {
    throw new HttpError(403, "forbidden_origin", "Views are only recorded from the publication.");
  }
  await enforce(env, "views", clientKey(request));

  const body = await readJson<{ slug: string; deviceId: string; referrer: string }>(request, 4 * 1024);
  const slug = String(body.slug ?? "").trim().toLowerCase();
  const deviceId = String(body.deviceId ?? "").trim();
  if (!VIEW_SLUG.test(slug) || !VIEW_DEVICE.test(deviceId)) {
    throw new HttpError(400, "invalid_view", "That view could not be recorded.");
  }
  if (!env.VIEWS) noCounter();

  if (NOT_A_READER.test(request.headers.get("user-agent") ?? "")) {
    return json({ ok: true, counted: false });
  }

  const key = await deviceKey(slug, deviceId);
  // KV writes are the scarce resource; a returning device costs a read, not a write.
  // It also keeps the date of the *first* visit, which is what the series draws.
  const existing = await env.VIEWS!.get(key).catch(() => null);
  if (existing !== null) return json({ ok: true, counted: false });

  const country = (request.headers.get("cf-ipcountry") ?? "").toUpperCase();
  const host = referringHost(String(body.referrer ?? "").trim());
  const mark: ViewMark = {
    ...(/^[A-Z]{2}$/.test(country) && country !== "XX" && country !== "T1" ? { c: country } : {}),
    ...(host ? { r: host } : {}),
    d: today(),
  };
  const write = env.VIEWS!.put(key, "1", { metadata: mark });
  if (ctx) ctx.waitUntil(write);
  else await write;
  return json({ ok: true, counted: true });
}

export async function readViews(exchange: Exchange, ctx?: WorkerContext): Promise<Response> {
  const { env, url, request } = exchange;
  await enforce(env, "views", clientKey(request));
  if (!env.VIEWS) noCounter();
  const params = url.searchParams;

  // One article, everything known about it: the desk's panel.
  const single = (params.get("slug") ?? "").trim().toLowerCase();
  if (single) {
    if (!VIEW_SLUG.test(single)) throw new HttpError(400, "invalid_slug", "That is not an article.");
    const agg = await aggregateCached(env, single, ctx);
    return json(
      { slug: agg.slug, total: agg.total, recent: agg.recent, countries: agg.countries, referrers: agg.referrers, days: agg.days },
      { cache: "public, max-age=30" }
    );
  }

  const slugs = parseSlugs(params.get("slugs"));
  if (!slugs.length) throw new HttpError(400, "missing_slugs", "No article slugs supplied.");
  const aggregates = await Promise.all(slugs.map((slug) => aggregateCached(env, slug, ctx)));
  return json(
    {
      counts: Object.fromEntries(aggregates.map((agg) => [agg.slug, agg.total])),
      recent: Object.fromEntries(aggregates.map((agg) => [agg.slug, agg.recent])),
    },
    { cache: "public, max-age=30" }
  );
}

/** The most-read of the slugs supplied, over the last week or all time. */
export async function popularViews(exchange: Exchange, ctx?: WorkerContext): Promise<Response> {
  const { env, url, request } = exchange;
  await enforce(env, "views", clientKey(request));
  if (!env.VIEWS) noCounter();
  const slugs = parseSlugs(url.searchParams.get("slugs"), 60);
  if (!slugs.length) throw new HttpError(400, "missing_slugs", "No article slugs supplied.");
  const window = url.searchParams.get("window") === "all" ? "all" : "week";
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 5) || 5, 1), 20);

  const aggregates = await Promise.all(slugs.map((slug) => aggregateCached(env, slug, ctx)));
  const items = aggregates
    .map((agg) => ({ slug: agg.slug, count: window === "all" ? agg.total : agg.recent, total: agg.total }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count || b.total - a.total || a.slug.localeCompare(b.slug))
    .slice(0, limit);
  return json({ window, items }, { cache: "public, max-age=60, s-maxage=120" });
}
