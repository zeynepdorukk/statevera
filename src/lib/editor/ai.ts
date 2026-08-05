// ============================================================
// EDITOR — AI assistance
// ------------------------------------------------------------
// The OpenAI key is never in the browser. Every request goes to
// the desk's own /api/ai, which is the only place that holds the
// key and which refuses anyone without a signed-in session.
//
// This module owns the prompts; the transport is one function.
// One provider, one model, no choices to make while writing.
// ============================================================

/** The only model the desk uses. The server pins the same name. */
export const MODEL = "gpt-5.6-LUNA";

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

export type TransformId =
  | "tighten"
  | "expand"
  | "clarify"
  | "neutralise"
  | "continue"
  | "dek"
  | "headline"
  | "takeaways";

const TRANSFORMS: Record<TransformId, { label: string; instruction: string; temperature: number }> = {
  tighten: {
    label: "Tighten",
    instruction:
      "Rewrite the passage so it says the same thing in noticeably fewer words. Keep every fact. Return only the rewritten passage.",
    temperature: 0.3,
  },
  expand: {
    label: "Develop",
    instruction:
      "Develop the passage by one short paragraph that follows logically from what is already there. Introduce no new facts, figures or names. Return the original passage followed by the new paragraph.",
    temperature: 0.5,
  },
  clarify: {
    label: "Clarify",
    instruction:
      "Rewrite the passage so a well-informed general reader can follow it without specialist knowledge. Keep the argument and the facts. Return only the rewritten passage.",
    temperature: 0.35,
  },
  neutralise: {
    label: "De-editorialise",
    instruction:
      "Rewrite the passage to remove loaded or evaluative language, leaving the reporting intact. Return only the rewritten passage.",
    temperature: 0.25,
  },
  continue: {
    label: "Continue",
    instruction:
      "Write the next paragraph of the piece. Introduce no new facts, figures or names. Return only the new paragraph.",
    temperature: 0.55,
  },
  dek: {
    label: "Standfirst",
    instruction:
      "Write one standfirst (dek) of 20-32 words that states what the piece argues and why it matters now. Return only the standfirst, no quotes.",
    temperature: 0.5,
  },
  headline: {
    label: "Headlines",
    instruction:
      "Suggest five headlines of at most nine words each. Declarative, specific, no colons unless necessary, no questions. Return them as a plain numbered list and nothing else.",
    temperature: 0.7,
  },
  takeaways: {
    label: "Key takeaways",
    instruction:
      "Write three key takeaways, each a single sentence of at most 28 words, drawn strictly from the text. Return them as a markdown bullet list and nothing else.",
    temperature: 0.4,
  },
};

export const transformList = (Object.keys(TRANSFORMS) as TransformId[]).map((id) => ({
  id,
  label: TRANSFORMS[id].label,
}));

export async function transform(
  config: AiConfig,
  id: TransformId,
  text: string,
  context: { title: string; description: string },
  signal?: AbortSignal
): Promise<string> {
  const spec = TRANSFORMS[id];
  const prompt = `${spec.instruction}

Working title: ${context.title || "(untitled)"}
Standfirst: ${context.description || "(none yet)"}

--- PASSAGE ---
${text}`;

  const raw = await ask(config, prompt, {
    system: HOUSE_STYLE,
    temperature: spec.temperature,
    maxTokens: 800,
    signal,
  });
  return stripFence(raw);
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
