// ============================================================
// THE WIRE — typed access to the aggregated news snapshot
// ------------------------------------------------------------
// src/data/wire.json is produced by `npm run wire` and committed,
// so the site always builds with real content even if a feed is
// unreachable. Statevera stores headline, summary, source and
// link only — every item links out to the publisher.
// ============================================================

import raw from "./wire.json";
import { regionSlugOf } from "../site";

export interface WireItem {
  id: string;
  title: string;
  summary: string;
  url: string;
  publisher: string;
  publisherHome: string;
  sourceId: string;
  publishedAt: string;
  /** True when the feed carried no date and this is when Statevera first saw the link. */
  dateEstimated?: boolean;
  image: string;
  /** Declared width of the picture in the feed. 0 means unknown. */
  imageWidth: number;
  category: string;
  region: string;
  weight: number;
}

/** Below this the feed picture is a thumbnail and must not be used as a lead. */
export const LEAD_IMAGE_WIDTH = 460;

export const canLead = (item: WireItem): boolean =>
  Boolean(item.image) && (item.imageWidth === 0 || item.imageWidth >= LEAD_IMAGE_WIDTH);

export interface WireSnapshot {
  generatedAt: string;
  sourceCount: number;
  failedSources: string[];
  items: WireItem[];
}

const snapshot = raw as WireSnapshot;

export const wireGeneratedAt = new Date(snapshot.generatedAt);

/** Newest first. */
export const wireItems: WireItem[] = [...snapshot.items].sort(
  (a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)
);

export const wirePublishers: string[] = [...new Set(wireItems.map((i) => i.publisher))].sort();

export const wireDate = (item: WireItem): Date => new Date(item.publishedAt);

export function byCategory(category: string, count?: number): WireItem[] {
  const list = wireItems.filter((i) => i.category === category);
  return count ? list.slice(0, count) : list;
}

export function byRegion(region: string, count?: number): WireItem[] {
  const list = wireItems.filter((i) => i.region === region);
  return count ? list.slice(0, count) : list;
}

export function byRegionSlug(slug: string, count?: number): WireItem[] {
  const list = wireItems.filter((i) => regionSlugOf(i.region) === slug);
  return count ? list.slice(0, count) : list;
}

export function latest(count = 12): WireItem[] {
  return wireItems.slice(0, count);
}

/**
 * Caps how many items one masthead may take in a single list. Feeds publish in
 * bursts, and one of them would otherwise fill the front page on its own.
 * Anything held back is appended rather than lost, so the list is never short.
 */
export function spread(items: WireItem[], count: number, maxPerPublisher = 2): WireItem[] {
  const used = new Map<string, number>();
  const picked: WireItem[] = [];
  const held: WireItem[] = [];

  for (const item of items) {
    if (picked.length >= count) break;
    const taken = used.get(item.publisher) ?? 0;
    if (taken < maxPerPublisher) {
      used.set(item.publisher, taken + 1);
      picked.push(item);
    } else {
      held.push(item);
    }
  }
  for (const item of held) {
    if (picked.length >= count) break;
    picked.push(item);
  }
  return picked;
}

/** Illustrated items, newest first — used wherever the layout needs pictures. */
export function withImages(count = 6, exclude: ReadonlySet<string> = new Set()): WireItem[] {
  return wireItems.filter((i) => canLead(i) && !exclude.has(i.id)).slice(0, count);
}

/**
 * The lead slots. Prefers items with a picture large enough to carry a headline,
 * then falls back to whatever is newest, never repeating an item and never
 * letting one masthead hold more than a single lead while alternatives exist.
 */
export function leadStories(count = 4): WireItem[] {
  const chosen: WireItem[] = [];
  const seen = new Set<string>();
  const used = new Map<string, number>();
  const push = (item: WireItem, maxPerPublisher: number) => {
    if (seen.has(item.id) || chosen.length >= count) return;
    if ((used.get(item.publisher) ?? 0) >= maxPerPublisher) return;
    seen.add(item.id);
    used.set(item.publisher, (used.get(item.publisher) ?? 0) + 1);
    chosen.push(item);
  };

  for (const item of wireItems) if (canLead(item) && item.weight >= 2) push(item, 1);
  for (const item of wireItems) if (canLead(item)) push(item, 2);
  for (const item of wireItems) push(item, 2);
  for (const item of wireItems) push(item, Number.POSITIVE_INFINITY);
  return chosen;
}

/** Distinct regions present in the snapshot, busiest first. */
export function activeRegions(): { region: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const item of wireItems) counts.set(item.region, (counts.get(item.region) ?? 0) + 1);
  return [...counts.entries()]
    .map(([region, count]) => ({ region, count }))
    .sort((a, b) => b.count - a.count);
}

export function relativeTime(date: Date, now: Date = new Date()): string {
  const mins = Math.floor((now.getTime() - date.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "yesterday" : `${days}d ago`;
}
