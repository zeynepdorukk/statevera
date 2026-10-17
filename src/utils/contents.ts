// Contents lists for long pieces, built from the headings Astro extracts from MDX.

export interface Heading {
  depth: number;
  slug: string;
  text: string;
}

export interface ContentsEntry {
  slug: string;
  text: string;
}

/** Below this many sections a contents list is clutter, not navigation. */
export const MIN_SECTIONS = 3;

/**
 * The piece's top-level sections. Pieces written in the desk use h2 for
 * sections; a piece with none falls back to h3. Empty headings, duplicates and
 * a closing "Sources" heading the sources block already covers are left out.
 */
export function contentsOf(headings: readonly Heading[], minimum = MIN_SECTIONS): ContentsEntry[] {
  const depth = headings.some((heading) => heading.depth === 2) ? 2 : 3;
  const seen = new Set<string>();
  const entries: ContentsEntry[] = [];
  for (const heading of headings) {
    if (heading.depth !== depth) continue;
    const text = heading.text.replace(/\s+/g, " ").trim();
    if (!text || !heading.slug || seen.has(heading.slug)) continue;
    if (/^(sources|references|kaynaklar|kaynakça)$/i.test(text)) continue;
    seen.add(heading.slug);
    entries.push({ slug: heading.slug, text });
  }
  return entries.length >= minimum ? entries : [];
}
