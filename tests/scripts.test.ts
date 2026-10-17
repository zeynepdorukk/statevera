import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dedupeStories, stemWord } from "../scripts/wire-dedupe.mjs";
import { sources } from "../scripts/wire-sources.mjs";
import { cleanUrl, documentTypeOf, isoDate, parseFeedItems, truncate } from "../src/primary-sources/common";

const story = (over: Record<string, unknown>) => ({
  id: Math.random().toString(36).slice(2),
  summary: "",
  url: "https://example.com/" + Math.random().toString(36).slice(2),
  publisher: "Example",
  publisherHome: "https://example.com",
  sourceId: "example",
  publishedAt: "2026-10-17T10:00:00.000Z",
  image: "",
  imageWidth: 0,
  category: "Politics",
  categoryConfidence: "high",
  region: "Europe",
  weight: 2,
  ...over,
});

describe("wire dedupe", () => {
  it("folds one event reported by two outlets into one entry", () => {
    const items = [
      story({ title: "Zelenskyy says Putin is looking to cause Ukraine-wide blackout", publisher: "POLITICO Europe" }),
      story({ title: "Zelenskyy says Putin looking to cause Ukraine-wide blackout this winter", publisher: "Deutsche Welle", publishedAt: "2026-10-17T12:00:00.000Z" }),
      story({ title: "Egypt's Sisi declares his presidency will end in 2030", region: "Middle East" }),
    ];
    const { items: kept, removed } = dedupeStories(items);
    expect(removed).toBe(1);
    expect(kept).toHaveLength(2);
  });

  it("keeps the committed snapshot stable: nothing left to fold", () => {
    const snapshot = JSON.parse(readFileSync("src/data/wire.json", "utf8")) as { items: unknown[] };
    expect(dedupeStories(snapshot.items).removed).toBe(0);
  });

  it("stems only the endings that split stories", () => {
    expect(stemWord("sanctions")).toBe("sanction");
    expect(stemWord("talks")).toBe("talk");
    expect(stemWord("status")).toBe("status");
  });

  it("has a unique id and an https feed for every source", () => {
    const ids = sources.map((source: { id: string }) => source.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const source of sources as { url: string }[]) expect(source.url).toMatch(/^https:\/\//);
  });
});

describe("primary-source parsing", () => {
  it("parses RSS and Atom alike", () => {
    const xml = `
      <rss><channel>
        <item><title>NATO &amp; partners meet</title><link>https://www.nato.int/a</link>
          <description><![CDATA[<p>Allies <b>agree</b></p>]]></description><pubDate>Fri, 16 Oct 2026 09:00:00 GMT</pubDate></item>
        <item><title></title><link>https://x</link></item>
      </channel></rss>
      <feed><entry><title>Council conclusions</title><link href="https://www.consilium.europa.eu/b"/><updated>2026-10-15T08:00:00Z</updated></entry></feed>`;
    const items = parseFeedItems(xml);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ title: "NATO & partners meet", url: "https://www.nato.int/a" });
    expect(items[0].publicationDate).toBe("2026-10-16T09:00:00.000Z");
    expect(items[1].url).toBe("https://www.consilium.europa.eu/b");
  });

  it("refuses non-web URLs", () => {
    expect(cleanUrl("javascript:alert(1)")).toBe("");
    expect(cleanUrl("/doc/1", "https://www.mfa.gov.tr")).toBe("https://www.mfa.gov.tr/doc/1");
  });

  it("reads European dates and epoch seconds", () => {
    expect(isoDate("16.10.2026")).toBe("2026-10-16T00:00:00.000Z");
    expect(isoDate(1_760_000_000)).toMatch(/^2025-10-09/);
    expect(isoDate("nonsense")).toBe("");
  });

  it("classifies documents and truncates snippets", () => {
    expect(documentTypeOf("Council adopts restrictive measures")).toBe("Sanctions");
    expect(documentTypeOf("Remarks by the Secretary General")).toBe("Speeches");
    expect(documentTypeOf("Joint communiqué of the ministers")).toBe("Statements");
    expect(documentTypeOf("Bilateral agreements signed")).toBe("Treaties");
    expect(documentTypeOf("Annual report")).toBe("Documents");
    expect(truncate("x".repeat(400)).length).toBe(320);
  });
});
