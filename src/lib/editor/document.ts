// ============================================================
// EDITOR — frontmatter and preview
// ------------------------------------------------------------
// A small, predictable YAML subset: exactly the shape the content
// schema expects, written back deterministically so diffs stay
// readable.
// ============================================================

export interface Frontmatter {
  [key: string]: string | string[] | boolean | { name: string; url: string }[] | undefined;
}

export interface ParsedDoc {
  frontmatter: Record<string, string>;
  lists: Record<string, string[]>;
  sources: { name: string; url: string }[];
  body: string;
}

const unquote = (value: string): string => {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed
      .slice(1, -1)
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");
  }
  return trimmed;
};

/** Split a `[a, "b c"]` flow list. */
const parseFlowList = (value: string): string[] => {
  const inner = value.trim().replace(/^\[/, "").replace(/\]$/, "");
  if (!inner.trim()) return [];
  const out: string[] = [];
  let current = "";
  let quote: string | null = null;
  for (const char of inner) {
    if (quote) {
      if (char === quote) quote = null;
      else current += char;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === ",") {
      out.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim()) out.push(current.trim());
  return out.filter(Boolean);
};

export function parseDocument(raw: string): ParsedDoc {
  const match = raw.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?/);
  if (!match) return { frontmatter: {}, lists: {}, sources: [], body: raw };

  const block = match[1];
  const body = raw.slice(match[0].length);
  const frontmatter: Record<string, string> = {};
  const lists: Record<string, string[]> = {};
  const sources: { name: string; url: string }[] = [];

  const lines = block.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || /^\s/.test(line)) continue;

    const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!kv) continue;
    const [, key, rawValue] = kv;

    if (key === "sources") {
      // Block sequence of `- name: … / url: …`
      let j = i + 1;
      let pending: { name?: string; url?: string } = {};
      while (j < lines.length && /^\s/.test(lines[j])) {
        const entry = lines[j].trim();
        if (entry.startsWith("- ")) {
          if (pending.name !== undefined) sources.push({ name: pending.name, url: pending.url ?? "" });
          pending = {};
        }
        const field = entry.replace(/^-\s*/, "").match(/^(name|url):\s*(.*)$/);
        if (field) pending[field[1] as "name" | "url"] = unquote(field[2]);
        j++;
      }
      if (pending.name !== undefined) sources.push({ name: pending.name, url: pending.url ?? "" });
      i = j - 1;
      continue;
    }

    if (rawValue.trim().startsWith("[")) {
      lists[key] = parseFlowList(rawValue);
      continue;
    }

    frontmatter[key] = unquote(rawValue);
  }

  return { frontmatter, lists, sources, body };
}

const quote = (value: string): string =>
  `"${String(value ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

const flowList = (values: string[]): string =>
  values.length ? `[${values.map(quote).join(", ")}]` : "[]";

export interface ArticleFields {
  title: string;
  description: string;
  date: string;
  updated: string;
  author: string;
  category: string;
  region: string;
  country: string[];
  tags: string[];
  type: string;
  featured: boolean;
  editorsPick: boolean;
  draft: boolean;
  heroImage: string;
  heroImageAlt: string;
  imageCredit: string;
  sources: { name: string; url: string }[];
}

const sourcesBlock = (sources: { name: string; url: string }[]): string[] =>
  sources.length === 0
    ? ["sources: []"]
    : [
        "sources:",
        ...sources.flatMap((s) => [`  - name: ${quote(s.name)}`, `    url: ${quote(s.url)}`]),
      ];

export function serialiseArticle(fields: ArticleFields, body: string): string {
  const lines = [
    "---",
    `title: ${quote(fields.title)}`,
    `description: ${quote(fields.description)}`,
    `date: ${fields.date}`,
    ...(fields.updated ? [`updated: ${fields.updated}`] : []),
    `author: ${quote(fields.author || "Zeynep Doruk")}`,
    `category: ${quote(fields.category)}`,
    `region: ${quote(fields.region)}`,
    `country: ${flowList(fields.country)}`,
    `tags: ${flowList(fields.tags)}`,
    `type: ${quote(fields.type)}`,
    `featured: ${fields.featured}`,
    `editorsPick: ${fields.editorsPick}`,
    `draft: ${fields.draft}`,
    `heroImage: ${quote(fields.heroImage)}`,
    `heroImageAlt: ${quote(fields.heroImageAlt)}`,
    ...(fields.imageCredit ? [`imageCredit: ${quote(fields.imageCredit)}`] : []),
    ...sourcesBlock(fields.sources),
    "---",
    "",
    "",
  ];
  return lines.join("\n") + body.trim() + "\n";
}

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ş/g, "s")
    .replace(/ç/g, "c")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function wordCount(text: string): number {
  const prose = text
    .replace(/<[^>]+>/g, " ")
    .replace(/[#>*`_-]/g, " ")
    .trim();
  return prose ? prose.split(/\s+/).length : 0;
}

/** Flags characters that indicate an encoding accident, so they never ship. */
export function findBrokenCharacters(text: string): string[] {
  const hits = new Set<string>();
  for (const match of text.matchAll(/[\u00c2\u00c3\u00e2][\u0080-\u00ff\u2000-\u203a]/g)) {
    hits.add(match[0]);
  }
  if (text.includes("\ufffd")) hits.add("\ufffd");
  return [...hits];
}
