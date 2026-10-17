// ============================================================
// Responsive pictures for the publication's own images.
// ------------------------------------------------------------
// Server-side only (it reads files with sharp at build time). The
// variants themselves are written after the build by the
// responsive-images integration; in `astro dev` they do not exist,
// so only a production build prints a srcset.
// ============================================================

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { OG, ogPath, variantPath, widthsFor } from "../../scripts/responsive-images.mjs";
import { heroImageOf, root, unroot } from "./collection";

export interface ResponsiveImage {
  src: string;
  srcset?: string;
  width?: number;
  height?: number;
  /** A 1200×630 JPEG for link previews, when one will exist. */
  og?: { src: string; width: number; height: number };
}

const sizes = new Map<string, { width: number; height: number } | null>();

async function dimensionsOf(publicPath: string): Promise<{ width: number; height: number } | null> {
  if (sizes.has(publicPath)) return sizes.get(publicPath)!;
  const file = resolve(process.cwd(), "public", publicPath.replace(/^\//, ""));
  let found: { width: number; height: number } | null = null;
  if (existsSync(file)) {
    try {
      const { default: sharp } = await import("sharp");
      const meta = await sharp(file).metadata();
      if (meta.width && meta.height) {
        // EXIF orientations 5–8 swap the axes once the picture is rotated upright.
        const swapped = (meta.orientation ?? 1) >= 5;
        found = swapped ? { width: meta.height, height: meta.width } : { width: meta.width, height: meta.height };
      }
    } catch {
      found = null;
    }
  }
  sizes.set(publicPath, found);
  return found;
}

/** For a frontmatter heroImage or a /images/... path: src, srcset and real dimensions. */
export async function responsiveImage(image: string): Promise<ResponsiveImage> {
  const src = image.includes("/") || image.startsWith("http") ? (image.startsWith("http") ? image : root(image)) : heroImageOf(image);
  if (src.startsWith("http")) return { src };
  const publicPath = unroot(src);
  if (!/^\/images\/(articles|previews)\//.test(publicPath)) return { src };

  const dims = await dimensionsOf(publicPath);
  if (!dims) return { src };
  const widths = widthsFor(dims.width);
  const og = { src: root(ogPath(publicPath)), width: OG.width, height: OG.height };
  if (!import.meta.env.PROD) return { src, ...dims };
  return {
    src,
    width: dims.width,
    height: dims.height,
    srcset: [...widths.map((w) => `${root(variantPath(publicPath, w))} ${w}w`), `${src} ${dims.width}w`].join(", "),
    og,
  };
}
