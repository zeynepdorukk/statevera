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
export type RewriteMode = "inline" | "blocks" | "field";

export type AskScope = "inline" | "blocks" | "headline" | "standfirst" | "empty";

export interface AskPreset {
  id: string;
  label: string;
  /** Short line under the chip when hovered / for screen readers. */
  hint: string;
  /** Fills the instruction box. The writer can edit before applying. */
  instruction: string;
  /** Where this chip is useful. */
  scopes: AskScope[];
}

/**
 * Common jobs the desk actually does. Chips fill the box; free text still wins.
 * Keep labels short — they sit in a horizontal row.
 */
export const ASK_PRESETS: AskPreset[] = [
  {
    id: "tighten",
    label: "Tighten",
    hint: "Cut fat, keep the claim",
    instruction:
      "Tighten this. Cut throat-clearing and repetition. Keep every concrete fact, name and number. Prefer shorter sentences where the meaning allows.",
    scopes: ["inline", "blocks", "standfirst", "headline"],
  },
  {
    id: "plainer",
    label: "Plainer",
    hint: "Less jargon, same precision",
    instruction:
      "Rewrite in plainer language without dumbing down. Replace jargon with ordinary words. Keep the register serious and the meaning exact.",
    scopes: ["inline", "blocks", "standfirst"],
  },
  {
    id: "sharper",
    label: "Sharper",
    hint: "Stronger verbs, cleaner point",
    instruction:
      "Make this sharper. Lead with the point. Prefer concrete nouns and active verbs. Cut hedging that does no work.",
    scopes: ["inline", "blocks", "headline", "standfirst"],
  },
  {
    id: "longer",
    label: "Expand",
    hint: "One step more depth",
    instruction:
      "Expand this slightly with one more layer of explanation or consequence. Do not invent facts, figures, dates, quotations or sources. Stay in the writer's voice.",
    scopes: ["inline", "blocks"],
  },
  {
    id: "shorter",
    label: "Halve it",
    hint: "About half the length",
    instruction:
      "Cut this to roughly half the length. Keep the essential claim and the hardest facts. Drop colour and restatement first.",
    scopes: ["inline", "blocks"],
  },
  {
    id: "grammar",
    label: "Fix English",
    hint: "Grammar and flow only",
    instruction:
      "Fix grammar, spelling, punctuation and awkward phrasing only. Do not change meaning, structure, argument or tone. British English.",
    scopes: ["inline", "blocks", "headline", "standfirst"],
  },
  {
    id: "british",
    label: "British EN",
    hint: "Spelling and usage",
    instruction:
      "Convert to British English spelling and usage (defence, programme, towards). Change nothing else about meaning or structure.",
    scopes: ["inline", "blocks", "headline", "standfirst"],
  },
  {
    id: "neutral",
    label: "More neutral",
    hint: "Report, don't argue",
    instruction:
      "Rewrite in a more neutral reported register. Remove loaded adjectives and editorial judgement. Keep the facts and the sequence.",
    scopes: ["inline", "blocks"],
  },
  {
    id: "argument",
    label: "As argument",
    hint: "Opinion voice",
    instruction:
      "Rewrite as a clear signed argument in the house opinion voice. State the claim early. Keep evidence; cut pure colour. First person is allowed if it helps.",
    scopes: ["inline", "blocks"],
  },
  {
    id: "takeaways",
    label: "Key takeaways",
    hint: "Three bullets in a callout",
    instruction:
      "Turn the essential points of this passage into a KeyTakeaways callout with three tight bullets. Return ONLY the callout markdown using <KeyTakeaways> … </KeyTakeaways>. Invent nothing.",
    scopes: ["blocks"],
  },
  {
    id: "why",
    label: "Why it matters",
    hint: "Consequence callout",
    instruction:
      "Write a WhyItMatters callout of two or three sentences on the consequence of this passage. Reported, not argued. Return ONLY <WhyItMatters> … </WhyItMatters>. Invent no facts.",
    scopes: ["blocks"],
  },
  {
    id: "bigpicture",
    label: "Big picture",
    hint: "Longer frame callout",
    instruction:
      "Write a TheBigPicture callout placing this passage in the longer story. One short paragraph. Return ONLY <TheBigPicture> … </TheBigPicture>. Invent no facts.",
    scopes: ["blocks"],
  },
  {
    id: "heads",
    label: "Add heads",
    hint: "Section the run",
    instruction:
      "Add clear ## section headings that match the house forms (What changed / Why it happened / What it means, or equivalents that fit). Do not invent facts. Keep the existing prose under the new heads.",
    scopes: ["blocks"],
  },
  {
    id: "pullquote",
    label: "Pull quote",
    hint: "One line to lift",
    instruction:
      "From this passage, produce a single pull quote worth lifting. Return ONLY a markdown blockquote (> …) of one or two short sentences, taken or lightly tightened from the writer's words. Invent nothing.",
    scopes: ["inline", "blocks"],
  },
  {
    id: "lede",
    label: "Hard lede",
    hint: "Who / what / when first",
    instruction:
      "Rewrite as a hard news lede: the most important fact first, who/what/where/when in the opening sentence. No throat-clearing. Keep only what the passage supports.",
    scopes: ["inline", "blocks"],
  },
  {
    id: "standfirst",
    label: "As standfirst",
    hint: "One line, 20–32 words",
    instruction:
      "Rewrite as a standfirst: one sentence, roughly 20–32 words, that states the argument or the second most important fact. No headline style.",
    scopes: ["inline", "standfirst", "blocks"],
  },
  {
    id: "headline",
    label: "As headline",
    hint: "House headline rules",
    instruction:
      "Rewrite as a STATEVERA headline: specific, sober, no clickbait, no question mark, no exclamation mark. Preferably under 12 words. British English. Return ONLY the headline text.",
    scopes: ["inline", "headline", "blocks"],
  },
  {
    id: "house",
    label: "House voice",
    hint: "Match FT / Economist register",
    instruction:
      "Rewrite into the STATEVERA house voice: British English, precise, unhurried, concrete. No hype. Keep every fact. Match the surrounding piece.",
    scopes: ["inline", "blocks", "standfirst"],
  },
  {
    id: "questions",
    label: "Interview Qs",
    hint: "Bold questions shape",
    instruction:
      "Reshape this into interview form: short bold questions on their own lines (**Question?**) and answers as plain paragraphs beneath. Keep the substance. Do not invent answers the passage does not support.",
    scopes: ["blocks"],
  },
  {
    id: "briefing",
    label: "3 points",
    hint: "Numbered briefing",
    instruction:
      "Recast as a three-point briefing: a one-paragraph state of play, then ## 1. / ## 2. / ## 3. with two or three sentences each. Sharpest point first. Invent nothing.",
    scopes: ["blocks"],
  },
];

export function presetsFor(scope: AskScope): AskPreset[] {
  return ASK_PRESETS.filter((p) => p.scopes.includes(scope));
}

const INLINE_RULES = `- Return ONLY the rewritten passage, as a single run of text.
- Do NOT add headings, lists, blank lines or block structure: this is part of one paragraph.
- Inline markdown is allowed where it already fits: **bold**, *italic*, [text](url).
- Keep roughly the same length unless the instruction asks to cut or expand.`;

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
- Keep every picture that is already there unless told to remove it.
- If the instruction asks for a callout only, return only that callout.`;

const FIELD_RULES = `- Return ONLY the rewritten field text as a single plain line (or two at most for a standfirst).
- No markdown headings, lists, code fences or labels.
- No quotation marks wrapped around the whole answer.`;

/**
 * Light intent routing so free-typed instructions get the same guardrails as chips.
 * Does not replace the writer's words — only appends constraints the model needs.
 */
export function enrichInstruction(instruction: string, mode: RewriteMode): string {
  const text = instruction.trim();
  const lower = text.toLowerCase();
  const extras: string[] = [];

  if (/\b(translat|español|spanish|french|deutsch|turkish|türkçe|arabic)\b/i.test(lower)) {
    extras.push(
      "Do not translate into another language. Stay in British English unless the passage is already a quotation in another language."
    );
  }
  if (/\b(invent|make up|fabricat|hallucin)/i.test(lower)) {
    extras.push("Refuse to invent. If facts are missing, keep the passage and do not pad.");
  }
  if (/\b(clickbait|viral|seo|emoji)/i.test(lower)) {
    extras.push("Stay in house style: no clickbait, no emoji, no SEO tricks.");
  }
  if (mode === "inline" && /\b(heading|subhead|bullet|list|callout|takeaway|section)\b/i.test(lower)) {
    extras.push(
      "This selection is inside one paragraph. Do not introduce block structure; keep a single run of text. If the job truly needs structure, return the passage unchanged."
    );
  }
  if (/\b(fact[- ]?check|verify sources?)\b/i.test(lower)) {
    extras.push(
      "You cannot verify external facts. Flag unsupported claims in [square brackets] inside the passage rather than inventing citations."
    );
  }

  if (!extras.length) return text;
  return `${text}

Additional constraints:
${extras.map((e) => `- ${e}`).join("\n")}`;
}

/**
 * Rewrites a passage according to whatever the writer typed. The rest of the
 * piece goes in as context so the model can match the voice, but only the
 * passage comes back.
 */
export async function rewrite(
  config: AiConfig,
  instruction: string,
  passage: string,
  context: {
    title: string;
    description: string;
    draft: string;
    /** headline | standfirst | body — changes field rules. */
    field?: "headline" | "standfirst" | "body";
  },
  mode: RewriteMode = "inline",
  signal?: AbortSignal
): Promise<string> {
  const field = context.field ?? "body";
  const effectiveMode: RewriteMode =
    field === "headline" || field === "standfirst" ? "field" : mode;
  const rules =
    effectiveMode === "blocks" ? BLOCK_RULES : effectiveMode === "field" ? FIELD_RULES : INLINE_RULES;
  const fullInstruction = enrichInstruction(instruction, effectiveMode);

  const fieldLine =
    field === "headline"
      ? "You are editing the HEADLINE only."
      : field === "standfirst"
        ? "You are editing the STANDFIRST only."
        : "You are editing one part of the body.";

  const prompt = `${fieldLine} Carry out the writer's instruction on the passage at the bottom, and nothing else.

The writer's instruction:
${fullInstruction}

Rules:
${rules}
- No preamble, no explanation, no commentary about what you changed.
- Keep the writer's voice unless the instruction asks for a register change.
- Change only what the instruction asks for.
- Invent no facts, figures, dates, quotations or named sources.
- Do not add a title, label, or "Rewritten:" prefix.
- If the instruction cannot be carried out honestly, return the passage unchanged.
- If the passage is a template placeholder (instructions to the writer rather than finished prose), rewrite it into finished sample prose only when the instruction clearly asks to fill, draft, or write; otherwise keep structure and tighten the guidance.

Working title: ${context.title || "(untitled)"}
Standfirst: ${context.description || "(none yet)"}
Field: ${field}
Mode: ${effectiveMode}

--- THE WHOLE PIECE, FOR CONTEXT ONLY. DO NOT RETURN IT. ---
${context.draft.slice(0, 8000)}

--- THE PASSAGE TO REWRITE ---
${passage}`;

  const raw = await ask(config, prompt, {
    system: HOUSE_STYLE,
    temperature: 0.35,
    maxTokens: effectiveMode === "blocks" ? 4000 : effectiveMode === "field" ? 220 : 1400,
    signal,
  });
  let out = stripFence(raw);
  out = out.replace(/^(?:rewritten\s*(?:passage|text|version)\s*:\s*)/i, "");
  if (effectiveMode !== "blocks") {
    out = out.replace(/^["“]|["”]$/g, "");
    if (effectiveMode === "field") {
      out = out.split("\n").map((l) => l.trim()).filter(Boolean)[0] ?? out;
    }
  }
  return out.trim();
}

// ------------------------------------------------------------
// ChatGPT-shaped jobs: free chat, research, source lists
// ------------------------------------------------------------

export interface ResearchHit {
  title: string;
  url: string;
  snippet: string;
  origin: "news" | "web" | "reference";
}

export interface SourceSuggestion {
  name: string;
  url: string;
  why: string;
}

export interface ChatApply {
  /** Replace the captured selection, or insert a new passage at the cursor. */
  action: "replace" | "insert";
  text: string;
}

export interface ChatResult {
  answer: string;
  /** Optional edit proposed by the conversation. The writer must apply it. */
  apply?: ChatApply;
  sources?: SourceSuggestion[];
}

/** Pull public headlines/pages the desk can show and feed to the model. */
export async function fetchResearch(
  query: string,
  signal?: AbortSignal
): Promise<ResearchHit[]> {
  const res = await fetch("/api/research", {
    method: "POST",
    signal,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    results?: ResearchHit[];
    error?: string;
  };
  if (!res.ok) throw new AiError(data.error ?? `Research failed (${res.status}).`, res.status);
  return data.results ?? [];
}

const packHits = (hits: ResearchHit[]): string =>
  hits
    .map(
      (h, i) =>
        `[${i + 1}] (${h.origin}) ${h.title}\nURL: ${h.url}\n${h.snippet || "(no snippet)"}`
    )
    .join("\n\n");

/**
 * Free-form assistant turn — the ChatGPT habit: ask anything about the piece,
 * get an answer, optional insertable draft, optional source list. When
 * `withResearch` is on, public results are fetched first and the model may only
 * lean on those (plus the draft) for factual claims.
 */
export async function chatAboutPiece(
  config: AiConfig,
  request: {
    question: string;
    title: string;
    description: string;
    draft: string;
    selection?: string;
    withResearch?: boolean;
  },
  signal?: AbortSignal
): Promise<ChatResult> {
  const question = request.question.trim();
  let hits: ResearchHit[] = [];
  if (request.withResearch) {
    // Prefer the writer's question; fall back to headline so empty-ish asks still search.
    const q = question.length >= 4 ? question : request.title || request.selection || "";
    if (q.trim().length >= 2) {
      hits = await fetchResearch(q, signal);
    }
  }

  const researchBlock = hits.length
    ? `--- PUBLIC RESEARCH (the only external material you may treat as evidence) ---
${packHits(hits)}

Rules for research:
- You may summarise and connect these results. Do not invent URLs or outlets.
- If the results are thin or off-topic, say so plainly.
- Prefer primary / established outlets when recommending sources.`
    : request.withResearch
      ? "--- PUBLIC RESEARCH ---\nNo usable results came back. Say that you could not verify anything externally."
      : "--- PUBLIC RESEARCH ---\nNone requested. Do not invent news events, figures or links. If the writer needs facts you do not have, say what to check.";

  const prompt = `The writer is working on a STATEVERA piece and asked you a free-form question,
the way they would ask ChatGPT. Answer helpfully. You are a colleague on the desk,
not a generic chatbot.

Return JSON only:
{"answer":"markdown answer to the writer (may use short lists)","apply":null or {"action":"replace|insert","text":"plain text or markdown to apply"},"sources":[{"name":"Outlet or document","url":"https://...","why":"one line on why it belongs on the piece"}]}

Rules:
- "answer" is for the writer. Clear, British English, no hype.
- "apply" is null for a question, explanation, outline or critique that should remain conversational.
- Use "action":"replace" when the writer asks to edit, rewrite, shorten, expand, clarify or otherwise change the selected passage. Return ONLY the replacement text in "text"; do not include an explanation, heading or quotation marks around it.
- Use "action":"insert" when the writer asks you to draft, continue or add new copy. Return ONLY the finished markdown to insert into the piece.
- If there is no selection and the writer asks to edit the piece, use "action":"insert" only when you can produce a genuinely new passage; otherwise leave "apply":null and explain what needs selecting.
- "sources" may be empty. Every url must come from the research block or from a link already in the draft. Never mint a URL.
- Invent no facts, figures, quotations or named sources.
- If the selection is template placeholder text, treat it as scaffolding unless asked to draft over it.

Working title: ${request.title || "(untitled)"}
Standfirst: ${request.description || "(none yet)"}

--- SELECTION (may be empty) ---
${(request.selection || "(none)").slice(0, 4000)}

--- DRAFT ---
${request.draft.slice(0, 8000)}

${researchBlock}

--- THE WRITER'S QUESTION ---
${question}`;

  const raw = await ask(config, prompt, {
    system: HOUSE_STYLE,
    temperature: 0.4,
    maxTokens: 2200,
    json: true,
    signal,
  });

  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(stripFence(raw).match(/\{[\s\S]*\}/)?.[0] ?? "{}") as Record<string, unknown>;
  } catch {
    return { answer: stripFence(raw) || "Nothing came back." };
  }

  const sourcesRaw = Array.isArray(parsed.sources) ? parsed.sources : [];
  const allowed = new Set(hits.map((h) => h.url.replace(/\/$/, "").toLowerCase()));
  // Links already in the draft are fair game for source suggestions.
  for (const m of request.draft.matchAll(/https?:\/\/[^\s)\]>'"]+/g)) {
    allowed.add(m[0].replace(/\/$/, "").toLowerCase());
  }

  const sources: SourceSuggestion[] = sourcesRaw
    .map((row) => row as Record<string, unknown>)
    .filter((row) => typeof row.name === "string" && typeof row.url === "string")
    .map((row) => ({
      name: String(row.name).trim(),
      url: String(row.url).trim(),
      why: typeof row.why === "string" ? String(row.why).trim() : "",
    }))
    .filter((s) => s.name && s.url && allowed.has(s.url.replace(/\/$/, "").toLowerCase()));

  // If the model returned nothing usable but we have research, surface the hits.
  if (!sources.length && hits.length && /source|cite|link|reference|bibliography/i.test(question)) {
    for (const h of hits.slice(0, 6)) {
      sources.push({
        name: h.title.slice(0, 120),
        url: h.url,
        why: h.snippet.slice(0, 140) || h.origin,
      });
    }
  }

  const proposed = parsed.apply as Record<string, unknown> | null | undefined;
  const apply =
    proposed &&
    (proposed.action === "replace" || proposed.action === "insert") &&
    typeof proposed.text === "string" &&
    proposed.text.trim()
      ? { action: proposed.action, text: proposed.text.trim() } as ChatApply
      : undefined;

  return {
    answer: String(parsed.answer ?? "").trim() || stripFence(raw),
    ...(apply ? { apply } : {}),
    sources,
  };
}

/**
 * Build a source list for the Publish drawer from the piece + optional research.
 */
export async function suggestSources(
  config: AiConfig,
  piece: { title: string; description: string; draft: string; query?: string },
  signal?: AbortSignal
): Promise<SourceSuggestion[]> {
  const q =
    (piece.query || "").trim() ||
    [piece.title, piece.description].filter(Boolean).join(" — ") ||
    piece.draft.slice(0, 180);
  const hits = q.trim().length >= 2 ? await fetchResearch(q, signal) : [];

  const prompt = `Propose filing sources for a STATEVERA piece — the kind that go in the
article's Sources list (name + url), not inline footnotes.

Return JSON only:
{"sources":[{"name":"Short outlet or document name","url":"https://...","why":"one line"}]}

Rules:
- 4 to 8 sources maximum.
- Every url MUST appear in the research block below or already in the draft. No invented links.
- Prefer primary documents, official pages and established reporting over blogs.
- "name" is short (e.g. "NATO", "European Commission", "Reuters").
- If research is weak, return fewer sources rather than padding.

Headline: ${piece.title || "(untitled)"}
Standfirst: ${piece.description || "(none)"}

--- DRAFT (for topic only) ---
${piece.draft.slice(0, 5000)}

--- RESEARCH ---
${hits.length ? packHits(hits) : "(none)"}`;

  const raw = await ask(config, prompt, {
    system: HOUSE_STYLE,
    temperature: 0.3,
    maxTokens: 900,
    json: true,
    signal,
  });

  let parsed: { sources?: unknown[] } = {};
  try {
    parsed = JSON.parse(stripFence(raw).match(/\{[\s\S]*\}/)?.[0] ?? "{}") as {
      sources?: unknown[];
    };
  } catch {
    parsed = {};
  }

  const allowed = new Set(hits.map((h) => h.url.replace(/\/$/, "").toLowerCase()));
  for (const m of piece.draft.matchAll(/https?:\/\/[^\s)\]>'"]+/g)) {
    allowed.add(m[0].replace(/\/$/, "").toLowerCase());
  }

  const fromModel = (parsed.sources ?? [])
    .map((row) => row as Record<string, unknown>)
    .filter((row) => typeof row.name === "string" && typeof row.url === "string")
    .map((row) => ({
      name: String(row.name).trim(),
      url: String(row.url).trim(),
      why: typeof row.why === "string" ? String(row.why).trim() : "",
    }))
    .filter((s) => s.name && s.url && allowed.has(s.url.replace(/\/$/, "").toLowerCase()));

  if (fromModel.length) return fromModel.slice(0, 8);

  // Honest fallback: the research hits themselves, never invented.
  return hits.slice(0, 6).map((h) => ({
    name: h.title.replace(/\s*-\s*[^-]+$/, "").slice(0, 80) || h.title.slice(0, 80),
    url: h.url,
    why: h.snippet.slice(0, 140) || h.origin,
  }));
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
  draft: { title: string; description: string; body: string; kind: "article" },
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
