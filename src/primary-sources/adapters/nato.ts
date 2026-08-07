import { cleanUrl, documentTypeOf, fetchJson, isoDate, truncate } from "../common";
import type { PrimarySourceAdapter } from "../types";

interface NatoPage {
  title?: string;
  description?: string;
  link?: string;
  pageType?: string;
  pageDate?: string;
  date?: string;
}

const ENDPOINT = "https://www.nato.int/content/nato/en/search/jcr:content/root/container/general_search.search.json";

export const nato: PrimarySourceAdapter = {
  id: "nato",
  institution: "NATO",
  organization: "North Atlantic Treaty Organization",
  country: "International organization",
  async search({ query, signal }) {
    const url = new URL(ENDPOINT);
    url.searchParams.set("searchText", query);
    url.searchParams.set("searchType", "wcm");
    url.searchParams.set("sortBy", "dateDesc");
    url.searchParams.set("pageSize", "20");
    url.searchParams.set("page", "1");
    const data = await fetchJson<{ pages?: NatoPage[] }>(url.toString(), { signal });
    return (data.pages ?? []).flatMap((row) => {
      const title = row.title?.trim() ?? "";
      const pageType = row.pageType?.trim() ?? "";
      const href = cleanUrl(row.link ?? "", "https://www.nato.int");
      // NATO's search also indexes magazine-style news stories. The primary
      // source index keeps official texts, transcripts and reference pages.
      if (!title || !href || /^(news|story)$/i.test(pageType)) return [];
      return [{
        id: `nato:${href}`,
        title,
        institution: "NATO",
        organization: "North Atlantic Treaty Organization",
        country: "International organization",
        documentType: documentTypeOf(`${pageType} ${title}`, /speech|transcript/i.test(pageType) ? "Speeches" : "Documents"),
        publicationDate: isoDate(row.pageDate || row.date),
        snippet: truncate(row.description ?? pageType),
        url: href,
        sourceIdentifier: href.replace("https://www.nato.int", ""),
      }];
    }).slice(0, 12);
  },
};
