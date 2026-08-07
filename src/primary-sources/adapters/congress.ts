import { cleanUrl, documentTypeOf, fetchJson, isoDate, truncate } from "../common";
import type { PrimarySourceAdapter } from "../types";

interface CongressBill {
  congress?: number;
  type?: string;
  number?: string;
  title?: string;
  updateDate?: string;
  latestAction?: { text?: string; actionDate?: string };
}

function billPath(type: string): string {
  return ({
    hr: "house-bill",
    s: "senate-bill",
    hjres: "house-joint-resolution",
    sjres: "senate-joint-resolution",
    hconres: "house-concurrent-resolution",
    sconres: "senate-concurrent-resolution",
    hres: "house-resolution",
    sres: "senate-resolution",
  } as Record<string, string>)[type.toLowerCase()] ?? type.toLowerCase();
}

export const congress: PrimarySourceAdapter = {
  id: "congress-gov",
  institution: "Congress.gov",
  organization: "U.S. Congress",
  country: "United States",
  async search({ query, env, signal }) {
    const key = env.CONGRESS_API_KEY?.trim() || "DEMO_KEY";
    const url = new URL("https://api.congress.gov/v3/bill");
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", "250");
    url.searchParams.set("api_key", key);
    const data = await fetchJson<{ bills?: CongressBill[] }>(url.toString(), { signal });
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    return (data.bills ?? [])
      .filter((bill) => terms.every((term) => `${bill.title ?? ""} ${bill.latestAction?.text ?? ""}`.toLowerCase().includes(term)))
      .slice(0, 12)
      .flatMap((bill) => {
        const title = bill.title?.trim() ?? "";
        const type = bill.type?.trim() ?? "";
        const number = bill.number?.trim() ?? "";
        if (!title || !type || !number || !bill.congress) return [];
        const href = cleanUrl(`https://www.congress.gov/bill/${bill.congress}th-congress/${billPath(type)}/${number}`);
        const identifier = `${bill.congress}-${type}-${number}`;
        return [{
          id: `congress-gov:${identifier}`,
          title,
          institution: "Congress.gov",
          organization: "U.S. Congress",
          country: "United States",
          documentType: documentTypeOf(`${title} ${bill.latestAction?.text ?? ""}`, "Legislation"),
          publicationDate: isoDate(bill.latestAction?.actionDate || bill.updateDate),
          snippet: truncate(bill.latestAction?.text ?? "Official congressional legislation."),
          url: href,
          sourceIdentifier: identifier,
        }];
      });
  },
};
