import { SOURCE_ADAPTERS } from "./adapters";
import type {
  PrimarySourceResult,
  PrimarySourceSearchResponse,
  PrimarySourceStatus,
  PrimarySourceType,
  PrimarySourceEnv,
} from "./types";

interface CacheEntry {
  expiresAt: number;
  response: PrimarySourceSearchResponse;
}

const CACHE_TTL = 60_000;
const MAX_RESULTS = 48;
// Official endpoints are queried in parallel, so one slow institution should
// not hold the entire research desk open for the slowest network response.
// Seven seconds keeps the result set useful while giving the UI a predictable
// upper bound for a cold search.
const ADAPTER_TIMEOUT_MS = 7_000;
const CACHE = new Map<string, CacheEntry>();

function tokensOf(value: string): string[] {
  return value.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((token) => token.length > 1);
}

function relevance(result: PrimarySourceResult, terms: string[]): number {
  const title = result.title.toLowerCase();
  const snippet = result.snippet.toLowerCase();
  const institution = `${result.institution} ${result.organization} ${result.sourceIdentifier}`.toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (title.includes(term)) score += 12;
    if (snippet.includes(term)) score += 4;
    if (institution.includes(term)) score += 2;
  }
  if (terms.length && terms.every((term) => title.includes(term))) score += 8;
  return score;
}

function rank(results: PrimarySourceResult[], query: string): PrimarySourceResult[] {
  const terms = tokensOf(query);
  return results
    .map((result) => ({ result, score: relevance(result, terms) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const dateA = Date.parse(a.result.publicationDate || "") || 0;
      const dateB = Date.parse(b.result.publicationDate || "") || 0;
      return dateB - dateA;
    })
    .slice(0, MAX_RESULTS)
    .map(({ result }) => result);
}

function dedupe(results: PrimarySourceResult[]): PrimarySourceResult[] {
  const seen = new Set<string>();
  return results.filter((result) => {
    const key = result.url.replace(/\/$/, "").toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function matchesType(result: PrimarySourceResult, type?: PrimarySourceType | "All"): boolean {
  return !type || type === "All" || result.documentType === type;
}

export async function searchPrimarySources(
  query: string,
  type: PrimarySourceType | "All" | undefined,
  env: PrimarySourceEnv,
  signal?: AbortSignal,
): Promise<PrimarySourceSearchResponse> {
  const normalized = query.trim().replace(/\s+/g, " ").slice(0, 160);
  const key = `${normalized.toLowerCase()}::${type ?? "All"}`;
  const cached = CACHE.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.response;

  const settled = await Promise.all(SOURCE_ADAPTERS.map(async (adapter) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ADAPTER_TIMEOUT_MS);
    const onAbort = () => controller.abort();
    signal?.addEventListener("abort", onAbort, { once: true });
    try {
      const results = await adapter.search({ query: normalized, env, signal: controller.signal });
      return {
        status: { id: adapter.id, institution: adapter.institution, count: results.length, ok: true } satisfies PrimarySourceStatus,
        results,
      };
    } catch {
      return {
        status: { id: adapter.id, institution: adapter.institution, count: 0, ok: false } satisfies PrimarySourceStatus,
        results: [] as PrimarySourceResult[],
      };
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
    }
  }));

  const response: PrimarySourceSearchResponse = {
    query: normalized,
    results: rank(dedupe(settled.flatMap((item) => item.results).filter((result) => matchesType(result, type))), normalized),
    sources: settled.map((item) => item.status),
  };
  CACHE.set(key, { expiresAt: Date.now() + CACHE_TTL, response });
  if (CACHE.size > 80) {
    const first = CACHE.keys().next().value;
    if (first) CACHE.delete(first);
  }
  return response;
}
