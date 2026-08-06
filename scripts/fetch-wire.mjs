// ============================================================
// STATEVERA WIRE — build-time aggregator
// ------------------------------------------------------------
//   node scripts/fetch-wire.mjs [--dry]
//
// Pulls public RSS/Atom feeds, normalises them into the site's
// own category/region vocabulary and writes src/data/wire.json.
//
// The output file is committed. A failed fetch therefore never
// breaks a build or empties the site — the last good snapshot
// stays in place.
// ============================================================

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sources, categoryRules, regionRules, excludeTerms, compileTerms } from "./wire-sources.mjs";
import { dedupeStories } from "./wire-dedupe.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "src/data/wire.json");
const DRY = process.argv.includes("--dry");
const EXPLAIN = process.argv.includes("--explain");

const MAX_ITEMS = 220;
const MAX_AGE_DAYS = 10;
const TIMEOUT_MS = 20000;

// ------------------------------------------------------------
// Text handling — every headline on the site passes through here,
// so this is where character corruption is prevented.
// ------------------------------------------------------------

const NAMED_ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "\u2013",
  mdash: "\u2014", lsquo: "\u2018", rsquo: "\u2019", ldquo: "\u201c", rdquo: "\u201d",
  hellip: "\u2026", eacute: "é", egrave: "è", agrave: "à", ccedil: "ç", uuml: "ü",
  ouml: "ö", auml: "ä", szlig: "ß", ntilde: "ñ", iacute: "í", oacute: "ó", uacute: "ú",
  aacute: "á", middot: "\u00b7", bull: "\u2022", euro: "\u20ac", pound: "£", deg: "°",
  laquo: "«", raquo: "»", times: "×", shy: "", zwnj: "", lrm: "", rlm: "",
};

function decodeEntities(input) {
  let out = String(input ?? "");
  // Feeds are frequently double-encoded (&amp;#8217;) — two passes clears it.
  for (let pass = 0; pass < 2; pass++) {
    out = out.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (whole, body) => {
      if (body[0] === "#") {
        const code = body[1] === "x" || body[1] === "X"
          ? parseInt(body.slice(2), 16)
          : parseInt(body.slice(1), 10);
        if (!Number.isFinite(code) || code < 9 || code > 0x10ffff) return whole;
        try {
          return String.fromCodePoint(code);
        } catch {
          return whole;
        }
      }
      const named = NAMED_ENTITIES[body.toLowerCase()];
      return named === undefined ? whole : named;
    });
  }
  return out;
}

// cp1252 high range, for undoing "UTF-8 bytes read as Windows-1252".
const CP1252_TO_BYTE = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86,
  0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c,
  0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95,
  0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b,
  0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f,
};
const utf8Strict = new TextDecoder("utf-8", { fatal: true });

/** Undo one round of mojibake, one sequence at a time (non-greedy). */
export function repairMojibake(text) {
  if (!/[\u00c2\u00c3\u00e2]/.test(text)) return text;
  const chars = [...text];
  let out = "";
  for (let i = 0; i < chars.length; i++) {
    const lead = chars[i].codePointAt(0);
    if (lead === 0xc2 || lead === 0xc3 || lead === 0xe2) {
      let matched = "";
      for (const len of [2, 3, 4]) {
        const seq = chars.slice(i, i + len);
        if (seq.length < len) continue;
        const bytes = seq.map((c) => {
          const cp = c.codePointAt(0);
          return cp <= 0xff ? cp : CP1252_TO_BYTE[cp];
        });
        if (bytes.some((b) => b === undefined)) continue;
        try {
          const decoded = utf8Strict.decode(Uint8Array.from(bytes));
          if (decoded.length === 1 && decoded.codePointAt(0) > 0x7f) {
            matched = decoded;
            i += len - 1;
            break;
          }
        } catch {
          /* not a valid sequence at this length */
        }
      }
      out += matched || chars[i];
    } else {
      out += chars[i];
    }
  }
  return out;
}

const stripCdata = (s) => String(s ?? "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
const stripTags = (s) => String(s ?? "").replace(/<[^>]*>/g, " ");

function cleanText(raw, { maxLength = 0 } = {}) {
  let out = stripCdata(raw);
  out = decodeEntities(out);
  out = stripTags(out);
  out = decodeEntities(out);
  out = repairMojibake(out);
  out = out.replace(/\s+/g, " ").replace(/\u00a0/g, " ").trim();
  out = out.normalize("NFC");
  // Drop control characters and lone surrogates that break JSON consumers.
  out = out.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, "");
  if (maxLength && out.length > maxLength) {
    const cut = out.slice(0, maxLength);
    const lastStop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf(" "));
    out = (lastStop > maxLength * 0.6 ? cut.slice(0, lastStop) : cut).trim() + "\u2026";
  }
  return out;
}

// ------------------------------------------------------------
// Feed parsing (RSS 2.0, RDF and Atom) without dependencies
// ------------------------------------------------------------

const tagContent = (block, tag) => {
  const m = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? m[1] : "";
};

const tagAttr = (block, tag, name) => {
  const m = block.match(new RegExp(`<${tag}\\b[^>]*?\\s${name}=["']([^"']+)["']`, "i"));
  return m ? m[1] : "";
};

function itemLink(block) {
  // Atom puts the URL in an attribute; RSS puts it in the element body.
  const alternate = block.match(/<link\b[^>]*\brel=["']alternate["'][^>]*\bhref=["']([^"']+)["']/i);
  if (alternate) return alternate[1];
  const body = tagContent(block, "link").trim();
  if (body && !body.startsWith("<")) return decodeEntities(stripCdata(body)).trim();
  const href = tagAttr(block, "link", "href");
  if (href) return decodeEntities(href).trim();
  const guid = tagContent(block, "guid").trim();
  return /^https?:/i.test(guid) ? decodeEntities(stripCdata(guid)).trim() : "";
}

/**
 * Feeds advertise the same picture at several widths. Take the widest, and never
 * rewrite the URL: Guardian and other CDNs sign the query string, so editing the
 * width parameter turns a working image into a 401.
 */
function itemImage(block) {
  /** @type {{url: string, width: number}[]} */
  const candidates = [];

  for (const tag of ["media:content", "media:thumbnail"]) {
    const re = new RegExp(`<${tag}\\b[^>]*>`, "gi");
    for (const [element] of block.matchAll(re)) {
      const url = (element.match(/\surl=["']([^"']+)["']/i) ?? [])[1];
      if (!url) continue;
      const type = (element.match(/\s(?:type|medium)=["']([^"']+)["']/i) ?? [])[1] ?? "";
      if (type && !/^image/i.test(type) && type !== "image") continue;
      const width = Number((element.match(/\swidth=["'](\d+)["']/i) ?? [])[1] ?? 0);
      candidates.push({ url: decodeEntities(url).trim(), width });
    }
  }

  const enclosure = block.match(/<enclosure\b[^>]*>/i)?.[0];
  if (enclosure && /type=["']image/i.test(enclosure)) {
    const url = (enclosure.match(/\surl=["']([^"']+)["']/i) ?? [])[1];
    if (url) candidates.push({ url: decodeEntities(url).trim(), width: 0 });
  }

  for (const field of ["content:encoded", "description"]) {
    const inline = tagContent(block, field).match(/<img[^>]+src=["']([^"']+)["']/i);
    if (inline) candidates.push({ url: decodeEntities(stripCdata(inline[1])).trim(), width: 0 });
  }

  const usable = candidates.filter((c) => /^https?:\/\//i.test(c.url));
  if (usable.length === 0) return { url: "", width: 0 };

  usable.sort((a, b) => b.width - a.width);
  return usable[0];
}

function itemDate(block) {
  const raw =
    tagContent(block, "pubDate") ||
    tagContent(block, "dc:date") ||
    tagContent(block, "published") ||
    tagContent(block, "updated") ||
    tagContent(block, "lastBuildDate");
  const parsed = new Date(decodeEntities(stripCdata(raw)).trim());
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseFeed(xml) {
  return [...xml.matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/gi)].map((m) => m[0]);
}

// ------------------------------------------------------------
// Classification
// ------------------------------------------------------------

const compiled = (rules, key) =>
  rules.map((rule) => ({ value: rule[key], re: compileTerms(rule.terms) }));

const CATEGORY_MATCHERS = compiled(categoryRules, "category");
const REGION_MATCHERS = compiled(regionRules, "region");
const EXCLUDE_RE = compileTerms(excludeTerms);

const countMatches = (re, text) => {
  re.lastIndex = 0;
  return (text.match(re) ?? []).length;
};

/**
 * Score every rule and take the strongest, rather than the first match:
 * a headline that mentions one country in passing should not outrank the
 * country it is actually about. Title hits count double.
 */
function classify(matchers, title, summary) {
  let best = null;
  let bestScore = 0;
  for (const { value, re } of matchers) {
    const score = countMatches(re, title) * 2 + countMatches(re, summary);
    if (score > bestScore) {
      bestScore = score;
      best = value;
    }
  }
  return { value: best, score: bestScore };
}

// ------------------------------------------------------------
// Fetch
// ------------------------------------------------------------

async function fetchFeed(source) {
  const res = await fetch(source.url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; StateveraWire/1.0; +https://zeynepdorukk.github.io/statevera)",
      Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  // Decode explicitly as UTF-8 rather than trusting a possibly-wrong charset header.
  const buffer = new Uint8Array(await res.arrayBuffer());
  return new TextDecoder("utf-8").decode(buffer);
}

function toItems(source, xml) {
  const blocks = parseFeed(xml).slice(0, source.take * 3);
  const cutoff = Date.now() - MAX_AGE_DAYS * 86400000;
  const items = [];
  let dropped = 0;

  for (const block of blocks) {
    const title = cleanText(tagContent(block, "title"), { maxLength: 180 });
    const link = itemLink(block);
    if (!title || !/^https?:\/\//i.test(link)) continue;

    const date = itemDate(block);
    if (date && date.getTime() < cutoff) continue;

    const summary = cleanText(
      tagContent(block, "description") || tagContent(block, "summary") || tagContent(block, "content"),
      { maxLength: 260 }
    );

    if (countMatches(EXCLUDE_RE, `${title} ${summary}`) > 0) {
      dropped++;
      continue;
    }

    const matched = classify(CATEGORY_MATCHERS, title, summary);

    // Relevance gate: a general news desk item must read as international affairs,
    // and must do so on the strength of the headline rather than a passing mention.
    // Feeds that only ever publish on-topic material carry their own category prior.
    const category = matched.score >= 2 ? matched.value : source.category;
    if (!category) {
      dropped++;
      continue;
    }

    const image = itemImage(block);

    items.push({
      id: createHash("sha1").update(link).digest("hex").slice(0, 12),
      title,
      summary: summary === title ? "" : summary,
      url: link,
      publisher: source.publisher,
      publisherHome: source.home,
      sourceId: source.id,
      publishedAt: (date ?? new Date()).toISOString(),
      image: image.url,
      imageWidth: image.width,
      category,
      region: classify(REGION_MATCHERS, title, summary).value ?? source.region ?? "Global",
      weight: source.weight,
    });

    if (items.length >= source.take) break;
  }
  return { items, dropped };
}

// ------------------------------------------------------------
// Dedupe
// ------------------------------------------------------------
// One event, one entry. `wire-dedupe.mjs` groups every copy of a story —
// across outlets, not just within one feed — and hands back the best one.

// ------------------------------------------------------------
// Main
// ------------------------------------------------------------

const previous = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : { items: [] };

const results = await Promise.allSettled(
  sources.map(async (source) => {
    const xml = await fetchFeed(source);
    return { source, ...toItems(source, xml) };
  })
);

let ok = 0;
let failed = [];
let collected = [];

results.forEach((result, i) => {
  const source = sources[i];
  if (result.status === "fulfilled" && result.value.items.length) {
    ok++;
    collected.push(...result.value.items);
    const { items, dropped } = result.value;
    console.log(
      `  ok    ${source.id.padEnd(24)} ${String(items.length).padStart(2)} items` +
        (dropped ? `  (${dropped} off-topic)` : "")
    );
  } else {
    failed.push(source.id);
    const why = result.status === "rejected" ? (result.reason?.message ?? result.reason) : "0 items";
    console.log(`  FAIL  ${source.id.padEnd(24)} ${why}`);
  }
});

collected.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
const deduped = dedupeStories(collected);
const items = deduped.items.slice(0, MAX_ITEMS);

console.log(
  `\n${ok}/${sources.length} feeds ok, ${collected.length} raw -> ${deduped.items.length} distinct stories` +
    ` (${deduped.removed} repeats of a story already covered)`
);

const repeated = deduped.clusters.filter((c) => c.duplicates.length).sort((a, b) => b.duplicates.length - a.duplicates.length);
if (repeated.length) {
  const shown = EXPLAIN ? repeated : repeated.slice(0, 5);
  console.log(`\nstories covered by more than one outlet (${repeated.length}):`);
  for (const cluster of shown) {
    console.log(`  keep  [${cluster.kept.publisher}] ${cluster.kept.title}`);
    for (const dup of cluster.duplicates) {
      console.log(`   drop [${dup.item.publisher}] ${dup.item.title}`);
      if (EXPLAIN) console.log(`        ${dup.reason}`);
    }
  }
  if (!EXPLAIN && repeated.length > shown.length) {
    console.log(`  ...${repeated.length - shown.length} more (run with --explain)`);
  }
}

// ------------------------------------------------------------
// Verify pictures
// ------------------------------------------------------------
// A hotlinked image that 401s or 403s would render as a broken box on the site,
// so every candidate is fetched once here and dropped if it does not come back
// as a real image. `imageWidth` then tells the layout whether it is big enough
// to lead with.

const withImage = items.filter((i) => i.image);
console.log(`\nverifying ${withImage.length} images...`);

const verify = async (item) => {
  try {
    const res = await fetch(item.image, {
      signal: AbortSignal.timeout(12000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; StateveraWire/1.0)" },
    });
    const type = res.headers.get("content-type") ?? "";
    const length = Number(res.headers.get("content-length") ?? 0);
    if (!res.ok || !type.startsWith("image/") || (length && length < 2000)) {
      item.image = "";
      item.imageWidth = 0;
      return false;
    }
    return true;
  } catch {
    item.image = "";
    item.imageWidth = 0;
    return false;
  }
};

let verified = 0;
for (let i = 0; i < withImage.length; i += 12) {
  const batch = withImage.slice(i, i + 12);
  const results = await Promise.all(batch.map(verify));
  verified += results.filter(Boolean).length;
}
console.log(`${verified}/${withImage.length} images usable`);

// Fail-safe: never replace a healthy snapshot with a broken one.
const previousCount = previous.items?.length ?? 0;
if (items.length < 25 || (previousCount > 40 && items.length < previousCount * 0.4)) {
  console.error(
    `\nRefusing to write: got ${items.length} items, previous snapshot has ${previousCount}.`
  );
  console.error("Keeping the existing wire.json. Failed feeds:", failed.join(", ") || "none");
  process.exit(1);
}

const payload = {
  generatedAt: new Date().toISOString(),
  sourceCount: ok,
  failedSources: failed,
  items,
};

if (DRY) {
  console.log("\n--dry: not writing. Sample:");
  console.log(JSON.stringify(items.slice(0, 3), null, 2));
} else {
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(payload, null, 2) + "\n", "utf8");
  console.log(`\nWrote ${OUT}`);
}

const byCategory = {};
const byRegion = {};
for (const i of items) {
  byCategory[i.category] = (byCategory[i.category] ?? 0) + 1;
  byRegion[i.region] = (byRegion[i.region] ?? 0) + 1;
}
console.log("categories:", byCategory);
console.log("regions   :", byRegion);
console.log("with image:", items.filter((i) => i.image).length, "/", items.length);
