import { cleanUrl, documentTypeOf, fetchJson, isoDate, truncate } from "../common";
import type { PrimarySourceAdapter } from "../types";

interface MetadataValue { value?: string }
interface TbmmItem {
  id?: string;
  uuid?: string;
  name?: string;
  handle?: string;
  metadata?: Record<string, MetadataValue[]>;
}

interface TbmmSearchResponse {
  _embedded?: {
    searchResult?: {
      _embedded?: {
        objects?: { _embedded?: { indexableObject?: TbmmItem } }[];
      };
    };
  };
}

function value(item: TbmmItem, key: string): string {
  return item.metadata?.[key]?.map((entry) => entry.value?.trim()).filter(Boolean).join("; ") ?? "";
}

export const tbmm: PrimarySourceAdapter = {
  id: "tbmm",
  institution: "TBMM",
  organization: "Türkiye Büyük Millet Meclisi",
  country: "Türkiye",
  async search({ query, signal }) {
    const url = new URL("https://acikerisim.tbmm.gov.tr/server/api/discover/search/objects");
    url.searchParams.set("query", query);
    url.searchParams.set("size", "12");
    const data = await fetchJson<TbmmSearchResponse>(url.toString(), { signal });
    const objects = data._embedded?.searchResult?._embedded?.objects ?? [];
    return objects.flatMap((object) => {
      const item = object._embedded?.indexableObject;
      if (!item) return [];
      const title = value(item, "dc.title") || item.name?.trim() || "";
      const identifier = item.handle || item.uuid || item.id || "";
      const href = cleanUrl(value(item, "dc.identifier.uri") || (item.handle ? `https://acikerisim.tbmm.gov.tr/handle/${item.handle}` : ""));
      if (!title || !identifier || !href) return [];
      const description = value(item, "dc.description") || value(item, "dc.subject");
      const type = value(item, "dc.type");
      return [{
        id: `tbmm:${identifier}`,
        title,
        institution: "TBMM",
        organization: "Türkiye Büyük Millet Meclisi",
        country: "Türkiye",
        documentType: documentTypeOf(`${type} ${title}`, /kanun|bill|law|legislation/i.test(`${type} ${title}`) ? "Legislation" : "Documents"),
        publicationDate: isoDate(value(item, "dc.date.issued") || value(item, "dc.date.available")),
        snippet: truncate(description || "Official TBMM library and parliamentary publication."),
        url: href,
        sourceIdentifier: identifier,
      }];
    });
  },
};
