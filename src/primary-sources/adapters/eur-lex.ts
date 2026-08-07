import { documentTypeOf, fetchJson, isoDate, truncate } from "../common";
import type { PrimarySourceAdapter } from "../types";

interface Binding {
  work?: { value?: string };
  title?: { value?: string; [key: string]: unknown };
  date?: { value?: string };
  celex?: { value?: string };
  rtype?: { value?: string };
}

interface SparqlResponse {
  results?: { bindings?: Binding[] };
}

const SPARQL = "https://publications.europa.eu/webapi/rdf/sparql";

export const eurLex: PrimarySourceAdapter = {
  id: "eur-lex",
  institution: "EUR-Lex",
  organization: "Publications Office of the European Union",
  country: "European Union",
  async search({ query, signal }) {
    const terms = query.toLowerCase().split(/\s+/).map((term) => term.replace(/[^\p{L}\p{N}-]/gu, "")).filter(Boolean);
    if (!terms.length) return [];
    const conditions = terms.map((term) => `CONTAINS(LCASE(STR(?title)), "${term.replace(/"/g, "")}")`).join(" && ");
    const sparql = [
      "PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>",
      "SELECT DISTINCT ?work ?title ?date ?celex ?rtype WHERE {",
      "?work a cdm:work ; cdm:work_title ?title .",
      "OPTIONAL { ?work cdm:work_date_document ?date . }",
      "OPTIONAL { ?work cdm:resource_legal_id_celex ?celex . }",
      "OPTIONAL { ?work cdm:work_has_resource-type ?rtype . }",
      `FILTER(${conditions})`,
      'FILTER(LANG(?title)="en" || LANG(?title)="eng" || LANG(?title)="")',
      "} ORDER BY DESC(?date) LIMIT 12",
    ].join(" ");
    const url = new URL(SPARQL);
    url.searchParams.set("query", sparql);
    url.searchParams.set("format", "JSON");
    const data = await fetchJson<SparqlResponse>(url.toString(), { signal, headers: { accept: "application/sparql-results+json" } });
    return (data.results?.bindings ?? []).flatMap((binding) => {
      const title = binding.title?.value?.trim() ?? "";
      const work = binding.work?.value ?? "";
      const celex = binding.celex?.value?.trim() ?? "";
      if (!title || !work) return [];
      const cellar = work.split("/").pop() ?? work;
      const href = celex
        ? `https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:${encodeURIComponent(celex)}`
        : `https://publications.europa.eu/resource/cellar/${encodeURIComponent(cellar)}`;
      const identifier = celex || cellar;
      return [{
        id: `eur-lex:${identifier}`,
        title,
        institution: "EUR-Lex",
        organization: "Publications Office of the European Union",
        country: "European Union",
        documentType: documentTypeOf(`${binding.rtype?.value ?? ""} ${title}`, "Documents"),
        publicationDate: isoDate(binding.date?.value),
        snippet: truncate(`Official EU legal document${celex ? ` · CELEX ${celex}` : ""}.`),
        url: href,
        sourceIdentifier: identifier,
      }];
    });
  },
};
