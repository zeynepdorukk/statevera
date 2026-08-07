import type { PrimarySourceResult, PrimarySourceType } from "./types";

export const SOURCE_AGENT = "Statevera primary-source index (https://zeynepdorukk.github.io/statevera)";

export function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

export function stripTags(value: string): string {
  return decodeEntities(value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

export function truncate(value: string, length = 320): string {
  const clean = stripTags(value);
  return clean.length > length ? `${clean.slice(0, length - 1).trimEnd()}…` : clean;
}

export function cleanUrl(raw: string, base?: string): string {
  try {
    const value = decodeEntities(raw.trim());
    const url = new URL(value, base);
    return /^https?:$/.test(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}

export function isoDate(value: unknown): string {
  if (typeof value === "number") {
    const date = new Date(value < 10_000_000_000 ? value * 1000 : value);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString();
  }
  if (typeof value !== "string" || !value.trim()) return "";
  const date = new Date(value.trim());
  if (!Number.isNaN(date.getTime())) return date.toISOString();
  const european = value.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!european) return "";
  return `${european[3]}-${european[2]}-${european[1]}T00:00:00.000Z`;
}

export function firstTag(block: string, names: string[]): string {
  for (const name of names) {
    const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i");
    const match = block.match(re);
    if (match?.[1]) return stripTags(match[1]);
  }
  return "";
}

export function firstAtomLink(block: string): string {
  const match = block.match(/<link\b[^>]*?(?:href\s*=\s*["']([^"']+)["']|>([\s\S]*?)<\/link>)/i);
  return cleanUrl(match?.[1] ?? match?.[2] ?? "");
}

export function parseFeedItems(xml: string): {
  title: string;
  url: string;
  snippet: string;
  publicationDate: string;
  identifier: string;
}[] {
  const blocks = [
    ...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi),
    ...xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi),
  ].map((match) => match[0]);

  return blocks.map((block) => ({
    title: firstTag(block, ["title"]),
    url: firstAtomLink(block) || cleanUrl(firstTag(block, ["link"])),
    snippet: truncate(firstTag(block, ["description", "summary", "content"])),
    publicationDate: isoDate(firstTag(block, ["pubDate", "published", "updated", "dc:date", "date"])),
    identifier: firstTag(block, ["guid", "id"]),
  })).filter((item) => item.title && item.url);
}

export function feedResult(
  base: Omit<PrimarySourceResult, "id" | "title" | "documentType" | "publicationDate" | "snippet" | "url" | "sourceIdentifier">,
  item: { title: string; url: string; snippet: string; publicationDate: string; identifier: string },
  documentType: PrimarySourceType,
): PrimarySourceResult {
  const identifier = item.identifier || item.url;
  return {
    ...base,
    id: `${base.institution.toLowerCase().replace(/[^a-z0-9]+/g, "-")}:${identifier}`,
    title: item.title,
    documentType,
    publicationDate: item.publicationDate,
    snippet: item.snippet,
    url: item.url,
    sourceIdentifier: identifier,
  };
}

export async function fetchText(url: string, signal?: AbortSignal, accept = "text/html, application/xml, text/xml, */*"): Promise<string> {
  const response = await fetch(url, {
    signal,
    headers: { accept, "user-agent": SOURCE_AGENT },
  });
  if (!response.ok) throw new Error(`Official source returned ${response.status}.`);
  return response.text();
}

export async function fetchJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      accept: "application/json",
      "user-agent": SOURCE_AGENT,
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) throw new Error(`Official source returned ${response.status}.`);
  return (await response.json()) as T;
}

export function documentTypeOf(text: string, fallback: PrimarySourceType = "Documents"): PrimarySourceType {
  const value = text.toLowerCase();
  if (/\b(?:sanction|sanctions|restrictive measure|asset freeze)\b/.test(value)) return "Sanctions";
  if (/\b(?:treaty|agreement|convention|protocol)\b/.test(value)) return "Treaties";
  if (/\b(?:speech|speeches|remarks|address|addresses|keynote|transcript)\b/.test(value)) return "Speeches";
  if (/\b(?:statement|statements|declaration|press release|communiqué|communique)\b/.test(value)) return "Statements";
  if (/\b(?:legislation|bill|act|regulation|directive|law|rule|proposed rule)\b/.test(value)) return "Legislation";
  if (/\b(?:statistics|statistical|dataset|data release|official data)\b/.test(value)) return "Official Data";
  return fallback;
}

export function metadata(base: Omit<PrimarySourceResult, "id" | "title" | "documentType" | "publicationDate" | "snippet" | "url" | "sourceIdentifier">): Omit<PrimarySourceResult, "id" | "title" | "documentType" | "publicationDate" | "snippet" | "url" | "sourceIdentifier"> {
  return base;
}
