// ============================================================
// RESPONSIVE IMAGES — one rule, used twice
// ------------------------------------------------------------
// The desk files pictures exactly as the writer uploads them: a
// 1.2 MB phone photo becomes the lead image of the home page, and
// a reader on a phone downloads all of it to see 390 pixels.
//
// After every build this writes smaller WebP copies next to each
// picture in dist/, plus a 1200×630 JPEG cut for link previews.
// The components ask the same module which widths exist, so the
// srcset they print and the files on disk can never disagree.
//
// Sources stay untouched in the repository; only dist/ changes.
// ============================================================

import { existsSync, readdirSync, statSync } from "node:fs";
import { join, parse } from "node:path";

/** Widths a reader's browser may choose between. */
export const WIDTHS = [480, 720, 960, 1600];
/** Folders under public/ whose pictures get variants. */
export const FOLDERS = ["images/articles", "images/previews"];
export const OG = { width: 1200, height: 630 };
const SOURCE = /\.(jpe?g|png|webp)$/i;

/** "/images/articles/x.jpg" + 960 → "/images/articles/x-w960.webp" */
export const variantPath = (src, width) => src.replace(/\.[a-z0-9]+$/i, `-w${width}.webp`);
/** "/images/articles/x.jpg" → "/images/articles/x-og.jpg" */
export const ogPath = (src) => src.replace(/\.[a-z0-9]+$/i, "-og.jpg");
/** Only originals, never a variant this script wrote. */
export const isSource = (name) => SOURCE.test(name) && !/-(w\d+|og)\.(webp|jpg)$/i.test(name);

/** The widths worth making for a picture this wide: never an upscale. */
export const widthsFor = (sourceWidth) => WIDTHS.filter((width) => width < sourceWidth);

/**
 * Writes every missing variant into dist/. Returns what it did, for the build log.
 *
 * @param {string} distDir
 * @param {{ quality?: number, log?: (line: string) => void }} [options]
 */
export async function generateVariants(distDir, { quality = 70, log = (_line) => {} } = {}) {
  const { default: sharp } = await import("sharp");
  let made = 0;
  let saved = 0;
  for (const folder of FOLDERS) {
    const dir = join(distDir, folder);
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir).filter(isSource)) {
      const file = join(dir, name);
      const { name: base } = parse(name);
      let meta;
      try {
        meta = await sharp(file).metadata();
      } catch {
        log(`skipped ${folder}/${name}: not a readable image`);
        continue;
      }
      const sourceBytes = statSync(file).size;
      for (const width of widthsFor(meta.width ?? 0)) {
        const out = join(dir, `${base}-w${width}.webp`);
        if (existsSync(out)) continue;
        const info = await sharp(file).rotate().resize({ width, withoutEnlargement: true }).webp({ quality, effort: 5, smartSubsample: true }).toFile(out);
        made += 1;
        if (width === WIDTHS[WIDTHS.length - 1] || width === widthsFor(meta.width ?? 0).at(-1)) {
          saved += Math.max(0, sourceBytes - info.size);
        }
      }
      const og = join(dir, `${base}-og.jpg`);
      if (!existsSync(og)) {
        await sharp(file)
          .rotate()
          .resize({ width: OG.width, height: OG.height, fit: "cover", position: "attention" })
          .jpeg({ quality: 82, mozjpeg: true })
          .toFile(og);
        made += 1;
      }
    }
  }
  log(`responsive images: ${made} files written, ~${Math.round(saved / 1024)} KB saved on the largest variants`);
  return { made, saved };
}
