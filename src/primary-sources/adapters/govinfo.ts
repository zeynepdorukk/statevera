import { cleanUrl, documentTypeOf, fetchJson, isoDate, truncate } from "../common";
import type { PrimarySourceAdapter } from "../types";

interface GovInfoRow {
  title?: string;
  packageId?: string;
  granuleId?: string;
  dateIssued?: string;
  date?: string;
  description?: string;
  resultLink?: string;
  detailsLink?: string;
  htmlLink?: string;
  pdfLink?: string;
  download?: { pdfLink?: string };
  collectionCode?: string;
}

function publicDetailsUrl(packageId?: string, granuleId?: string): string {
  const packageValue = packageId?.trim();
  if (!packageValue) return "";
  const granuleValue = granuleId?.trim();
  const path = [packageValue, granuleValue].filter((value): value is string => Boolean(value)).map((value) => encodeURIComponent(value)).join("/");
  return cleanUrl(`https://www.govinfo.gov/app/details/${path}`);
}

function sourceUrl(row: GovInfoRow): string {
  // GovInfo returns API links in some search responses. Those links require
  // an API key when opened in a browser, so always prefer the public details
  // permalink built from the package and granule identifiers.
  const publicUrl = publicDetailsUrl(row.packageId, row.granuleId);
  if (publicUrl) return publicUrl;

  const candidate = row.resultLink || row.detailsLink || row.htmlLink || row.pdfLink || row.download?.pdfLink || "";
  try {
    const parsed = new URL(candidate);
    if (parsed.hostname === "api.govinfo.gov") {
      const match = parsed.pathname.match(/^\/packages\/([^/]+)(?:\/granules\/([^/]+))?/i);
      if (match?.[1]) return publicDetailsUrl(match[1], match[2]);
    }
  } catch {
    // Fall through to the shared URL sanitizer for malformed source data.
  }
  return cleanUrl(candidate);
}

export const govInfo: PrimarySourceAdapter = {
  id: "govinfo",
  institution: "U.S. GovInfo",
  organization: "U.S. Government Publishing Office",
  country: "United States",
  async search({ query, env, signal }) {
    // DEMO_KEY is deliberately limited and only used when the deployment has
    // not supplied its own server-side key. It never reaches the browser.
    const key = env.GOVINFO_API_KEY?.trim() || "DEMO_KEY";
    const endpoint = `https://api.govinfo.gov/search?api_key=${encodeURIComponent(key)}`;
    const data = await fetchJson<{ results?: GovInfoRow[] }>(endpoint, {
      method: "POST",
      signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query,
        pageSize: "12",
        offsetMark: "*",
        sorts: [
          { field: "score", sortOrder: "DESC" },
          { field: "publishdate", sortOrder: "DESC" },
        ],
      }),
    });
    return (data.results ?? []).flatMap((row) => {
      const title = row.title?.trim() ?? "";
      const href = sourceUrl(row);
      if (!title || !href) return [];
      const identifier = row.granuleId || row.packageId || href;
      return [{
        id: `govinfo:${identifier}`,
        title,
        institution: "U.S. GovInfo",
        organization: "U.S. Government Publishing Office",
        country: "United States",
        documentType: documentTypeOf(`${row.collectionCode ?? ""} ${title}`, "Documents"),
        publicationDate: isoDate(row.dateIssued || row.date),
        snippet: truncate(row.description ?? row.collectionCode ?? "Official U.S. Government document."),
        url: href,
        sourceIdentifier: identifier,
      }];
    });
  },
};
