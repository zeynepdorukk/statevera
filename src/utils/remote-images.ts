// ============================================================
// Remote news pictures, sized for the slot they fill.
// ------------------------------------------------------------
// News items link to pictures on publishers' own CDNs. Most of those CDNs
// resize on request through the address itself, so a 112px thumbnail never
// has to download the 6000px original a feed happened to carry (NPR's feed
// does exactly that: 3.8 MB for a thumbnail). Only patterns verified against
// each CDN are rewritten; anything unknown is returned untouched, upgraded to
// https so it is never blocked as mixed content.
// ============================================================

/** The widths the cards ask for. Keeping them few keeps CDN caches warm. */
export const REMOTE_WIDTHS = [240, 480, 800, 1200] as const;
export type RemoteWidth = (typeof REMOTE_WIDTHS)[number];

/** The nearest standard width at or above `px`, capped at the largest. */
export function snapWidth(px: number): RemoteWidth {
  return REMOTE_WIDTHS.find((w) => w >= px) ?? REMOTE_WIDTHS[REMOTE_WIDTHS.length - 1];
}

/** BBC ichef serves these widths and no others. */
const BBC_WIDTHS = [240, 320, 480, 624, 800, 976, 1024];

type Rewriter = (url: URL, width: number) => URL | null;

const rewriters: [RegExp, Rewriter][] = [
  // ichef.bbci.co.uk/ace/standard/240/... and /news/240/...
  [
    /(^|\.)ichef\.bbci\.co\.uk$/,
    (url, width) => {
      const target = BBC_WIDTHS.find((w) => w >= width) ?? BBC_WIDTHS[BBC_WIDTHS.length - 1];
      const next = url.pathname.replace(/\/(ace\/standard|ace\/ws|news|standard)\/\d+\//, `/$1/${target}/`);
      if (next === url.pathname) return null;
      url.pathname = next;
      return url;
    },
  ],
  // s.france24.com and s.rfi.fr: /media/display/<id>/w:1024/p:16x9/<file>
  [
    /(^|\.)(france24\.com|rfi\.fr)$/,
    (url, width) => {
      const next = url.pathname.replace(/\/w:\d+\//, `/w:${snapWidth(width)}/`);
      if (next === url.pathname) return null;
      url.pathname = next;
      return url;
    },
  ],
  // Brightspot (NPR): /dims3/default/strip/false/crop/WxH+X+Y/resize/WxH!/?url=...
  [
    /(^|\.)brightspotcdn\.com$/,
    (url, width) => {
      const match = url.pathname.match(/\/crop\/(\d+)x(\d+)\+\d+\+\d+\/resize\/(\d+)x(\d+)!?\//);
      if (!match) return null;
      const [, cropW, cropH] = match.map(Number);
      const w = Math.min(snapWidth(width), cropW || snapWidth(width));
      const h = cropW ? Math.round((w * cropH) / cropW) : w;
      url.pathname = url.pathname.replace(/\/resize\/\d+x\d+!?\//, `/resize/${w}x${h}!/`);
      return url;
    },
  ],
  // Responsible Statecraft (RebelMouse): ?width=980
  [
    /(^|\.)responsiblestatecraft\.org$/,
    (url, width) => {
      if (!url.pathname.startsWith("/media-library/")) return null;
      url.searchParams.set("width", String(snapWidth(width)));
      return url;
    },
  ],
  // WordPress uploads with a size suffix: -1024x683.jpg -> keep, they are pre-cut.
];

/**
 * The picture at `raw`, asked for at roughly `width` CSS pixels (the caller
 * doubles for high-density screens). Unknown hosts come back as they were.
 */
export function remoteImage(raw: string | null | undefined, width: number): string {
  if (!raw) return "";
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return raw;
  }
  if (url.protocol === "http:") url.protocol = "https:";
  if (url.protocol !== "https:") return "";
  for (const [host, rewrite] of rewriters) {
    if (!host.test(url.hostname)) continue;
    const next = rewrite(new URL(url.href), width);
    return (next ?? url).href;
  }
  return url.href;
}

/** A 1x/2x srcset for a slot `width` CSS pixels wide, or "" when the CDN cannot resize. */
export function remoteSrcset(raw: string | null | undefined, width: number): string {
  if (!raw) return "";
  const one = remoteImage(raw, width);
  const two = remoteImage(raw, width * 2);
  return one && two && one !== two ? `${one} 1x, ${two} 2x` : "";
}
