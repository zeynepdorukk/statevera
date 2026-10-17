// ============================================================
// Internal link check over the built site.
// ------------------------------------------------------------
// Every href/src on every built page that points inside the site must resolve
// to a file in dist/. Runs after `astro build` in `npm run verify`, so a renamed
// page, a dropped image or a typo in a nav link fails CI instead of shipping a
// 404. External links are not fetched (they are other people's servers).
//
//   node scripts/check-links.mjs [distDir]
// ============================================================

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const dist = resolve(process.argv[2] ?? "dist");
const SITE = "https://statevera.org";

if (!existsSync(dist)) {
  console.error(`check-links: ${dist} does not exist; run the build first.`);
  process.exit(1);
}

/** @param {string} dir @returns {string[]} */
const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });

const pages = walk(dist).filter((file) => file.endsWith(".html"));

/** Redirect stubs Astro writes for legacy addresses count as pages. */
const resolves = (/** @type {string} */ pathname) => {
  const clean = decodeURIComponent(pathname.split("#")[0].split("?")[0]);
  if (!clean || clean === "/") return existsSync(join(dist, "index.html"));
  const target = join(dist, clean);
  if (existsSync(target) && statSync(target).isFile()) return true;
  if (existsSync(join(target, "index.html"))) return true;
  if (existsSync(`${target.replace(/\/$/, "")}.html`)) return true;
  return false;
};

const ATTR = /\s(?:href|src)=["']([^"']+)["']/gi;
const SRCSET = /\ssrcset=["']([^"']+)["']/gi;

/** @type {Map<string, Set<string>>} */
const broken = new Map();
let checked = 0;

for (const page of pages) {
  const html = readFileSync(page, "utf8")
    // Inline scripts and JSON-LD carry strings that look like attributes.
    .replace(/<script\b[\s\S]*?<\/script>/gi, "");
  const urls = [...html.matchAll(ATTR)].map((m) => m[1]);
  for (const [, set] of html.matchAll(SRCSET)) {
    for (const part of set.split(",")) urls.push(part.trim().split(/\s+/)[0]);
  }
  for (const raw of urls) {
    let pathname = "";
    if (raw.startsWith(SITE)) pathname = raw.slice(SITE.length) || "/";
    else if (raw.startsWith("/") && !raw.startsWith("//")) pathname = raw;
    else continue;
    if (/^\/(cdn-cgi)\//.test(pathname)) continue;
    checked++;
    if (!resolves(pathname)) {
      const key = pathname.split("#")[0];
      if (!broken.has(key)) broken.set(key, new Set());
      broken.get(key).add(relative(dist, page));
    }
  }
}

if (broken.size > 0) {
  console.error(`check-links: ${broken.size} internal address(es) do not resolve:`);
  for (const [path, from] of broken) {
    const list = [...from];
    console.error(`  ${path}  ← ${list.slice(0, 3).join(", ")}${list.length > 3 ? ` (+${list.length - 3} more)` : ""}`);
  }
  process.exit(1);
}

console.log(`check-links: ${checked} internal links across ${pages.length} pages, all resolve.`);
