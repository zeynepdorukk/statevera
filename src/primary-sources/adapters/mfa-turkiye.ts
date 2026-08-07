import { documentTypeOf, fetchText, feedResult, parseFeedItems } from "../common";
import type { PrimarySourceAdapter } from "../types";

const FEEDS = [
  "https://www.mfa.gov.tr/en.rss.mfa?ad9093da-8e71-4678-a1b6-05f297baadc4",
  "https://www.mfa.gov.tr/en.rss.mfa?7342a8d1-3117-42aa-8ddd-01adb5653889",
  "https://www.mfa.gov.tr/en.rss.mfa?45b45ccf-8814-4029-9224-5685e8ca3542",
];

export const mfaTurkiye: PrimarySourceAdapter = {
  id: "mfa-turkiye",
  institution: "Türkiye Ministry of Foreign Affairs",
  organization: "Republic of Türkiye Ministry of Foreign Affairs",
  country: "Türkiye",
  async search({ query, signal }) {
    const feeds = await Promise.all(FEEDS.map((feed) => fetchText(feed, signal, "application/rss+xml, application/xml, text/xml")));
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const seen = new Set<string>();
    return feeds.flatMap((xml) => parseFeedItems(xml))
      .filter((item) => terms.every((term) => `${item.title} ${item.snippet}`.toLowerCase().includes(term)))
      .filter((item) => {
        if (seen.has(item.url)) return false;
        seen.add(item.url);
        return true;
      })
      .slice(0, 12)
      .map((item) => feedResult(
        { institution: "Türkiye Ministry of Foreign Affairs", organization: "Republic of Türkiye Ministry of Foreign Affairs", country: "Türkiye" },
        item,
        documentTypeOf(`${item.title} ${item.snippet}`, "Statements"),
      ));
  },
};
