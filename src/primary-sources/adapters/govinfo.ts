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
      const href = cleanUrl(row.resultLink || row.detailsLink || row.htmlLink || row.pdfLink || row.download?.pdfLink || "");
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
