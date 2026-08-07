// Fetches each institution's mark once, into public/images/sources/.
//
// The source map shows who the desk queries, so it should show their marks
// rather than a list of names. Hotlinking would put a dozen third-party
// requests on the page and break the day any of them moves, so the files are
// pulled here and committed.
//
// Where an institution publishes a usable mark of its own, that is what is
// taken. Where its favicon is a 16-pixel scrap — or, for the Council, a 403 —
// a public-domain drawing on Wikimedia Commons is named explicitly. Explicitly,
// because a Commons *search* for "NATO logo" returns the emblem of the Russian
// foreign intelligence service, and that is not a mistake worth risking on a
// publication about international affairs.
//
//   node scripts/fetch-source-logos.mjs

import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as wait } from "node:timers/promises";

const OUT = resolve(process.cwd(), "public/images/sources");

/** Named Commons files, all public domain, for the marks not worth taking from source. */
const CURATED = {
  "un-ods": "Emblem of the United Nations.svg",
  "eur-lex": "EUR-Lex logo.svg",
  consilium: "Council of the EU and European Council.svg",
  eeas: "Insignia of the European External Action Service.svg",
  govinfo: "Logo of the United States Government Publishing Office.svg",
  // Congress.gov is published by the Library of Congress, whose seal it carries.
  "congress-gov": "Seal of the United States Library of Congress.svg",
  "mfa-turkiye": "MfaLogoTR.svg",
};

/** Adapter id -> the institution's own home page, for the rest. */
const HOMES = {
  nato: "https://www.nato.int/",
  "federal-register": "https://www.federalregister.gov/",
  "gov-uk": "https://www.gov.uk/",
  tbmm: "https://www.tbmm.gov.tr/",
  osce: "https://www.osce.org/",
};

const AGENT =
  "Mozilla/5.0 (compatible; StateveraSourceMap/1.0; +https://zeynepdorukk.github.io/statevera)";

const EXTENSIONS = {
  "image/svg+xml": "svg",
  "image/png": "png",
  "image/x-icon": "ico",
  "image/vnd.microsoft.icon": "ico",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/** The biggest number in a sizes attribute, so 180x180 beats 32x32. */
const sizeOf = (value) =>
  Math.max(0, ...String(value ?? "").split(/\s+/).map((part) => parseInt(part, 10) || 0));

/** Every icon the page declares, best first. SVG wins outright: it has no size. */
function iconCandidates(html, base) {
  const links = [...html.matchAll(/<link\b[^>]*>/gi)].map((match) => match[0]);
  const found = [];
  for (const tag of links) {
    const rel = (tag.match(/\brel\s*=\s*["']([^"']+)["']/i)?.[1] ?? "").toLowerCase();
    if (!/\bicon\b/.test(rel)) continue;
    const href = tag.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!href) continue;
    const size = /svg/i.test(href) ? 9999 : sizeOf(tag.match(/\bsizes\s*=\s*["']([^"']+)["']/i)?.[1]);
    try {
      found.push({ url: new URL(href, base).toString(), size, apple: rel.includes("apple") });
    } catch {
      /* a malformed href is not worth a stack trace */
    }
  }
  found.sort((a, b) => b.size - a.size || Number(b.apple) - Number(a.apple));
  return found;
}

const get = (url) => fetch(url, { headers: { "user-agent": AGENT }, redirect: "follow" });

async function download(id, url) {
  const response = await get(url);
  if (!response.ok) throw new Error(`${response.status}`);
  const type = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  const extension = EXTENSIONS[type];
  if (!extension) throw new Error(`not an image (${type || "no type"})`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength < 100) throw new Error("suspiciously small");
  await writeFile(resolve(OUT, `${id}.${extension}`), bytes);
  return { extension, bytes: bytes.byteLength };
}

async function commonsUrl(title) {
  const params = new URLSearchParams({
    action: "query", format: "json", formatversion: "2", origin: "*",
    titles: `File:${title}`, prop: "imageinfo", iiprop: "url",
  });
  const body = await (await get(`https://commons.wikimedia.org/w/api.php?${params}`)).json();
  const url = body.query?.pages?.[0]?.imageinfo?.[0]?.url;
  if (!url) throw new Error(`Commons has no "${title}"`);
  return url.split("?")[0];
}

await mkdir(OUT, { recursive: true });

for (const [id, title] of Object.entries(CURATED)) {
  try {
    const { extension, bytes } = await download(id, await commonsUrl(title));
    console.log(`${id.padEnd(18)} ${extension.padEnd(4)} ${String(bytes).padStart(7)} B  commons: ${title}`);
  } catch (error) {
    console.log(`${id.padEnd(18)} FAILED ${error.message}`);
  }
  await wait(350);
}

for (const [id, home] of Object.entries(HOMES)) {
  const candidates = [];
  try {
    const page = await get(home);
    if (page.ok) candidates.push(...iconCandidates(await page.text(), page.url));
  } catch (error) {
    console.log(`${id.padEnd(18)} home unreachable: ${error.message}`);
  }
  candidates.push({ url: new URL("/favicon.ico", home).toString(), size: 0, apple: false });

  let done = false;
  for (const candidate of candidates) {
    try {
      const { extension, bytes } = await download(id, candidate.url);
      console.log(`${id.padEnd(18)} ${extension.padEnd(4)} ${String(bytes).padStart(7)} B  ${candidate.url}`);
      done = true;
      break;
    } catch {
      /* try the next candidate */
    }
  }
  if (!done) console.log(`${id.padEnd(18)} NOTHING USABLE`);
}
