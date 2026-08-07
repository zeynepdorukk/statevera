import { cleanUrl, documentTypeOf, fetchJson, isoDate, truncate } from "../common";
import type { PrimarySourceAdapter } from "../types";

interface FederalRegisterDocument {
  title?: string;
  type?: string;
  abstract?: string;
  publication_date?: string;
  document_number?: string;
  html_url?: string;
  pdf_url?: string;
}

export const federalRegister: PrimarySourceAdapter = {
  id: "federal-register",
  institution: "Federal Register",
  organization: "Office of the Federal Register",
  country: "United States",
  async search({ query, signal }) {
    const url = new URL("https://www.federalregister.gov/api/v1/documents.json");
    url.searchParams.set("per_page", "12");
    url.searchParams.set("order", "newest");
    url.searchParams.set("conditions[term]", query);
    const data = await fetchJson<{ results?: FederalRegisterDocument[] }>(url.toString(), { signal });
    return (data.results ?? []).flatMap((row) => {
      const title = row.title?.trim() ?? "";
      const href = cleanUrl(row.html_url || row.pdf_url || "");
      if (!title || !href) return [];
      return [{
        id: `federal-register:${row.document_number || href}`,
        title,
        institution: "Federal Register",
        organization: "Office of the Federal Register",
        country: "United States",
        documentType: documentTypeOf(`${row.type ?? ""} ${title}`, row.type?.toLowerCase().includes("rule") ? "Legislation" : "Documents"),
        publicationDate: isoDate(row.publication_date),
        snippet: truncate(row.abstract ?? row.type ?? "Official Federal Register document."),
        url: href,
        sourceIdentifier: row.document_number || href,
      }];
    });
  },
};
