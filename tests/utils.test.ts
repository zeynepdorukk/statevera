import { describe, expect, it } from "vitest";
import { remoteImage, remoteSrcset, snapWidth } from "../src/utils/remote-images";
import { contentsOf } from "../src/utils/contents";
import { splitFeatures, type WireItem } from "../src/data/wire";

describe("remoteImage", () => {
  it("asks NPR's Brightspot CDN for the slot's size instead of the 6000px original", () => {
    const raw =
      "https://npr.brightspotcdn.com/dims3/default/strip/false/crop/6000x4000+0+0/resize/6000x4000!/?url=http%3A%2F%2Fnpr-brightspot.s3.amazonaws.com%2Fa.jpg";
    const out = remoteImage(raw, 420);
    expect(out).toContain("/resize/480x320!/");
    expect(out).toContain("/crop/6000x4000+0+0/");
    expect(out).toContain("?url=http%3A%2F%2Fnpr-brightspot");
  });

  it("never asks Brightspot for more than the crop holds", () => {
    const raw = "https://npr.brightspotcdn.com/dims3/default/strip/false/crop/400x300+0+0/resize/400x300!/?url=x";
    expect(remoteImage(raw, 1200)).toContain("/resize/400x300!/");
  });

  it("moves BBC ichef pictures to the nearest width the CDN serves", () => {
    const raw = "https://ichef.bbci.co.uk/ace/standard/240/cpsprodpb/ae0a/live/pic.jpg";
    expect(remoteImage(raw, 420)).toBe("https://ichef.bbci.co.uk/ace/standard/480/cpsprodpb/ae0a/live/pic.jpg");
    expect(remoteImage(raw, 2000)).toBe("https://ichef.bbci.co.uk/ace/standard/1024/cpsprodpb/ae0a/live/pic.jpg");
  });

  it("rewrites the France 24 and RFI width segment", () => {
    const raw = "https://s.france24.com/media/display/abc/w:1024/p:16x9/EN.jpg";
    expect(remoteImage(raw, 112)).toBe("https://s.france24.com/media/display/abc/w:240/p:16x9/EN.jpg");
    expect(remoteImage("https://s.rfi.fr/media/display/x/w:1024/p:16x9/a.jpg", 800)).toContain("/w:800/");
  });

  it("leaves signed Guardian addresses alone: editing them breaks the signature", () => {
    const raw = "https://i.guim.co.uk/img/media/abc/master/5789.jpg?width=700&quality=85&auto=format&fit=max&s=fb36";
    expect(remoteImage(raw, 240)).toBe(raw);
    expect(remoteSrcset(raw, 240)).toBe("");
  });

  it("upgrades http so a picture is never blocked as mixed content", () => {
    expect(remoteImage("http://images.euronews.com/a/640x360.jpg?1", 240)).toBe("https://images.euronews.com/a/640x360.jpg?1");
  });

  it("refuses non-web schemes and tolerates junk", () => {
    expect(remoteImage("javascript:alert(1)", 240)).toBe("");
    expect(remoteImage("data:image/png;base64,AAAA", 240)).toBe("");
    expect(remoteImage("", 240)).toBe("");
    expect(remoteImage(undefined, 240)).toBe("");
    expect(remoteImage("not a url", 240)).toBe("not a url");
  });

  it("builds a 1x/2x srcset only when the CDN can resize", () => {
    const set = remoteSrcset("https://s.france24.com/media/display/abc/w:1024/p:16x9/EN.jpg", 240);
    expect(set).toBe(
      "https://s.france24.com/media/display/abc/w:240/p:16x9/EN.jpg 1x, https://s.france24.com/media/display/abc/w:480/p:16x9/EN.jpg 2x"
    );
  });

  it("snaps to the standard widths", () => {
    expect(snapWidth(1)).toBe(240);
    expect(snapWidth(481)).toBe(800);
    expect(snapWidth(5000)).toBe(1200);
  });
});

describe("contentsOf", () => {
  const h = (depth: number, text: string, slug = text.toLowerCase().replace(/\W+/g, "-")) => ({ depth, text, slug });

  it("lists the h2 sections in order", () => {
    const entries = contentsOf([h(2, "Context"), h(3, "Detail"), h(2, "Turkey"), h(2, "Korea"), h(2, "Conclusion")]);
    expect(entries.map((entry) => entry.text)).toEqual(["Context", "Turkey", "Korea", "Conclusion"]);
  });

  it("falls back to h3 when a piece has no h2", () => {
    expect(contentsOf([h(3, "One"), h(3, "Two"), h(3, "Three")])).toHaveLength(3);
  });

  it("is empty for short pieces, so no one-item list ever renders", () => {
    expect(contentsOf([h(2, "Only"), h(2, "Two")])).toEqual([]);
  });

  it("drops the sources heading, blanks and duplicates", () => {
    const entries = contentsOf([h(2, "A"), h(2, "A", "a"), h(2, "  "), h(2, "B"), h(2, "C"), h(2, "Sources")]);
    expect(entries.map((entry) => entry.text)).toEqual(["A", "B", "C"]);
  });
});

describe("splitFeatures", () => {
  const item = (id: string, image = "", imageWidth = 0): WireItem =>
    ({ id, title: id, summary: "", url: `https://x.test/${id}`, publisher: "X", publisherHome: "", sourceId: "x", publishedAt: "2026-10-17T00:00:00Z", image, imageWidth, category: "Politics", categoryConfidence: "high", region: "Global", weight: 1 }) as WireItem;

  it("takes pictures in whole rows and keeps everything else, in order", () => {
    const items = [item("a", "https://i/a", 800), item("b"), item("c", "https://i/c", 800), item("d", "https://i/d", 100), item("e", "https://i/e", 900), item("f", "https://i/f", 900), item("g")];
    const { features, rest } = splitFeatures(items, { max: 9, columns: 2 });
    expect(features.map((i) => i.id)).toEqual(["a", "c", "e", "f"]);
    expect(rest.map((i) => i.id)).toEqual(["b", "d", "g"]);
  });

  it("drops a ragged last row rather than leave a hole", () => {
    const items = [item("a", "https://i/a", 800), item("b", "https://i/b", 800), item("c", "https://i/c", 800), item("d", "https://i/d", 800)];
    const { features, rest } = splitFeatures(items, { columns: 3 });
    expect(features).toHaveLength(3);
    expect(rest.map((i) => i.id)).toEqual(["d"]);
  });
});
