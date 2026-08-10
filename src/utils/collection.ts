// ============================================================
// THE JOURNAL — data access for Statevera's own writing
// ------------------------------------------------------------
// Everything here concerns work signed by the editor. Aggregated
// reporting lives in src/data/wire.ts.
// ============================================================

import { getCollection, type CollectionEntry } from "astro:content";
import { regionSlugOf, site } from "../site";

export type Article = CollectionEntry<"articles">;

const IS_DEV = import.meta.env.DEV;

// ------------------------------------------------------------
// Paths & formatting
// ------------------------------------------------------------

/**
 * Prefix a site-absolute path with the deployment base path, and give pages the
 * trailing slash they are actually served at.
 *
 * Without the slash every internal link costs a 301 (/about -> /about/), which is
 * crawl budget spent on nothing. A last segment carrying an extension is a file,
 * not a page, so it is left alone.
 *
 * Idempotent on purpose: callers pass around values that are sometimes already
 * prefixed (an article's href, a hero image path), and prefixing twice produced
 * /statevera/statevera/... in canonicals and share images.
 */
export const root = (p: string): string => {
  if (p.startsWith("http")) return p;
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const based = !base || p === base || p.startsWith(`${base}/`) ? p : base + p;
  return withTrailingSlash(based);
};

/** Pages end in a slash; files, fragments and queries are left as they are. */
function withTrailingSlash(p: string): string {
  if (!p.startsWith("/") || p.endsWith("/")) return p;
  if (/[#?]/.test(p)) return p;
  const last = p.slice(p.lastIndexOf("/") + 1);
  return last.includes(".") ? p : `${p}/`;
}

/** Strip the deployment base path back off, giving the publication-relative path. */
export const unroot = (p: string): string => {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  if (!base || !p.startsWith(base)) return p;
  return p.slice(base.length) || "/";
};

/**
 * A full URL on the canonical host.
 *
 * `new URL(path, siteUrl)` is wrong here: an absolute path discards siteUrl's own
 * path, so the desk deployment — which builds at the root — produced
 * github.io/wire/ instead of github.io/statevera/wire/.
 */
export const absoluteUrl = (p: string): string => {
  if (p.startsWith("http")) return p;
  const path = unroot(p);
  return site.siteUrl + (path.startsWith("/") ? path : `/${path}`);
};

export const slugOf = (entry: { id: string }): string => entry.id.replace(/\.mdx?$/, "");

export const articleHref = (entry: Article): string => root(`/articles/${slugOf(entry)}`);

export function heroImageOf(heroImage: string): string {
  if (heroImage.startsWith("http")) return heroImage;
  return root(heroImage.startsWith("/") ? heroImage : `/images/articles/${heroImage}`);
}

export function readingTimeOf(body: string | undefined, override?: number): number {
  if (override && override > 0) return override;
  const words = (body ?? "").trim().split(/\s+/).filter(Boolean).length;
  return Math.max(3, Math.round(words / 210));
}

export function readingTime(entry: { body?: string; data: { readingTime?: number } }): number {
  return readingTimeOf(entry.body, entry.data.readingTime);
}

export function formatDate(date: Date, opts: Intl.DateTimeFormatOptions = {}): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
    ...opts,
  }).format(date);
}

export function formatTime(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(date);
}

// ------------------------------------------------------------
// Articles
// ------------------------------------------------------------

const byDateDesc = (a: { data: { date: Date } }, b: { data: { date: Date } }) =>
  b.data.date.getTime() - a.data.date.getTime();

/** Drafts are visible while running `astro dev`, never in a build. */
const published = <T extends { data: { draft: boolean } }>(entries: T[]): T[] =>
  IS_DEV ? entries : entries.filter((e) => !e.data.draft);

let articlesCache: Article[] | null = null;
export async function getAllArticles(): Promise<Article[]> {
  if (!articlesCache) {
    articlesCache = published([...(await getCollection("articles"))]).sort(byDateDesc);
  }
  return articlesCache;
}

export async function getArticleBySlug(slug: string): Promise<Article | undefined> {
  return (await getAllArticles()).find((a) => slugOf(a) === slug);
}

export async function getLatestArticles(count = 8): Promise<Article[]> {
  return (await getAllArticles()).slice(0, count);
}

export async function getFeaturedArticle(): Promise<Article | undefined> {
  const all = await getAllArticles();
  return all.find((a) => a.data.featured) ?? all[0];
}

export async function getEditorsPick(): Promise<Article | undefined> {
  const all = await getAllArticles();
  return all.find((a) => a.data.editorsPick) ?? all[1] ?? all[0];
}

export async function getByCategory(category: string, count?: number): Promise<Article[]> {
  const list = (await getAllArticles()).filter((a) => a.data.category === category);
  return count ? list.slice(0, count) : list;
}

export async function getByType(type: string, count?: number): Promise<Article[]> {
  const list = (await getAllArticles()).filter((a) => a.data.type === type);
  return count ? list.slice(0, count) : list;
}

export async function getByRegionSlug(slug: string, count?: number): Promise<Article[]> {
  const list = (await getAllArticles()).filter((a) => regionSlugOf(a.data.region) === slug);
  return count ? list.slice(0, count) : list;
}

/** Region first, then shared tags, then anything recent. Never repeats. */
export async function getRelated(article: Article, count = 3): Promise<Article[]> {
  const all = await getAllArticles();
  const others = all.filter((a) => a.id !== article.id);
  const ranked = [
    ...others.filter((a) => a.data.region === article.data.region),
    ...others.filter((a) => a.data.tags.some((t) => article.data.tags.includes(t))),
    ...others,
  ];
  const seen = new Set<string>();
  const out: Article[] = [];
  for (const a of ranked) {
    if (seen.has(a.id)) continue;
    seen.add(a.id);
    out.push(a);
    if (out.length >= count) break;
  }
  return out;
}

// ------------------------------------------------------------
// Journal stream
// ------------------------------------------------------------

export type JournalItem = {
  kind: "article";
  entry: Article;
  date: Date;
  href: string;
  title: string;
};

export async function getJournalStream(count?: number): Promise<JournalItem[]> {
  const items: JournalItem[] = (await getAllArticles()).map((entry) => ({
    kind: "article" as const,
    entry,
    date: entry.data.date,
    href: articleHref(entry),
    title: entry.data.title,
  }));
  items.sort((a, b) => b.date.getTime() - a.date.getTime());
  return count ? items.slice(0, count) : items;
}
