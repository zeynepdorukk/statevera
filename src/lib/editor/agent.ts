// ============================================================
// EDITOR — the writing agent
// ------------------------------------------------------------
// The model is the easy part. This is the harness around it: what
// the agent is allowed to see, what it is asked for, and what is
// done with the answer before it is allowed near the piece.
//
// Three rules shape it.
//
// Context is assembled, not dumped. A passage is edited in the
// place it lives — under its heading, between its neighbours —
// so the agent gets that place and an outline of the piece, not
// eight thousand characters of everything.
//
// Every answer is inspected. A rewrite that arrives with a
// preamble, that invents a link, that grows when it was told to
// cut, or that quietly turns a paragraph into a bullet list is
// wrong even when it reads well. Those answers are sent back
// once with the specific complaint before the writer sees them.
//
// The writer keeps the last word. Nothing here writes to the
// document: it returns text, and the desk shows it as a proposal.
// ============================================================

import {
  AiError,
  HOUSE_STYLE,
  type AiConfig,
  type ChatMessage,
  type ToolSpec,
  ask,
  askStream,
  askTurn,
  fetchResearch,
} from "./ai";
import { searchPrimarySources, type PrimaryHit } from "./desk";
import { PRIMARY_SOURCE_TYPES } from "../../primary-sources/types";

// ------------------------------------------------------------
// What the agent is allowed to know
// ------------------------------------------------------------

export interface PassageContext {
  title: string;
  standfirst: string;
  /** Which surface the passage sits on. Headlines and standfirsts are one line. */
  field: "headline" | "standfirst" | "body";
  /** The nearest heading above the passage. */
  section?: string;
  /** The paragraph before and the paragraph after, so the edit reads in place. */
  before?: string;
  after?: string;
  /** The shape of the piece: its headings, in order. */
  outline?: string[];
  /** True when the selection crosses block boundaries. */
  multiBlock?: boolean;
}

const words = (text: string): string[] => text.trim().split(/\s+/).filter(Boolean);
export const countWords = (text: string): number => words(text).length;

const clip = (text: string, max: number): string => {
  const trimmed = text.replace(/\s+/g, " ").trim();
  return trimmed.length > max ? `${trimmed.slice(0, max)}\u{2026}` : trimmed;
};

/**
 * The passage's place in the piece, in the order the model reads best: what the
 * piece is, where in it we are, what sits either side.
 */
function packContext(context: PassageContext): string {
  const lines = [
    `Headline: ${context.title || "(untitled)"}`,
    `Standfirst: ${context.standfirst || "(none yet)"}`,
    `Editing: ${
      context.field === "headline"
        ? "the headline"
        : context.field === "standfirst"
          ? "the standfirst"
          : context.multiBlock
            ? "several blocks of the body"
            : "one run of words inside the body"
    }`,
  ];

  if (context.section) lines.push(`Under the heading: ${context.section}`);
  if (context.outline?.length) {
    lines.push(`The piece runs: ${context.outline.slice(0, 12).join(" \u{2192} ")}`);
  }
  if (context.before) lines.push(`\nThe text immediately before:\n${clip(context.before, 700)}`);
  if (context.after) lines.push(`\nThe text immediately after:\n${clip(context.after, 700)}`);

  return lines.join("\n");
}

// ------------------------------------------------------------
// The standing jobs
// ------------------------------------------------------------

export type EditJobId =
  | "improve"
  | "tighten"
  | "shorten"
  | "expand"
  | "plainer"
  | "neutral"
  | "grammar"
  | "custom";

/** How far the answer may drift in length before it has ignored the job. */
interface LengthRule {
  min?: number;
  max?: number;
}

interface EditJob {
  id: EditJobId;
  label: string;
  /** Present continuous, for the bar while it works. */
  verb: string;
  instruction: string;
  temperature: number;
  effort: "none" | "low" | "medium";
  length?: LengthRule;
}

export const EDIT_JOBS: Record<EditJobId, EditJob> = {
  improve: {
    id: "improve",
    label: "Improve",
    verb: "Improving",
    instruction:
      "Make this sharper without changing what it claims. Lead with the point. Prefer concrete nouns and active verbs. Cut hedging and throat-clearing that do no work. Keep every fact, name, number and date exactly as given.",
    temperature: 0.35,
    effort: "none",
    length: { min: 0.6, max: 1.15 },
  },
  tighten: {
    id: "tighten",
    label: "Tighten",
    verb: "Tightening",
    instruction:
      "Tighten this. Cut repetition and filler. Keep every concrete fact, name and number. Prefer shorter sentences where the meaning allows.",
    temperature: 0.3,
    effort: "none",
    length: { max: 1 },
  },
  shorten: {
    id: "shorten",
    label: "Shorten",
    verb: "Shortening",
    instruction:
      "Cut this to roughly two thirds of its length. Keep the essential claim and the hardest facts. Drop colour and restatement first.",
    temperature: 0.3,
    effort: "none",
    length: { max: 0.85 },
  },
  expand: {
    id: "expand",
    label: "Expand",
    verb: "Expanding",
    instruction:
      "Expand this by one layer of explanation or consequence that follows from what is already here. Invent no facts, figures, dates, quotations or sources. Stay in the writer's voice.",
    temperature: 0.4,
    effort: "low",
    length: { min: 1.15 },
  },
  plainer: {
    id: "plainer",
    label: "Plainer",
    verb: "Simplifying",
    instruction:
      "Rewrite in plainer language without dumbing down. Replace jargon with ordinary words. Keep the register serious and the meaning exact.",
    temperature: 0.35,
    effort: "none",
    length: { min: 0.7, max: 1.2 },
  },
  neutral: {
    id: "neutral",
    label: "Neutral",
    verb: "Neutralising",
    instruction:
      "Rewrite in a neutral reported register. Remove loaded adjectives and editorial judgement. Keep the facts and their sequence.",
    temperature: 0.3,
    effort: "none",
    length: { min: 0.7, max: 1.2 },
  },
  grammar: {
    id: "grammar",
    label: "Grammar",
    verb: "Fixing grammar",
    instruction:
      "Fix grammar, spelling, punctuation and awkward phrasing only, in British English. Do not change meaning, structure, argument or tone. If nothing is wrong, return the passage exactly as it is.",
    temperature: 0.15,
    effort: "none",
    length: { min: 0.85, max: 1.15 },
  },
  custom: {
    id: "custom",
    label: "Edit",
    verb: "Editing",
    instruction: "",
    temperature: 0.4,
    effort: "low",
  },
};

/**
 * Light intent routing so a free-typed instruction gets the guardrails a
 * standing job has built in. It never replaces the writer's words.
 */
function guardrails(instruction: string, inline: boolean): string[] {
  const lower = instruction.toLowerCase();
  const extras: string[] = [];

  if (/\b(translat|spanish|french|deutsch|turkish|türkçe|arabic|espa)/i.test(lower)) {
    extras.push(
      "Do not translate into another language. Stay in British English unless the passage is already a quotation in another language."
    );
  }
  if (/\b(invent|make up|fabricat|hallucin)/i.test(lower)) {
    extras.push("Refuse to invent. If facts are missing, keep the passage and do not pad.");
  }
  if (/\b(clickbait|viral|seo|emoji|catchy)/i.test(lower)) {
    extras.push("Stay in house style: no clickbait, no emoji, no SEO tricks.");
  }
  if (/\b(fact[- ]?check|verify|source)/i.test(lower)) {
    extras.push(
      "You cannot verify anything externally. Flag unsupported claims in [square brackets] inside the passage rather than inventing citations."
    );
  }
  if (inline && /\b(heading|subhead|bullet|list|callout|takeaway|section)\b/i.test(lower)) {
    extras.push(
      "This passage sits inside one paragraph. Do not introduce block structure. If the job truly needs it, return the passage unchanged."
    );
  }
  return extras;
}

const INLINE_RULES = `- Return ONLY the rewritten passage, as one run of text.
- No headings, no lists, no blank lines, no block quotes: this is part of a paragraph.
- Inline markdown only where it already fits: **bold**, *italic*, [text](url).`;

const BLOCK_RULES = `- Return the whole passage as markdown, structure included.
- Keep the shape unless the instruction asks to change it: a heading stays a heading, a list stays a list, a callout stays a callout, in the same order.
- Separate blocks with a blank line. Use only: ## ### - 1. > --- **bold** *italic* [text](url) ![caption](/images/articles/file.jpg)
- The four callout boxes keep their tags and wrap markdown of their own:
    <KeyTakeaways> \u{2026} </KeyTakeaways>   <WhyItMatters> \u{2026} </WhyItMatters>
    <TheBigPicture> \u{2026} </TheBigPicture>  <AnalysisSection> \u{2026} </AnalysisSection>
- Any block that arrives as raw HTML \u{2014} a <figure> and everything inside it \u{2014} is copied
  back character for character. Those attributes carry the picture's credit,
  source and licence, and a publication that loses them is publishing a
  photograph it cannot account for.
- Every picture in the passage comes back, in its place, unless the instruction
  is explicitly to remove it.
- Do not wrap the answer in a code fence.`;

const FIELD_RULES = `- Return ONLY the line itself, as plain text.
- No markdown, no labels, no quotation marks around the whole answer.
- A headline is one line; a standfirst is one or two sentences.`;

function editPrompt(
  job: EditJob,
  instruction: string,
  passage: string,
  context: PassageContext,
  inline: boolean,
  complaint?: string
): string {
  const rules =
    context.field === "body" ? (inline ? INLINE_RULES : BLOCK_RULES) : FIELD_RULES;
  const asked = (instruction.trim() || job.instruction).trim();
  const extras = guardrails(asked, inline);
  const target = countWords(passage);

  return `Carry out one instruction on one passage of a STATEVERA piece, and nothing else.

THE INSTRUCTION
${asked}${extras.length ? `\n\nAdditional constraints:\n${extras.map((e) => `- ${e}`).join("\n")}` : ""}

HOW TO ANSWER
${rules}
- No preamble, no sign-off, no explanation of what you changed.
- Keep the writer's voice unless the instruction asks for a register change.
- Change only what the instruction asks for. Everything else stays word for word.
- Invent no facts, figures, dates, quotations, named sources or links.
- Do not add a URL that is not already in the passage.
- If the instruction cannot be carried out honestly, return the passage unchanged.
- The passage runs to ${target} ${target === 1 ? "word" : "words"}${
    job.length?.max ? `; the answer must be shorter than that` : ""
  }${job.length?.min && job.length.min > 1 ? `; the answer must be longer than that` : ""}.

WHERE THE PASSAGE SITS
${packContext(context)}
${complaint ? `\nYOUR LAST ANSWER WAS REJECTED\n${complaint}\nAnswer again, correctly, with the passage only.\n` : ""}
--- THE PASSAGE ---
${passage}`;
}

// ------------------------------------------------------------
// Reading the answer before the writer does
// ------------------------------------------------------------

const stripFence = (text: string): string =>
  text
    .replace(/^\s*```(?:markdown|md|text)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();

const PREAMBLE =
  /^(?:sure|certainly|of course|here(?:'s| is| are)[^\n]*|rewritten(?:\s+(?:passage|text|version))?|revised(?:\s+\w+)?|edited(?:\s+\w+)?)\s*[:\u{2014}-]?\s*/iu;

/** Trims the habits a chat model brings to a job that wanted only the words. */
function tidy(raw: string, inline: boolean, field: PassageContext["field"]): string {
  let out = stripFence(raw).replace(PREAMBLE, "").trim();

  // A whole answer in quotation marks is the model quoting itself, not the writer.
  if (/^["\u{201c}][\s\S]*["\u{201d}]$/u.test(out) && !/^["\u{201c}]/u.test(out.slice(1, -1))) {
    out = out.slice(1, -1).trim();
  }

  if (field !== "body") {
    out = out.split("\n").map((line) => line.trim()).filter(Boolean)[0] ?? out;
  } else if (inline) {
    out = out.replace(/\s*\n\s*/g, " ");
  }
  return out.trim();
}

/** Every picture the passage carries, however it is written. */
const picturesIn = (text: string): string[] => [
  ...[...text.matchAll(/!\[[^\]]*\]\(([^)\s]+)/g)].map((m) => m[1]),
  ...[...text.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/gi)].map((m) => m[1]),
];

/** The reason an answer cannot be shown, in the words the model needs to hear. */
function inspect(
  answer: string,
  passage: string,
  job: EditJob,
  inline: boolean,
  field: PassageContext["field"]
): string | null {
  if (!answer) return "You returned nothing.";
  if (/^(?:i (?:can|cannot|am|'m)|as an ai|i'?m sorry)/i.test(answer)) {
    return "You answered the writer instead of returning the passage.";
  }

  if (inline || field !== "body") {
    if (/^\s*(?:#{1,6}\s|[-*]\s|\d+\.\s|>\s)/m.test(answer)) {
      return "You added block structure to a passage that sits inside one paragraph. Return one run of text.";
    }
    if (/\n\s*\n/.test(answer)) {
      return "You split the passage into several blocks. Return one run of text.";
    }
  }
  if (field === "headline" && answer.length > 120) {
    return "A headline must fit on one line. Return something under 120 characters.";
  }

  // A link the passage did not have is a link the model made up.
  const known = new Set([...passage.matchAll(/https?:\/\/[^\s)\]>'"]+/g)].map((m) => m[0]));
  for (const found of answer.matchAll(/https?:\/\/[^\s)\]>'"]+/g)) {
    if (!known.has(found[0])) return `You introduced a link that is not in the passage: ${found[0]}`;
  }

  if (!inline && field === "body") {
    // Pictures and their attribution are the one thing an edit may never lose.
    const kept = new Set(picturesIn(answer));
    const lost = picturesIn(passage).filter((src) => !kept.has(src));
    if (lost.length) {
      return `You dropped ${lost.length} picture${lost.length === 1 ? "" : "s"} from the passage: ${lost.join(", ")}. Every picture comes back, in its place, with its figure markup exactly as it was.`;
    }
    const callouts = (text: string) => (text.match(/<(KeyTakeaways|WhyItMatters|TheBigPicture|AnalysisSection)>/g) ?? []).length;
    if (callouts(answer) < callouts(passage)) {
      return "You dropped a callout box. Keep every callout the passage had, with its tag.";
    }
  }

  const before = countWords(passage);
  const after = countWords(answer);
  if (before >= 8 && job.length) {
    if (job.length.max && after > before * job.length.max) {
      return `The job was to cut. The passage was ${before} words and your answer is ${after}. Come back shorter.`;
    }
    if (job.length.min && after < before * job.length.min) {
      return job.length.min > 1
        ? `The job was to expand. The passage was ${before} words and your answer is ${after}. Come back longer.`
        : `You cut too much: ${before} words became ${after}. Keep the substance.`;
    }
  }
  return null;
}

// ------------------------------------------------------------
// The one call the desk makes
// ------------------------------------------------------------

export interface EditRequest {
  job: EditJobId;
  /** Free text from the writer. Overrides the standing instruction when present. */
  instruction?: string;
  passage: string;
  context: PassageContext;
}

export interface EditOutcome {
  text: string;
  /** True when the agent decided the passage was already right. */
  unchanged: boolean;
  /** Set when a rejected first answer had to be asked for again. */
  repaired?: string;
}

/**
 * Runs one edit end to end: assembles the context, streams the answer, tidies
 * it, and — if it broke the job — sends it back once with the complaint before
 * giving up. What returns is fit to show the writer or nothing at all.
 */
export async function runEdit(
  config: AiConfig,
  request: EditRequest,
  onDelta?: (whole: string) => void,
  signal?: AbortSignal
): Promise<EditOutcome> {
  const passage = request.passage.trim();
  if (!passage) throw new AiError("There is nothing selected to work on.", 400);

  const job = EDIT_JOBS[request.job] ?? EDIT_JOBS.custom;
  const context = request.context;
  const inline = context.field === "body" && !context.multiBlock;
  // Block work rewrites a piece of the document and needs room to finish it;
  // an answer that stops halfway is refused rather than shown.
  const budget = inline
    ? Math.min(4000, Math.max(220, countWords(passage) * 3 + 320))
    : Math.min(16000, Math.max(600, countWords(passage) * 4 + 600));

  const shape = {
    system: HOUSE_STYLE,
    temperature: job.temperature,
    effort: job.effort,
    maxTokens: budget,
    whole: true,
    signal,
  };

  const first = await askStream(
    config,
    editPrompt(job, request.instruction ?? "", passage, context, inline),
    (_chunk, whole) => onDelta?.(tidy(whole, inline, context.field)),
    shape
  );

  let text = tidy(first, inline, context.field);
  const complaint = inspect(text, passage, job, inline, context.field);

  if (complaint) {
    // One repair round, not streamed: the writer should see the good answer
    // appear, not watch the bad one be taken away.
    const second = await ask(
      config,
      editPrompt(job, request.instruction ?? "", passage, context, inline, complaint),
      { ...shape, temperature: Math.max(0.1, job.temperature - 0.1) }
    );
    const repaired = tidy(second, inline, context.field);
    const stillWrong = inspect(repaired, passage, job, inline, context.field);
    if (stillWrong) throw new AiError(`The assistant could not do that cleanly. ${stillWrong}`, 422);
    onDelta?.(repaired);
    return { text: repaired, unchanged: repaired === passage, repaired: complaint };
  }

  return { text, unchanged: text === passage };
}

/**
 * Reads the passage back to the writer: what it claims, what it assumes, where
 * it is weak. It changes nothing, so it is allowed to think a little harder.
 */
export async function judgePassage(
  config: AiConfig,
  request: { passage: string; question?: string; context: PassageContext },
  onDelta?: (whole: string) => void,
  signal?: AbortSignal
): Promise<string> {
  const passage = request.passage.trim();
  if (!passage) throw new AiError("There is nothing selected to read.", 400);

  const prompt = `Read this passage as the writer's editor and answer in three sentences at most.

${
  request.question?.trim()
    ? `The writer asked: ${request.question.trim()}`
    : `Say what it claims, what it assumes without saying so, and the weakest link in it. Be specific about the words on the page. If it is sound, say so and stop.`
}

Rules:
- Plain prose to the writer. No lists, no headings, no praise, no restating the passage.
- Judge only what is here. Do not check facts you cannot see, and do not invent sources.
- If something needs a citation the writer has not given, name the claim that needs it.

WHERE THE PASSAGE SITS
${packContext(request.context)}

--- THE PASSAGE ---
${passage}`;

  const answer = await askStream(config, prompt, (_chunk, whole) => onDelta?.(whole.trim()), {
    system: HOUSE_STYLE,
    temperature: 0.3,
    effort: "low",
    maxTokens: 420,
    signal,
  });
  return answer.trim();
}

// ------------------------------------------------------------
// What actually changed
// ------------------------------------------------------------

export interface WordDiff {
  /** The new text, split into runs, each marked as kept or added. */
  runs: { text: string; added: boolean }[];
  added: number;
  removed: number;
}

/**
 * A word-level diff, so the desk can show the writer what the agent touched
 * instead of asking her to spot it. Longest common subsequence: passages are
 * short, and being exact matters more here than being clever.
 */
export function diffWords(before: string, after: string): WordDiff {
  const a = words(before);
  const b = words(after);
  // Beyond this the table costs more than the answer is worth.
  if (a.length > 900 || b.length > 900) {
    return { runs: [{ text: after, added: false }], added: 0, removed: 0 };
  }

  const table: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0)
  );
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }

  const runs: { text: string; added: boolean }[] = [];
  const push = (word: string, added: boolean) => {
    const last = runs[runs.length - 1];
    if (last && last.added === added) last.text += ` ${word}`;
    else runs.push({ text: word, added });
  };

  let i = 0;
  let j = 0;
  let removed = 0;
  let addedCount = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push(b[j], false);
      i += 1;
      j += 1;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      removed += 1;
      i += 1;
    } else {
      push(b[j], true);
      addedCount += 1;
      j += 1;
    }
  }
  while (j < b.length) {
    push(b[j], true);
    addedCount += 1;
    j += 1;
  }
  removed += a.length - i;

  return { runs, added: addedCount, removed };
}

/** One line the writer can read at a glance, without asking the model for it. */
export function describeChange(before: string, after: string, diff: WordDiff): string {
  if (before.trim() === after.trim()) return "Nothing to change";
  const delta = countWords(after) - countWords(before);
  const length =
    delta === 0 ? "same length" : delta > 0 ? `${delta} words longer` : `${-delta} words shorter`;
  const touched = diff.added + diff.removed;
  if (!touched) return `Rewritten \u{b7} ${length}`;
  return `${touched} ${touched === 1 ? "word" : "words"} touched \u{b7} ${length}`;
}

// ============================================================
// SOURCING — the agent with its hands on the archives
// ------------------------------------------------------------
// The model names a tool; the desk runs it and hands back the
// result. Two searches and one proposal, which is enough to
// take a claim in the draft and come back with the documents
// it rests on.
//
// The rule that makes it usable in a publication: a URL may
// only be proposed if a search in this same conversation
// returned it, or the draft already carried it. The executor
// enforces that, not the prompt — a model cannot mint a
// citation here even if it wants to.
// ============================================================

export interface SourceCandidate {
  name: string;
  url: string;
  why: string;
  institution?: string;
  date?: string;
}

/** One line of what the agent did, in the order it did it. */
export interface AgentStep {
  kind: "search" | "reference" | "propose";
  text: string;
  detail?: string;
}

export interface SourcingResult {
  /** What the researcher concluded, in its own words. */
  answer: string;
  candidates: SourceCandidate[];
  /** What it actually did, for the writer to see. */
  transcript: AgentStep[];
}

const SOURCING_BRIEF = `${HOUSE_STYLE}

You are the desk's researcher. The writer has pointed at a passage in a draft
and wants the documents behind it for the article's Sources list.

That list is a filing list, not a set of footnotes: it holds the papers a reader
who wanted to check this passage would ask for — the instrument it names, the
institution's own statement of the policy, the record of the meeting.

How you work:
- Search before you propose. Anything you have not seen returned by a search in
  this conversation does not exist as far as this desk is concerned.
- Queries are two to eight words, the words a filing clerk would use: an
  institution, an instrument, a place, a year. Not a sentence, not a question.
  The archives take plain words only: no site:, no quotation marks, no boolean
  operators. A query with punctuation in it comes back empty.
- Two or three searches usually settle it. Ask for several at once rather than
  one after another, and never repeat a query you have already run.
- The archives hold the institutions themselves: EU law and Council papers, EEAS
  and NATO statements, UN and OSCE documents, US federal records and Congress,
  UK government papers, the Turkish foreign ministry and the TBMM record. These
  are the sources worth filing.
- Reference results are background for you only. Never propose one as a source.
- File the closest official documents you actually found, even when they do not
  settle every clause. Say plainly in each "why" line what the document does and
  does not establish. That is what makes the list honest.
- Three good ones beat eight. Propose nothing only when nothing you found bears
  on the passage at all, and then say so plainly.`;

const SOURCING_TOOLS: ToolSpec[] = [
  {
    name: "search_primary_sources",
    description:
      "Search the official archives (EU, Council, EEAS, NATO, UN, OSCE, US federal register and Congress, UK government, Turkish foreign ministry, TBMM). Returns documents with citable URLs.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Two to eight plain words: an institution, instrument, place or year. No operators, quotes or punctuation.",
        },
        type: {
          type: "string",
          enum: ["All", ...PRIMARY_SOURCE_TYPES],
          description: "Narrow to one kind of document. Use All unless you are sure.",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "search_reference",
    description:
      "Search general reference material for background and for the proper names of documents. Never citable.",
    parameters: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
  },
  {
    name: "propose_sources",
    description:
      "Hand the writer the sources worth filing on this piece. Every url must be one a search in this conversation returned.",
    parameters: {
      type: "object",
      properties: {
        note: { type: "string", description: "One or two sentences to the writer about what these establish." },
        sources: {
          type: "array",
          maxItems: 6,
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "The document or institution, as it should read in the Sources list." },
              url: { type: "string" },
              why: { type: "string", description: "One line: what this establishes for the claim." },
            },
            required: ["name", "url", "why"],
          },
        },
      },
      required: ["sources"],
    },
  },
];

const sameUrl = (url: string): string => url.trim().replace(/\/+$/, "").toLowerCase();

const packHits = (hits: PrimaryHit[]): string =>
  hits
    .map(
      (hit, i) =>
        `[${i + 1}] ${hit.title}\n    ${hit.institution}${hit.publicationDate ? ` \u{b7} ${hit.publicationDate.slice(0, 10)}` : ""} \u{b7} ${hit.documentType}\n    URL: ${hit.url}\n    ${clip(hit.snippet, 220) || "(no extract)"}`
    )
    .join("\n\n");

/**
 * Takes a claim out of the draft and comes back with the documents behind it.
 * Nothing is written anywhere: the candidates are handed to the desk, which
 * shows them to the writer with a tick box each.
 */
export async function sourceClaim(
  config: AiConfig,
  request: {
    claim: string;
    context: PassageContext;
    /** URLs the piece already carries, which stay citable without a search. */
    known?: string[];
  },
  onStep?: (step: AgentStep) => void,
  signal?: AbortSignal
): Promise<SourcingResult> {
  const claim = request.claim.trim();
  if (!claim) throw new AiError("There is nothing selected to source.", 400);

  const citable = new Map<string, PrimaryHit | null>();
  for (const url of request.known ?? []) citable.set(sameUrl(url), null);

  const transcript: AgentStep[] = [];
  const step = (entry: AgentStep) => {
    transcript.push(entry);
    onStep?.(entry);
  };

  const messages: ChatMessage[] = [
    { role: "system", content: SOURCING_BRIEF },
    {
      role: "user",
      content: `Find the documents behind this passage, for the article's Sources list.

WHERE IT SITS
${packContext(request.context)}
${request.known?.length ? `\nAlready filed on this piece:\n${request.known.slice(0, 20).join("\n")}` : ""}

--- THE PASSAGE ---
${claim}`,
    },
  ];

  const reply = (call: { id: string }, content: string): ChatMessage => ({
    role: "tool",
    tool_call_id: call.id,
    content,
  });

  /** Two turns asking the same thing costs the writer ten seconds for nothing. */
  const searched = new Map<string, PrimaryHit[]>();

  const runSearch = async (call: { id: string; name: string; args: Record<string, unknown> }) => {
    if (call.name === "search_reference") {
      const query = String(call.args.query ?? "").trim();
      try {
        const hits = (await fetchResearch(query, signal)).slice(0, 5);
        step({ kind: "reference", text: query, detail: "background" });
        return reply(
          call,
          hits.length
            ? `${hits
                .map((hit) => `- ${hit.title}: ${clip(hit.snippet, 200)}`)
                .join("\n")}\n\n(Background only. None of these may be proposed as a source.)`
            : "Nothing came back."
        );
      } catch (error) {
        return reply(call, `The lookup failed: ${(error as Error).message}`);
      }
    }

    if (call.name !== "search_primary_sources") {
      return reply(call, `There is no tool called ${call.name}.`);
    }

    const query = String(call.args.query ?? "").trim();
    const type = String(call.args.type ?? "All");
    const key = `${type}|${query.toLowerCase()}`;
    if (searched.has(key)) {
      return reply(call, "You have already run that exact search. Use different words or propose what you have.");
    }

    try {
      const hits = (await searchPrimarySources(query, type, signal)).slice(0, 8);
      searched.set(key, hits);
      for (const hit of hits) citable.set(sameUrl(hit.url), hit);
      step({
        kind: "search",
        text: query,
        detail: hits.length ? `${hits.length} ${hits.length === 1 ? "document" : "documents"}` : "nothing",
      });
      return reply(
        call,
        hits.length ? packHits(hits) : "No documents came back for that query. Try plainer words."
      );
    } catch (error) {
      step({ kind: "search", text: query, detail: "refused" });
      return reply(call, `The search failed: ${(error as Error).message}`);
    }
  };

  // Searching is the slow part, so a turn's worth of it happens at once, and the
  // whole errand is on a clock: a writer will not wait two minutes for a list.
  const deadline = Date.now() + 55_000;
  const ROUNDS = 4;

  for (let round = 0; round < ROUNDS; round += 1) {
    const last = round === ROUNDS - 1;
    const turn = await askTurn(config, messages, {
      tools: SOURCING_TOOLS,
      // The last word must be a verdict, so on the last round it is the only
      // move left: propose what the archives gave, or say they gave nothing.
      ...(last ? { force: "propose_sources" } : {}),
      temperature: 0.2,
      maxTokens: 1200,
      signal,
    });

    if (!turn.calls.length) {
      return { answer: turn.content || "Nothing came back.", candidates: [], transcript };
    }
    messages.push(turn.message);

    const proposal = turn.calls.find((call) => call.name === "propose_sources");
    const searches = turn.calls.filter((call) => call.name !== "propose_sources");
    messages.push(...(await Promise.all(searches.map(runSearch))));

    if (proposal) {
      const proposed = Array.isArray(proposal.args.sources) ? proposal.args.sources : [];
      const accepted: SourceCandidate[] = [];
      const refused: string[] = [];

      for (const row of proposed as Record<string, unknown>[]) {
        const url = String(row.url ?? "").trim();
        const name = String(row.name ?? "").trim();
        if (!url || !name) continue;
        // The rule the whole thing turns on: only what a search returned.
        if (!citable.has(sameUrl(url))) {
          refused.push(url);
          continue;
        }
        const hit = citable.get(sameUrl(url));
        accepted.push({
          name,
          url,
          why: String(row.why ?? "").trim(),
          ...(hit?.institution ? { institution: hit.institution } : {}),
          ...(hit?.publicationDate ? { date: hit.publicationDate.slice(0, 10) } : {}),
        });
        if (accepted.length >= 6) break;
      }

      if (accepted.length) {
        step({
          kind: "propose",
          text: `Proposed ${accepted.length} ${accepted.length === 1 ? "source" : "sources"}`,
          ...(refused.length
            ? { detail: `${refused.length} invented link${refused.length === 1 ? "" : "s"} refused` }
            : {}),
        });
        return { answer: String(proposal.args.note ?? "").trim(), candidates: accepted, transcript };
      }

      messages.push(
        reply(
          proposal,
          refused.length
            ? `Rejected: ${refused.join(", ")}. None of those came back from a search in this conversation. Search first, then propose only what the archives returned.`
            : "You proposed nothing usable. Search the archives, then propose what they returned."
        )
      );

      // On the last round there is no next turn to correct it in, and an honest
      // "nothing here" is worth more to the writer than a shrug.
      if (last) {
        return {
          answer:
            String(proposal.args.note ?? "").trim() ||
            "The archives had nothing that stands behind this claim.",
          candidates: [],
          transcript,
        };
      }
    }

    if (Date.now() > deadline) {
      messages.push({
        role: "user",
        content: "Time is up. Propose what the archives have already given you, or say there is nothing.",
      });
    } else if (!proposal && round >= 1) {
      messages.push({
        role: "user",
        content:
          "That is enough searching. Propose the documents worth filing from what the archives returned, with an honest line on what each does and does not establish. Only propose nothing if nothing you found bears on the passage.",
      });
    }
  }

  return {
    answer: "I could not settle this within the search budget. Narrow the claim and try again.",
    candidates: [],
    transcript,
  };
}
