import { cleanUrl, documentTypeOf, fetchJson, isoDate, truncate } from "../common";
import type { PrimarySourceAdapter } from "../types";

interface GovUkResult {
  title?: string;
  description?: string;
  link?: string;
  public_timestamp?: string;
  document_type?: string;
  format?: string;
  organisations?: { title?: string }[];
}

export const govUk: PrimarySourceAdapter = {
  id: "gov-uk",
  institution: "GOV.UK",
  organization: "UK Government",
  country: "United Kingdom",
  async search({ query, signal }) {
    const url = new URL("https://www.gov.uk/api/search.json");
    url.searchParams.set("q", query);
    url.searchParams.set("count", "12");
    url.searchParams.set("order", "public_timestamp");
    const data = await fetchJson<{ results?: GovUkResult[] }>(url.toString(), { signal });
    return (data.results ?? []).flatMap((row) => {
      const title = row.title?.trim() ?? "";
      const href = cleanUrl(row.link ?? "", "https://www.gov.uk");
      if (!title || !href || !href.startsWith("https://www.gov.uk/")) return [];
      const typeText = `${row.document_type ?? ""} ${row.format ?? ""} ${title}`;
      return [{
        id: `gov-uk:${href}`,
        title,
        institution: "GOV.UK",
        organization: row.organisations?.map((org) => org.title).filter(Boolean).join(", ") || "UK Government",
        country: "United Kingdom",
        documentType: documentTypeOf(typeText, "Documents"),
        publicationDate: isoDate(row.public_timestamp),
        snippet: truncate(row.description ?? row.document_type ?? "Official UK Government document."),
        url: href,
        sourceIdentifier: href.replace("https://www.gov.uk/", ""),
      }];
    });
  },
};
