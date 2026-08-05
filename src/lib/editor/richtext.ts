// ============================================================
// EDITOR — rich text canvas
// ------------------------------------------------------------
// The writing surface is the article itself: a contenteditable
// styled with the published typography. This module is the only
// place that knows how that DOM maps to the MDX stored in the
// repository, in both directions.
// ============================================================

export const CALLOUTS = {
  KeyTakeaways: "Key takeaways",
  WhyItMatters: "Why it matters",
  TheBigPicture: "The big picture",
  AnalysisSection: "Analysis",
} as const;

export type CalloutName = keyof typeof CALLOUTS;

const SAFE_URL = /^(https?:|mailto:|\/|#)/i;

/**
 * The site is served from a sub-path, so a root-relative image has to be shown
 * with that prefix while the Markdown keeps the plain repository path.
 */
let assetBase = "/";
export const setAssetBase = (base: string): void => {
  assetBase = base.endsWith("/") ? base : `${base}/`;
};
const displaySrc = (src: string): string =>
  src.startsWith("/") && !src.startsWith(assetBase) ? assetBase.slice(0, -1) + src : src;

const escapeHtml = (value: string): string =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// ------------------------------------------------------------
// Markdown -> editable DOM
// ------------------------------------------------------------

/** Inline markdown to HTML, for one line of text. */
export function inlineToHtml(text: string): string {
  let out = escapeHtml(text);
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (whole, label: string, href: string) =>
    SAFE_URL.test(href.trim())
      ? `<a href="${escapeHtml(href.trim())}">${label}</a>`
      : whole
  );
  return out || "<br>";
}

const calloutOpen = (name: CalloutName) =>
  `<aside class="ed-callout" data-callout="${name}" contenteditable="false">` +
  `<span class="ed-callout-label" contenteditable="false">${CALLOUTS[name]}</span>` +
  `<div class="ed-callout-body" contenteditable="true">`;

/**
 * Turns stored MDX into the editable document.
 * Only the subset the publication actually uses is understood; anything else is
 * preserved verbatim as a paragraph so nothing is silently lost.
 */
export function markdownToHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];

  let list: "ul" | "ol" | null = null;
  let quote: string[] = [];
  let callout: CalloutName | null = null;
  let calloutLines: string[] = [];

  const closeList = () => {
    if (list) {
      out.push(`</${list}>`);
      list = null;
    }
  };
  const closeQuote = () => {
    if (quote.length) {
      out.push(`<blockquote><p>${inlineToHtml(quote.join(" "))}</p></blockquote>`);
      quote = [];
    }
  };
  const closeAll = () => {
    closeList();
    closeQuote();
  };

  for (const raw of lines) {
    const line = raw.trim();

    if (callout) {
      if (new RegExp(`^</${callout}>$`).test(line)) {
        out.push(calloutOpen(callout) + markdownToHtml(calloutLines.join("\n")) + "</div></aside>");
        callout = null;
        calloutLines = [];
      } else {
        calloutLines.push(raw);
      }
      continue;
    }

    const open = line.match(/^<(KeyTakeaways|WhyItMatters|TheBigPicture|AnalysisSection)\s*\/?>$/);
    if (open) {
      closeAll();
      callout = open[1] as CalloutName;
      calloutLines = [];
      continue;
    }

    if (!line) {
      closeAll();
      continue;
    }

    const image = line.match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/);
    if (image && SAFE_URL.test(image[2])) {
      closeAll();
      out.push(
        `<figure class="ed-figure" data-image contenteditable="false">` +
          `<img src="${escapeHtml(displaySrc(image[2]))}" data-src="${escapeHtml(image[2])}" alt="${escapeHtml(image[1])}" />` +
          `<figcaption contenteditable="true" data-placeholder="Caption">${escapeHtml(image[1])}</figcaption>` +
          `</figure>`
      );
      continue;
    }

    const heading = line.match(/^(#{2,3})\s+(.*)$/);
    if (heading) {
      closeAll();
      out.push(`<h${heading[1].length}>${inlineToHtml(heading[2])}</h${heading[1].length}>`);
      continue;
    }

    if (/^(-{3,}|\*{3,})$/.test(line)) {
      closeAll();
      out.push('<hr contenteditable="false">');
      continue;
    }

    if (line.startsWith("> ")) {
      closeList();
      quote.push(line.slice(2));
      continue;
    }
    closeQuote();

    const bullet = line.match(/^[-*]\s+(.*)$/);
    if (bullet) {
      if (list !== "ul") {
        closeList();
        out.push("<ul>");
        list = "ul";
      }
      out.push(`<li>${inlineToHtml(bullet[1])}</li>`);
      continue;
    }

    const numbered = line.match(/^\d+[.)]\s+(.*)$/);
    if (numbered) {
      if (list !== "ol") {
        closeList();
        out.push("<ol>");
        list = "ol";
      }
      out.push(`<li>${inlineToHtml(numbered[1])}</li>`);
      continue;
    }

    closeList();
    out.push(`<p>${inlineToHtml(line)}</p>`);
  }

  closeAll();
  if (callout) {
    out.push(calloutOpen(callout) + markdownToHtml(calloutLines.join("\n")) + "</div></aside>");
  }

  return out.join("\n") || "<p><br></p>";
}

// ------------------------------------------------------------
// Editable DOM -> Markdown
// ------------------------------------------------------------

const escapeMarkdown = (text: string): string => text.replace(/([*_`])/g, "\\$1");

function inlineToMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return escapeMarkdown(node.textContent ?? "");
  if (node.nodeType !== Node.ELEMENT_NODE) return "";

  const el = node as HTMLElement;
  const inner = [...el.childNodes].map(inlineToMarkdown).join("");

  switch (el.tagName) {
    case "STRONG":
    case "B":
      return inner.trim() ? `**${inner}**` : inner;
    case "EM":
    case "I":
      return inner.trim() ? `*${inner}*` : inner;
    case "A": {
      const href = el.getAttribute("href") ?? "";
      return SAFE_URL.test(href) ? `[${inner}](${href})` : inner;
    }
    case "BR":
      return "\n";
    case "CODE":
      return `\`${inner}\``;
    default:
      return inner;
  }
}

const collapse = (text: string): string => text.replace(/[ \t]+/g, " ").trim();

/** Serialises the canvas back to the MDX body. */
export function htmlToMarkdown(root: HTMLElement): string {
  const blocks: string[] = [];

  for (const child of [...root.children]) {
    const el = child as HTMLElement;

    if (el.dataset.callout) {
      const body = el.querySelector<HTMLElement>(".ed-callout-body");
      const inner = body ? htmlToMarkdown(body) : "";
      blocks.push(`<${el.dataset.callout}>\n${inner}\n</${el.dataset.callout}>`);
      continue;
    }

    switch (el.tagName) {
      case "H2":
        blocks.push(`## ${collapse(inlineToMarkdown(el))}`);
        break;
      case "H3":
        blocks.push(`### ${collapse(inlineToMarkdown(el))}`);
        break;
      case "UL":
        blocks.push(
          [...el.children]
            .map((li) => `- ${collapse(inlineToMarkdown(li))}`)
            .join("\n")
        );
        break;
      case "OL":
        blocks.push(
          [...el.children]
            .map((li, i) => `${i + 1}. ${collapse(inlineToMarkdown(li))}`)
            .join("\n")
        );
        break;
      case "BLOCKQUOTE":
        blocks.push(
          collapse(inlineToMarkdown(el))
            .split("\n")
            .map((line) => `> ${line}`)
            .join("\n")
        );
        break;
      case "HR":
        blocks.push("---");
        break;
      case "FIGURE": {
        const img = el.querySelector("img");
        const caption = el.querySelector("figcaption")?.textContent?.trim() ?? "";
        // data-src holds the repository path; src carries the site base for display.
        if (img) blocks.push(`![${caption}](${img.getAttribute("data-src") ?? img.getAttribute("src") ?? ""})`);
        break;
      }
      default: {
        const text = collapse(inlineToMarkdown(el));
        if (text) blocks.push(text);
      }
    }
  }

  return blocks.filter(Boolean).join("\n\n").trim();
}

// ------------------------------------------------------------
// Plain text, for counting and for prompting the assistant
// ------------------------------------------------------------

export function canvasText(root: HTMLElement): string {
  return (root.innerText ?? root.textContent ?? "").replace(/\u00a0/g, " ");
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

export const readingMinutes = (words: number): number => Math.max(1, Math.round(words / 210));
