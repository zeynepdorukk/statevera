// ============================================================
// EDITOR — AI assistance
// ------------------------------------------------------------
// The OpenAI key is never in the browser. Every request goes to
// the desk's own /api/ai, which is the only place that holds the
// key and which refuses anyone without a signed-in session.
//
// The model is chosen on the server too, so the browser never
// needs to know or care which one is in use.
// This module owns the prompts; the transport is one function.
// ============================================================

/** Kept as a type so the call sites read the same; there is nothing in it. */
export type AiConfig = Record<string, never>;

export interface AskOptions {
  system?: string;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  /** Ask the model for JSON back. */
  json?: boolean;
}

export class AiError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = "AiError";
  }
}

/** One-shot completion against the house model, by way of the desk's server. */
export async function ask(
  _config: AiConfig,
  prompt: string,
  options: AskOptions = {}
): Promise<string> {
  const { system, temperature = 0.5, maxTokens = 900, signal, json = false } = options;

  const res = await fetch("/api/ai", {
    method: "POST",
    signal,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, system, temperature, maxTokens, jsonOnly: json }),
  });

  const data = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
  if (!res.ok) throw new AiError(data.error ?? `The assistant failed (${res.status}).`, res.status);
  return data.text ?? "";
}


// ------------------------------------------------------------
// Statevera house voice
// ------------------------------------------------------------

export const HOUSE_STYLE = `You are the writing assistant for STATEVERA, an independent international-affairs
publication written by a single editor, Zeynep Doruk.

House style:
- British English. Serious, precise, unhurried. The register of the FT or the Economist.
- No hype, no clickbait, no exclamation marks, no rhetorical questions as headlines.
- Prefer concrete nouns and active verbs. Cut adverbs and throat-clearing.
- Never invent facts, figures, dates, quotations or named sources. If a claim needs a
  source the writer has not supplied, say so instead of inventing one.
- Do not editorialise in reported passages; arguments belong in Opinion pieces.
- Sentences of varying length. Paragraphs of two to four sentences.
- Markdown only: ## and ### for headings, ** for emphasis, - for lists.`;

const stripFence = (text: string): string =>
  text
    .replace(/^\s*```(?:markdown|md|json|text)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();

/**
 * Inline continuation for the ghost-text completion. Deliberately short: it should
 * finish the writer's thought, not take the piece over.
 */
export async function completeInline(
  config: AiConfig,
  context: { before: string; after: string; title: string },
  signal?: AbortSignal
): Promise<string> {
  const prompt = `Continue the draft below in the writer's own voice.

Rules:
- Return ONLY the continuation text. No preamble, no quotes, no markdown fence.
- At most one sentence, or finish the sentence in progress.
- If the text before the cursor ends mid-word, complete that word first.
- Match the existing tense, register and paragraph rhythm.
- Invent no facts, names, numbers or dates.

Working title: ${context.title || "(untitled)"}

--- TEXT BEFORE CURSOR ---
${context.before.slice(-2400)}
--- TEXT AFTER CURSOR ---
${context.after.slice(0, 400)}`;

  const raw = await ask(config, prompt, {
    system: HOUSE_STYLE,
    temperature: 0.35,
    maxTokens: 90,
    signal,
  });
  // Ghost text sits inside one paragraph, so keep the first line only.
  return stripFence(raw)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)[0]
    ?.replace(/^["“]|["”]$/g, "") ?? "";
}

// ------------------------------------------------------------
// Say what you want
// ------------------------------------------------------------

/**
 * A selection inside one paragraph is a run of words; a selection across several
 * is a piece of the document. They have to be asked for differently, or a
 * structural instruction flattens the article into one blob.
 */
export type RewriteMode = "inline" | "blocks";

const INLINE_RULES = `- Return ONLY the rewritten passage, as a single run of text.
- Do NOT add headings, lists, blank lines or block structure: this is part of one paragraph.
- Inline markdown is allowed where it already fits: **bold**, *italic*, [text](url).`;

const BLOCK_RULES = `- Return markdown for the WHOLE of the passage, structure included.
- Keep the shape of the piece unless the instruction asks you to change it. A
  heading stays a heading, a list stays a list, a pull quote stays a pull quote.
- The vocabulary you may use, and nothing else:
    ## Section heading          ### Sub-heading
    - bulleted item             1. numbered item
    > pulled quotation          ---  a section break
    **bold**  *italic*  [text](url)
    ![caption](/images/articles/file.jpg)   a picture already in the piece
    <KeyTakeaways> … </KeyTakeaways>        the four callout boxes, each
    <WhyItMatters> … </WhyItMatters>        wrapping markdown of its own
    <TheBigPicture> … </TheBigPicture>
    <AnalysisSection> … </AnalysisSection>
- Separate every block with a blank line.
- Do not invent a headline, and do not wrap the answer in a code fence.
- Keep every picture that is already there unless told to remove it.`;

/**
 * Rewrites a passage according to whatever the writer typed. The rest of the
 * piece goes in as context so the model can match the voice, but only the
 * passage comes back.
 */
export async function rewrite(
  config: AiConfig,
  instruction: string,
  passage: string,
  context: { title: string; description: string; draft: string },
  mode: RewriteMode = "inline",
  signal?: AbortSignal
): Promise<string> {
  const prompt = `You are editing one part of a piece for STATEVERA. Carry out the
writer's instruction on the passage at the bottom, and nothing else.

The writer's instruction:
${instruction}

Rules:
${mode === "blocks" ? BLOCK_RULES : INLINE_RULES}
- No preamble, no explanation, no commentary about what you changed.
- Keep the writer's voice. Change only what the instruction asks for.
- Invent no facts, figures, dates, quotations or named sources.
- If the instruction cannot be carried out honestly, return the passage unchanged.

Working title: ${context.title || "(untitled)"}
Standfirst: ${context.description || "(none yet)"}

--- THE WHOLE PIECE, FOR CONTEXT ONLY. DO NOT RETURN IT. ---
${context.draft.slice(0, 8000)}

--- THE PASSAGE TO REWRITE ---
${passage}`;

  const raw = await ask(config, prompt, {
    system: HOUSE_STYLE,
    temperature: 0.4,
    maxTokens: mode === "blocks" ? 4000 : 1200,
    signal,
  });
  const out = stripFence(raw);
  return mode === "blocks" ? out : out.replace(/^["“]|["”]$/g, "");
}

// ------------------------------------------------------------
// Looking for a picture
// ------------------------------------------------------------

/**
 * Turns a piece into something worth typing into an image archive. A headline is
 * usually the wrong query — archives are catalogued by what is in the frame, not
 * by what an article argues.
 */
export async function suggestPhotoQuery(
  config: AiConfig,
  piece: { title: string; description: string; draft: string },
  signal?: AbortSignal
): Promise<string> {
  const prompt = `Below is a piece for STATEVERA. Give me the search phrase I should type
into a photograph archive to find its lead image.

Rules:
- Return ONLY the phrase. No quotes, no explanation, no full stop.
- Two to five words, describing what would be VISIBLE in a suitable photograph:
  a place, a building, an object, an institution, a kind of scene.
- Archives are catalogued by subject, not by argument. "NATO headquarters
  Brussels" is a query; "the future of European deterrence" is not.
- Prefer things that are actually photographed often.

Headline: ${piece.title || "(untitled)"}
Standfirst: ${piece.description || "(none)"}

--- THE PIECE ---
${piece.draft.slice(0, 2500)}`;

  const raw = await ask(config, prompt, { system: HOUSE_STYLE, temperature: 0.3, maxTokens: 40, signal });
  return stripFence(raw).split("\n")[0]?.replace(/^["“']|["”'.]$/g, "").trim() ?? "";
}

// ------------------------------------------------------------
// Structure & layout advice
// ------------------------------------------------------------

export interface LayoutSuggestion {
  kind: "structure" | "image" | "callout" | "typography" | "cut";
  title: string;
  detail: string;
  /** Text to look for in the draft, so the UI can jump to the spot. */
  anchor?: string;
  /** Markdown the writer can insert at that point. */
  insert?: string;
}

const KIND_SET = new Set(["structure", "image", "callout", "typography", "cut"]);

/**
 * Asks for concrete, placeable advice about how the piece should sit on the page:
 * where a picture belongs, where a callout would carry its weight, where a section
 * break is missing, what should be cut.
 */
export async function suggestLayout(
  config: AiConfig,
  draft: { title: string; description: string; body: string; kind: "article" | "explainer" },
  signal?: AbortSignal
): Promise<LayoutSuggestion[]> {
  const prompt = `You are laying out a piece for a serious international-affairs publication.
Read the draft and return concrete, placeable production notes.

Return JSON only, in this exact shape:
{"suggestions":[{"kind":"structure|image|callout|typography|cut","title":"short imperative","detail":"one or two sentences saying exactly what to do and why","anchor":"a short verbatim phrase from the draft marking where this applies","insert":"markdown to insert, or empty string"}]}

Rules:
- Between four and seven suggestions, ordered by how much they improve the piece.
- "anchor" MUST be copied verbatim from the draft so the editor can find the spot. Use "" if it applies to the whole piece.
- The publication has these callout components available. "insert" may use them:
    <KeyTakeaways>\\n- point\\n- point\\n</KeyTakeaways>
    <WhyItMatters>\\nOne paragraph.\\n</WhyItMatters>
    <TheBigPicture>\\nOne paragraph.\\n</TheBigPicture>
    <AnalysisSection>\\nOne paragraph.\\n</AnalysisSection>
- For "image" suggestions, describe the picture to commission or choose, and where it goes. Do not invent a filename.
- For "cut", quote what should go and say why.
- Invent no facts. Anything in "insert" must be supported by the draft.

Piece type: ${draft.kind}
Title: ${draft.title || "(untitled)"}
Standfirst: ${draft.description || "(none)"}

--- DRAFT ---
${draft.body.slice(0, 12000)}`;

  const raw = await ask(config, prompt, {
    system: HOUSE_STYLE,
    temperature: 0.4,
    maxTokens: 1600,
    json: true,
    signal,
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFence(raw));
  } catch {
    const match = stripFence(raw).match(/\{[\s\S]*\}/);
    if (!match) throw new AiError("The model did not return usable JSON.");
    parsed = JSON.parse(match[0]);
  }

  const list = (parsed as { suggestions?: unknown[] })?.suggestions ?? [];
  return list
    .map((entry) => entry as Record<string, unknown>)
    .filter((entry) => typeof entry.title === "string" && typeof entry.detail === "string")
    .map((entry) => ({
      kind: (KIND_SET.has(String(entry.kind)) ? entry.kind : "structure") as LayoutSuggestion["kind"],
      title: String(entry.title),
      detail: String(entry.detail),
      anchor: typeof entry.anchor === "string" ? entry.anchor : "",
      insert: typeof entry.insert === "string" ? entry.insert : "",
    }));
}

/** Metadata proposals for the frontmatter form. */
export interface MetaSuggestion {
  description: string;
  tags: string[];
  country: string[];
  category: string;
  region: string;
  heroImageAlt: string;
}

export async function suggestMeta(
  config: AiConfig,
  draft: { title: string; body: string },
  vocabulary: { categories: string[]; regions: string[] },
  signal?: AbortSignal
): Promise<MetaSuggestion> {
  const prompt = `Read the draft and propose filing metadata.

Return JSON only:
{"description":"standfirst of 20-32 words","tags":["3-6 short tags"],"country":["countries central to the piece"],"category":"one of the categories","region":"one of the regions","heroImageAlt":"one sentence describing a suitable lead photograph, for alt text"}

Categories: ${vocabulary.categories.join(", ")}
Regions: ${vocabulary.regions.join(", ")}

Title: ${draft.title || "(untitled)"}

--- DRAFT ---
${draft.body.slice(0, 8000)}`;

  const raw = await ask(config, prompt, {
    system: HOUSE_STYLE,
    temperature: 0.35,
    maxTokens: 500,
    json: true,
    signal,
  });

  const parsed = JSON.parse(stripFence(raw).match(/\{[\s\S]*\}/)?.[0] ?? "{}");
  const asArray = (value: unknown): string[] =>
    Array.isArray(value) ? value.map(String).filter(Boolean) : [];

  return {
    description: String(parsed.description ?? ""),
    tags: asArray(parsed.tags),
    country: asArray(parsed.country),
    category: vocabulary.categories.includes(String(parsed.category)) ? String(parsed.category) : "",
    region: vocabulary.regions.includes(String(parsed.region)) ? String(parsed.region) : "",
    heroImageAlt: String(parsed.heroImageAlt ?? ""),
  };
}
