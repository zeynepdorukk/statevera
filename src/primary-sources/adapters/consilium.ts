import { documentTypeOf, fetchText, feedResult, parseFeedItems } from "../common";
import type { PrimarySourceAdapter } from "../types";

const PRESS_RELEASES = "https://www.consilium.europa.eu/en/rss/pressreleases.ashx";

export const consilium: PrimarySourceAdapter = {
  id: "consilium",
  institution: "European Council / Consilium",
  organization: "Council of the European Union",
  country: "European Union",
  async search({ query, signal }) {
    const xml = await fetchText(PRESS_RELEASES, signal, "application/rss+xml, application/xml, text/xml");
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    return parseFeedItems(xml)
      .filter((item) => terms.every((term) => `${item.title} ${item.snippet}`.toLowerCase().includes(term)))
      .slice(0, 12)
      .map((item) => feedResult(
        { institution: "European Council / Consilium", organization: "Council of the European Union", country: "European Union" },
        item,
        documentTypeOf(`${item.title} ${item.snippet}`, "Statements"),
      ));
  },
};
