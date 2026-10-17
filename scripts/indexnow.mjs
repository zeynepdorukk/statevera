// Tells IndexNow engines (Bing, Yandex, Seznam, Naver…) the moment a Journal
// piece is published, edited or withdrawn, instead of waiting for a crawl.
// Yandex matters here: it is the second search engine in Türkiye.
//
// Run by deploy.yml after Pages finishes, with the files the push touched:
//   node scripts/indexnow.mjs --submit $(git diff --name-only BEFORE SHA)
// Without --submit it only prints the URLs it would send.
// Wire refreshes arrive as workflow_dispatch and send nothing.
import { existsSync, readFileSync } from "node:fs";

export const SITE = "https://statevera.org";
// The key is public by design: engines fetch it from /<key>.txt to prove
// this site asked. It has no power beyond that.
export const KEY = "8795fb120850998aa999253ed48f3a54";
const ARTICLE = /^src\/content\/articles\/([a-z0-9-]+)\.mdx$/;

/** Front-matter value of one simple key, or undefined. */
function field(source, name) {
  const head = source.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
  return head.match(new RegExp(`^${name}:\\s*"?([^"\\n]*)"?\\s*$`, "m"))?.[1];
}

/**
 * The public URLs a set of changed repo paths affects. `read` returns a
 * file's text, or null when the push deleted it (its URL is still sent, so
 * engines drop the page sooner).
 */
export function urlsFor(paths, read = (p) => (existsSync(p) ? readFileSync(p, "utf8") : null)) {
  const urls = new Set();
  for (const path of paths) {
    const match = path.match(ARTICLE);
    if (!match) continue;
    const source = read(path);
    let language;
    if (source !== null) {
      if (field(source, "draft") === "true") continue;
      language = field(source, "language");
    }
    // A deleted file no longer says its language: send both forms; the wrong
    // one is a 404 either way, which is what we want engines to see.
    const prefixes = language === "tr" ? ["/tr"] : language === "en" ? [""] : ["", "/tr"];
    for (const prefix of prefixes) {
      urls.add(`${SITE}${prefix}/articles/${match[1]}/`);
      urls.add(`${SITE}${prefix}/journal/`);
      urls.add(`${SITE}${prefix}/`);
    }
  }
  return [...urls].sort();
}

async function main() {
  const args = process.argv.slice(2);
  const submit = args.includes("--submit");
  const urls = urlsFor(args.filter((a) => a !== "--submit"));
  if (urls.length === 0) return console.log("indexnow: no published Journal pages changed.");
  console.log(`indexnow: ${urls.length} URL(s)\n  ${urls.join("\n  ")}`);
  if (!submit) return;
  const response = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ host: new URL(SITE).host, key: KEY, keyLocation: `${SITE}/${KEY}.txt`, urlList: urls }),
  });
  // 200/202 are success; anything else is logged, never fails the deploy.
  console.log(`indexnow: ${response.status} ${response.statusText}`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
