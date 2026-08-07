import { cleanUrl, documentTypeOf, fetchJson, isoDate, stripTags, truncate } from "../common";
import type { PrimarySourceAdapter } from "../types";

interface OsceHit {
  document?: {
    id?: string;
    nid?: number;
    title?: string;
    url?: string;
    preview?: string;
    full_text?: string;
    item_type?: string;
    item_type_label?: string;
    date?: number;
    bundle?: string;
  };
  highlight?: {
    full_text?: { snippet?: string };
    title?: { snippet?: string };
  };
}

interface OsceSearchResponse { hits?: OsceHit[] }

const SEARCH_ENDPOINT = "https://prod.search.web.osce.org/collections/unified/documents/search";
const QUERY_BY = "title,functional_title,full_text,item_type_label,fow_label,source_label,focus_area_label,issued_by_label";
// This is the OSCE website's read-only Typesense search key. It is used only
// in the server adapter; the browser receives normalized records, never this key.
const PUBLIC_SEARCH_KEY = "YyHFyzj2PQeVJ3FzaO55r4vHahaKoKQ3";

export const osce: PrimarySourceAdapter = {
  id: "osce",
  institution: "OSCE",
  organization: "Organization for Security and Co-operation in Europe",
  country: "International organization",
  async search({ query, env, signal }) {
    const url = new URL(SEARCH_ENDPOINT);
    url.searchParams.set("q", query);
    url.searchParams.set("query_by", QUERY_BY);
    url.searchParams.set("per_page", "12");
    url.searchParams.set("sort_by", "_text_match(buckets: 3):desc,date:desc");
    const data = await fetchJson<OsceSearchResponse>(url.toString(), {
      signal,
      headers: {
        "X-TYPESENSE-API-KEY": env.OSCE_SEARCH_API_KEY?.trim() || PUBLIC_SEARCH_KEY,
      },
    });
    return (data.hits ?? []).flatMap((hit) => {
      const row = hit.document;
      const title = row?.title?.trim() ?? "";
      const href = cleanUrl(row?.url ?? "", "https://www.osce.org");
      const bundle = row?.bundle ?? "";
      const itemType = row?.item_type_label ?? row?.item_type ?? "";
      // Exclude generic OSCE news pages; press releases, decisions, speeches
      // and official documents remain first-party research material.
      if (!row || !title || !href || /^(news|article|blog|story)$/i.test(bundle)) return [];
      const identifier = row.id || String(row.nid || href);
      const snippet = truncate(hit.highlight?.full_text?.snippet || row.preview || row.full_text || itemType);
      return [{
        id: `osce:${identifier}`,
        title,
        institution: "OSCE",
        organization: "Organization for Security and Co-operation in Europe",
        country: "International organization",
        documentType: documentTypeOf(`${itemType} ${title}`, /statement|speech/i.test(itemType) ? "Statements" : /treaty|agreement/i.test(itemType) ? "Treaties" : "Documents"),
        publicationDate: isoDate(row.date),
        snippet: stripTags(snippet),
        url: href,
        sourceIdentifier: identifier,
      }];
    });
  },
};
