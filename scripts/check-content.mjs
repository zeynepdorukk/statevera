// ============================================================
// Repository guards
// ------------------------------------------------------------
//   node scripts/check-content.mjs
//
// Fails the build on the two things that quietly ruin an
// editorial site: corrupted characters and a stale wire.
// ============================================================

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { clusterStories } from "./wire-dedupe.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const problems = [];
const notes = [];

// ------------------------------------------------------------
// 1. Character integrity
// ------------------------------------------------------------

const TEXT_EXTENSIONS = /\.(astro|ts|tsx|js|mjs|json|md|mdx|css|html|txt|yml|yaml)$/i;
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", ".astro", ".vscode"]);

const walk = (dir, files = []) => {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, files);
    else if (TEXT_EXTENSIONS.test(entry)) files.push(path);
  }
  return files;
};

// "\u00c2\u00b7", "\u00e2\u20ac\u201d" — UTF-8 read as Windows-1252 and saved again.
const MOJIBAKE = /[\u00c2\u00c3\u00e2][\u0080-\u00ff\u2013\u2014\u2018\u2019\u201a\u201c\u201d\u201e\u2020\u2021\u2026\u2030\u2039\u203a\u20ac\u2122]/g;

const SELF = fileURLToPath(import.meta.url);

let scanned = 0;
for (const file of walk(ROOT)) {
  if (file === SELF) continue;
  scanned++;

  const bytes = readFileSync(file);
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    problems.push(`${relative(ROOT, file)}: starts with a UTF-8 BOM`);
  }

  const text = bytes.toString("utf8");
  const hits = [...text.matchAll(MOJIBAKE)];
  const replacement = text.includes("\ufffd");
  if (hits.length || replacement) {
    const shown = [...new Set(hits.map((h) => h[0]))].slice(0, 6).join(" ");
    problems.push(
      `${relative(ROOT, file)}: corrupted characters ${shown}${replacement ? " (plus U+FFFD)" : ""}`
    );
  }
}
notes.push(`scanned ${scanned} text files for encoding damage`);

// ------------------------------------------------------------
// 2. Wire snapshot health
// ------------------------------------------------------------

const wirePath = join(ROOT, "src/data/wire.json");
if (!existsSync(wirePath)) {
  problems.push("src/data/wire.json is missing — run `npm run wire`");
} else {
  const wire = JSON.parse(readFileSync(wirePath, "utf8"));
  const items = wire.items ?? [];

  if (items.length < 25) problems.push(`wire has only ${items.length} items`);

  const ageHours = (Date.now() - Date.parse(wire.generatedAt)) / 3600000;
  if (!Number.isFinite(ageHours)) problems.push("wire.generatedAt is not a date");
  else if (ageHours > 72) notes.push(`wire snapshot is ${Math.round(ageHours)}h old — run \`npm run wire\``);

  const required = ["id", "title", "url", "publisher", "publishedAt", "category", "region"];
  const bad = items.filter((item) => required.some((key) => !item[key]));
  if (bad.length) problems.push(`${bad.length} wire items are missing required fields`);

  const categories = new Set(["Politics", "Diplomacy", "Security", "Economy", "Geopolitics"]);
  const badCategories = items.filter((item) => !categories.has(item.category));
  if (badCategories.length) problems.push(`${badCategories.length} wire items have an unknown category`);

  const confidences = new Set(["high", "medium", "source"]);
  const badConfidences = items.filter(
    (item) => item.categoryConfidence && !confidences.has(item.categoryConfidence)
  );
  if (badConfidences.length) problems.push(`${badConfidences.length} wire items have an invalid category confidence`);

  const offsite = items.filter((item) => !/^https?:\/\//.test(item.url));
  if (offsite.length) problems.push(`${offsite.length} wire items do not link to a publisher`);

  const ids = new Set(items.map((item) => item.id));
  if (ids.size !== items.length) problems.push("wire contains duplicate ids");

  // Readers should never meet the same event twice under two mastheads.
  const repeated = clusterStories(items).filter((cluster) => cluster.duplicates.length);
  if (repeated.length) {
    const [first] = repeated;
    problems.push(
      `${repeated.length} wire stories are told twice, e.g. "${first.kept.title}" ` +
        `and "${first.duplicates[0].item.title}"`
    );
  }

  notes.push(
    `wire: ${items.length} items, ${items.filter((i) => i.image).length} illustrated, ${Math.round(ageHours)}h old`
  );
}

// ------------------------------------------------------------
// 3. Content sanity
// ------------------------------------------------------------

for (const dir of ["src/content/articles"]) {
  const full = join(ROOT, dir);
  if (!existsSync(full)) continue;
  for (const name of readdirSync(full)) {
    if (!/\.mdx?$/.test(name)) continue;
    const text = readFileSync(join(full, name), "utf8");
    if (!text.startsWith("---")) problems.push(`${dir}/${name}: no frontmatter`);
    if (/\bsample:\s*true/.test(text)) problems.push(`${dir}/${name}: still flagged as sample content`);
    if (/^heroImage:\s*["']?\s*["']?\s*$/m.test(text) && !/^draft:\s*true/m.test(text)) {
      problems.push(`${dir}/${name}: published with no lead image`);
    }
  }
}

// ------------------------------------------------------------
// 4. No secrets in the build output
// ------------------------------------------------------------
// The editor runs in the browser, so anything the bundler can see ends up
// public. This walks dist/ (when it exists) looking for credential shapes.
// It reports the file and the kind of token only — never the value.

const SECRET_PATTERNS = [
  [/\bsk-[A-Za-z0-9_-]{20,}/g, "OpenAI key"],
  [/\bsk-ant-[A-Za-z0-9_-]{20,}/g, "Anthropic key"],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}/g, "GitHub fine-grained token"],
  [/\bghp_[A-Za-z0-9]{30,}/g, "GitHub classic token"],
  [/\bAIza[A-Za-z0-9_-]{30,}/g, "Google API key"],
];

const distDir = join(ROOT, "dist");
if (existsSync(distDir)) {
  const distFiles = [];
  const walkDist = (dir) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) walkDist(path);
      else if (/\.(js|mjs|html|json|css|xml|txt|map)$/i.test(entry)) distFiles.push(path);
    }
  };
  walkDist(distDir);

  let leaks = 0;
  for (const file of distFiles) {
    const text = readFileSync(file, "utf8");
    for (const [pattern, label] of SECRET_PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(text)) {
        problems.push(`${relative(ROOT, file)}: contains what looks like a ${label}`);
        leaks++;
      }
    }
  }
  notes.push(`scanned ${distFiles.length} built files for credentials${leaks ? "" : " — none found"}`);
} else {
  notes.push("dist/ not built yet — credential scan skipped");
}

// ------------------------------------------------------------

for (const note of notes) console.log(`  ${note}`);
if (problems.length) {
  console.error(`\n${problems.length} problem(s):`);
  for (const problem of problems) console.error(`  ✗ ${problem}`);
  process.exit(1);
}
console.log("\nAll checks passed.");
