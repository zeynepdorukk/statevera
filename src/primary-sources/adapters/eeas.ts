import { cleanUrl, decodeEntities, documentTypeOf, fetchText, isoDate, stripTags, truncate } from "../common";
import type { PrimarySourceAdapter, PrimarySourceResult } from "../types";

const SEARCH_URL = "https://www.eeas.europa.eu/search_en";

/**
 * The EEAS search page is a public Drupal search endpoint rather than a
 * credentialed API. It is intentionally kept in its own adapter so a future
 * EEAS JSON endpoint can replace the parser without touching the aggregator.
 */
export const eeas: PrimarySourceAdapter = {
  id: "eeas",
  institution: "EEAS",
  organization: "European External Action Service",
  country: "European Union",
  async search({ query, signal }) {
    const url = new URL(SEARCH_URL);
    url.searchParams.set("fulltext", query);
    const html = await fetchText(url.toString(), signal);
    const results: PrimarySourceResult[] = [];
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);

    const cardPattern = /<h3[^>]*class="[^"]*card-title[^"]*"[\s\S]*?<a\s+[^>]*href=(?:"([^"]+)"|([^\s>]+))[^>]*>([\s\S]*?)<\/a>[\s\S]*?<div class="field field--search-api-excerpt">([\s\S]*?)<\/div>[\s\S]*?<div class="card-footer[^>]*>[\s\S]*?(\d{2}\.\d{2}\.\d{4})[\s\S]*?<span[^>]*>\s*([\s\S]*?)\s*<\/span>/gi;
    for (const match of html.matchAll(cardPattern)) {
      const title = stripTags(match[3] ?? "");
      const href = cleanUrl(match[1] || match[2] || "", "https://www.eeas.europa.eu");
      const snippet = truncate(match[4] ?? "");
      const label = stripTags(match[6] ?? "");
      if (!title || !href || !href.includes("eeas.europa.eu") || !terms.every((term) => `${title} ${snippet}`.toLowerCase().includes(term))) continue;
      const identifier = href.replace(/^https?:\/\/www\.eeas\.europa\.eu\/?/, "");
      results.push({
        id: `eeas:${identifier}`,
        title: decodeEntities(title),
        institution: "EEAS",
        organization: "European External Action Service",
        country: "European Union",
        documentType: documentTypeOf(`${label} ${title}`, /speech|remark/i.test(label) ? "Speeches" : /publication|fact.?sheet/i.test(label) ? "Documents" : "Statements"),
        publicationDate: isoDate(match[5] ?? ""),
        snippet,
        url: href,
        sourceIdentifier: identifier,
      });
    }
    return results.slice(0, 12);
  },
};
