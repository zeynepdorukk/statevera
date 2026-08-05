import { getCollection, type CollectionEntry } from "astro:content";
import { regionSlugOf } from "../site";

export type Article = CollectionEntry<"articles">;
export type Briefing = CollectionEntry<"briefings">;
export type Explainer = CollectionEntry<"explainers">;

export const imageFile = (image: string) => `/images/articles/${image}`;

export const root = (p: string): string =>
  p.startsWith("http") ? p : import.meta.env.BASE_URL.replace(/\/$/, "") + p;

export function heroImageOf(heroImage: string): string {
  if (heroImage.startsWith("/")) return root(heroImage);
  return root(imageFile(heroImage));
}

export function readingTimeOf(body: string, override?: number): number {
  if (override && override > 0) return override;
  const words = body.trim().split(/\s+/).length;
  return Math.max(3, Math.round(words / 210));
}

export function readingTime(entry: { body: string; data: { readingTime?: number } }): number {
  return readingTimeOf(entry.body, entry.data.readingTime);
}

export function formatDate(date: Date, opts: Intl.DateTimeFormatOptions = {}): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    ...opts,
  }).format(date);
}

export function formatTime(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export function timeAgo(date: Date): string {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hr${hours > 1 ? "s" : ""} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days > 1 ? "s" : ""} ago`;
}

const byDateDesc = (a: { data: { date: Date } }, b: { data: { date: Date } }) =>
  b.data.date.getTime() - a.data.date.getTime();

const byTimestampDesc = (a: { data: { timestamp: Date } }, b: { data: { timestamp: Date } }) =>
  b.data.timestamp.getTime() - a.data.timestamp.getTime();

// ------------------------------------------------------------
// Articles
// ------------------------------------------------------------

let articlesCache: Article[] | null = null;
export async function getAllArticles(): Promise<Article[]> {
  if (!articlesCache) {
    const all = await getCollection("articles");
    articlesCache = [...all].sort(byDateDesc);
  }
  return articlesCache;
}

export async function getArticleBySlug(slug: string): Promise<Article | undefined> {
  const all = await getAllArticles();
  return all.find((a) => a.id.replace(/\.mdx?$/, "").endsWith(slug));
}

export async function getLatestArticles(count = 8): Promise<Article[]> {
  const all = await getAllArticles();
  return all.slice(0, count);
}

export async function getFeaturedArticle(): Promise<Article | undefined> {
  const all = await getAllArticles();
  return all.find((a) => a.data.featured) ?? all[0];
}

export async function getEditorsPick(): Promise<Article | undefined> {
  const all = await getAllArticles();
  return all.find((a) => a.data.editorsPick);
}

export async function getBreakingArticles(): Promise<Article[]> {
  const all = await getAllArticles();
  return all.filter((a) => a.data.breaking);
}

export async function getByCategory(category: string, count?: number): Promise<Article[]> {
  const all = await getAllArticles();
  const filtered = all.filter((a) => a.data.category === category);
  return count ? filtered.slice(0, count) : filtered;
}

export async function getByType(type: string, count?: number): Promise<Article[]> {
  const all = await getAllArticles();
  const filtered = all.filter((a) => a.data.type === type);
  return count ? filtered.slice(0, count) : filtered;
}

export async function getByRegion(region: string, count?: number): Promise<Article[]> {
  const all = await getAllArticles();
  const filtered = all.filter((a) => a.data.region === region);
  return count ? filtered.slice(0, count) : filtered;
}

export async function getByRegionSlug(slug: string, count?: number): Promise<Article[]> {
  const all = await getAllArticles();
  const filtered = all.filter((a) => regionSlugOf(a.data.region) === slug);
  return count ? filtered.slice(0, count) : filtered;
}

export async function getRelated(article: Article, count = 3): Promise<Article[]> {
  const all = await getAllArticles();
  const regionMatches = all.filter(
    (a) => a.id !== article.id && a.data.region === article.data.region
  );
  const tagMatches = all.filter(
    (a) =>
      a.id !== article.id &&
      a.data.region !== article.data.region &&
      a.data.tags.some((t) => article.data.tags.includes(t))
  );
  const merged = [...regionMatches, ...tagMatches, ...all.filter((a) => a.id !== article.id)];
  const seen = new Set<string>();
  const result: Article[] = [];
  for (const a of merged) {
    if (seen.has(a.id)) continue;
    seen.add(a.id);
    result.push(a);
    if (result.length >= count) break;
  }
  return result;
}

// ------------------------------------------------------------
// Briefings
// ------------------------------------------------------------

let briefingsCache: Briefing[] | null = null;
export async function getAllBriefings(): Promise<Briefing[]> {
  if (!briefingsCache) {
    const all = await getCollection("briefings");
    briefingsCache = [...all].sort(byTimestampDesc);
  }
  return briefingsCache;
}

export async function getLatestBriefings(count = 8): Promise<Briefing[]> {
  const all = await getAllBriefings();
  return all.slice(0, count);
}

export async function getBriefingsByRegion(region: string, count?: number): Promise<Briefing[]> {
  const all = await getAllBriefings();
  const filtered = all.filter((b) => b.data.region === region);
  return count ? filtered.slice(0, count) : filtered;
}

// ------------------------------------------------------------
// Explainers
// ------------------------------------------------------------

let explainersCache: Explainer[] | null = null;
export async function getAllExplainers(): Promise<Explainer[]> {
  if (!explainersCache) {
    const all = await getCollection("explainers");
    explainersCache = [...all].sort(byDateDesc);
  }
  return explainersCache;
}

export async function getExplainerBySlug(slug: string): Promise<Explainer | undefined> {
  const all = await getAllExplainers();
  return all.find((e) => e.id.replace(/\.mdx?$/, "").endsWith(slug));
}

// ------------------------------------------------------------
// Mixed "Latest" stream
// ------------------------------------------------------------

export type StreamItem =
  | { kind: "article"; entry: Article }
  | { kind: "briefing"; entry: Briefing }
  | { kind: "explainer"; entry: Explainer };

export async function getLatestStream(count = 12): Promise<StreamItem[]> {
  const [articles, briefings, explainers] = await Promise.all([
    getAllArticles(),
    getAllBriefings(),
    getAllExplainers(),
  ]);
  const items: StreamItem[] = [
    ...articles.map((e) => ({ kind: "article" as const, entry: e })),
    ...briefings.map((e) => ({ kind: "briefing" as const, entry: e })),
    ...explainers.map((e) => ({ kind: "explainer" as const, entry: e })),
  ];
  items.sort((a, b) => {
    const da = "timestamp" in a.entry.data ? a.entry.data.timestamp : a.entry.data.date;
    const db = "timestamp" in b.entry.data ? b.entry.data.timestamp : b.entry.data.date;
    return db.getTime() - da.getTime();
  });
  return items.slice(0, count);
}
