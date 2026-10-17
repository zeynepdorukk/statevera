import { describe, expect, it } from "vitest";
import { KEY, urlsFor } from "../scripts/indexnow.mjs";
import { readFileSync } from "node:fs";

const mdx = (language: string, draft = false) => `---\ntitle: "x"\nlanguage: "${language}"\ndraft: ${draft}\n---\nBody`;

describe("indexnow urlsFor", () => {
  it("maps an English piece to its article, the Journal and home", () => {
    expect(urlsFor(["src/content/articles/a-piece.mdx"], () => mdx("en"))).toEqual([
      "https://statevera.org/",
      "https://statevera.org/articles/a-piece/",
      "https://statevera.org/journal/",
    ]);
  });

  it("maps a Turkish piece under /tr", () => {
    expect(urlsFor(["src/content/articles/bir-yazi.mdx"], () => mdx("tr"))).toContain(
      "https://statevera.org/tr/articles/bir-yazi/"
    );
  });

  it("skips drafts and files outside the Journal", () => {
    expect(urlsFor(["src/content/articles/wip.mdx", "src/data/wire.json"], () => mdx("en", true))).toEqual([]);
  });

  it("still reports a deleted piece, in both languages", () => {
    const urls = urlsFor(["src/content/articles/gone.mdx"], () => null);
    expect(urls).toContain("https://statevera.org/articles/gone/");
    expect(urls).toContain("https://statevera.org/tr/articles/gone/");
  });

  it("serves its key file from public/", () => {
    expect(readFileSync(`public/${KEY}.txt`, "utf8")).toBe(KEY);
  });
});
