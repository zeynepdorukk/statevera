// ============================================================
// EDITOR — AI assistance
// ------------------------------------------------------------
// The key belongs to the writer and lives in her browser, so the
// call goes straight to OpenAI. Nothing about it is built into
// the published bundle, and no server is asked to hold it.
//
// This module owns the prompts; the transport is one function.
// ============================================================

import { DEFAULT_MODEL, readCredentials } from "./credentials";

/** Kept as a type so the call sites read the same; there is nothing in it. */
export type AiConfig = Record<string, never>;

export interface AskOptions {
  system?: string;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  /** Ask the model for JSON back. */
  json?: boolean;
  /**
   * How much deliberation the job is worth. Copy-editing needs none; judging a
   * passage does. The parameter is dropped automatically where it is refused.
   */
  effort?: "none" | "low" | "medium";
  /**
   * Refuse an answer the model ran out of room to finish. A half-written
   * paragraph is worse than an error, because it looks like an answer.
   */
  whole?: boolean;
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

/** One turn of a conversation, in the shape the API keeps it. */
export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
}

export interface ToolSpec {
  name: string;
  description: string;
  /** JSON schema for the arguments. */
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface Turn {
  content: string;
  calls: ToolCall[];
  /** The assistant message verbatim, to be put back into the conversation. */
  message: ChatMessage;
}

const OPENAI_CHAT = "https://api.openai.com/v1/chat/completions";

/**
 * What this model has already refused.
 *
 * Every generation accepts a different set of knobs, and the only way to learn
 * which is to be told off. Remembering that costs one wasted round trip per
 * model instead of one per request, which on a desk that edits a paragraph at a
 * time is the difference between the assistant feeling instant and feeling slow.
 */
const LIMITS_KEY = "statevera.desk.model-limits";
/** Calls that carry tools are remembered apart: the same model refuses different things. */
const TOOL_VARIANT = "#tools";

const readLimits = (): Record<string, string[]> => {
  try {
    const stored = JSON.parse(localStorage.getItem(LIMITS_KEY) ?? "{}") as unknown;
    return stored && typeof stored === "object" ? (stored as Record<string, string[]>) : {};
  } catch {
    return {};
  }
};

const refusedBy = (model: string): string[] => readLimits()[model] ?? [];

const rememberRefusal = (model: string, param: string): void => {
  try {
    const limits = readLimits();
    const known = new Set(limits[model] ?? []);
    known.add(param);
    limits[model] = [...known];
    localStorage.setItem(LIMITS_KEY, JSON.stringify(limits));
  } catch {
    // A desk with no storage simply pays the round trip every time.
  }
};

function readOpenAiError(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string } };
    return parsed.error?.message ?? "The assistant refused that request.";
  } catch {
    return "The assistant refused that request.";
  }
}

/** The refusal, read as the API meant it: which field, which code, which words. */
function readOpenAiComplaint(raw: string): { message: string; param: string; code: string } {
  try {
    const parsed = JSON.parse(raw) as {
      error?: { message?: string; param?: string; code?: string };
    };
    return {
      message: parsed.error?.message ?? "The assistant refused that request.",
      param: typeof parsed.error?.param === "string" ? parsed.error.param : "",
      code: typeof parsed.error?.code === "string" ? parsed.error.code : "",
    };
  } catch {
    return { message: "The assistant refused that request.", param: "", code: "" };
  }
}

async function listModels(key: string): Promise<string[]> {
  const response = await fetch("https://api.openai.com/v1/models", {
    headers: { authorization: `Bearer ${key}` },
  });
  if (!response.ok) return [];
  const listed = (await response.json()) as { data?: { id: string }[] };
  return (listed.data ?? []).map((m) => m.id);
}

/** Model names get written with dots, capitals and underscores interchangeably. */
const loosely = (id: string): string => id.toLowerCase().replace(/[._-]/g, "");

/**
 * One-shot completion against the house model.
 *
 * Model generations disagree about which parameters they accept, and the name a
 * model is written with is not always the id the API answers to. Rather than
 * guess at either, a rejection is read: a refused parameter is dropped and the
 * call repeated, and a refused model is looked up in the account's real list.
 */
export async function ask(
  _config: AiConfig,
  prompt: string,
  options: AskOptions = {}
): Promise<string> {
  const response = await postChat(buildPayload(prompt, options), options.signal);
  const text = await response.text();
  if (!response.ok) throw new AiError(readOpenAiError(text), response.status);

  const parsed = JSON.parse(text) as {
    choices?: { message?: { content?: string }; finish_reason?: string }[];
  };
  if (options.whole && parsed.choices?.[0]?.finish_reason === "length") throw cutOff();
  return parsed.choices?.[0]?.message?.content?.trim() ?? "";
}

const cutOff = () =>
  new AiError(
    "The answer ran out of room before it was finished. Work on a shorter passage, or ask for less at once.",
    422
  );

/**
 * The same call, delivered as it is written. A rewrite that appears word by word
 * in the passage is worth more to the writer than a spinner, and it is the only
 * way to judge a long answer before it finishes.
 *
 * Anything the stream cannot do — a refused parameter, a proxy that buffers, a
 * body the browser will not give us — falls back to the one-shot call, so the
 * caller never has to handle two failure modes.
 */
export async function askStream(
  config: AiConfig,
  prompt: string,
  onDelta: (chunk: string, whole: string) => void,
  options: AskOptions = {}
): Promise<string> {
  let response: Response;
  try {
    response = await postChat({ ...buildPayload(prompt, options), stream: true }, options.signal);
  } catch (error) {
    if ((error as Error).name === "AbortError") throw error;
    const whole = await ask(config, prompt, options);
    onDelta(whole, whole);
    return whole;
  }

  if (!response.ok || !response.body) {
    const whole = await ask(config, prompt, options);
    onDelta(whole, whole);
    return whole;
  }

  // The stream parameter can be refused, in which case the answer comes back
  // whole. Read it as what it is rather than as frames that are not there.
  if (!response.headers.get("content-type")?.includes("event-stream")) {
    const parsed = JSON.parse(await response.text()) as {
      choices?: { message?: { content?: string } }[];
    };
    const whole = parsed.choices?.[0]?.message?.content?.trim() ?? "";
    onDelta(whole, whole);
    return whole;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let whole = "";
  let stopped = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // SSE frames are separated by a blank line; a frame can straddle chunks.
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        for (const line of frame.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if (!data || data === "[DONE]") continue;
          try {
            const parsed = JSON.parse(data) as {
              choices?: { delta?: { content?: string }; finish_reason?: string }[];
            };
            if (parsed.choices?.[0]?.finish_reason) stopped = parsed.choices[0].finish_reason!;
            const piece = parsed.choices?.[0]?.delta?.content ?? "";
            if (!piece) continue;
            whole += piece;
            onDelta(piece, whole);
          } catch {
            // A malformed frame is not worth failing the whole answer over.
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (options.whole && stopped === "length") throw cutOff();

  const text = whole.trim();
  if (text) return text;

  // An empty stream means the budget went somewhere else; ask again plainly.
  const whole2 = await ask(config, prompt, options);
  onDelta(whole2, whole2);
  return whole2;
}

function buildPayload(prompt: string, options: AskOptions): Record<string, unknown> {
  return buildTurnPayload(
    [
      { role: "system", content: options.system ?? "" },
      { role: "user", content: prompt },
    ],
    options
  );
}

function buildTurnPayload(
  messages: ChatMessage[],
  options: AskOptions,
  variant = ""
): Record<string, unknown> {
  const { temperature = 0.5, maxTokens = 900, json = false, effort = "none" } = options;
  if (!messages.some((m) => m.content.trim() || m.tool_calls?.length)) {
    throw new AiError("Nothing to ask.", 400);
  }
  const { model } = readCredentials();
  const name = model || DEFAULT_MODEL;
  const payload: Record<string, unknown> = {
    model: name,
    messages,
    temperature,
    // These are reasoning models: without this, a short budget is spent thinking
    // and the reply comes back empty. Copy-editing does not need deliberation.
    reasoning_effort: effort,
    max_completion_tokens: Math.min(Math.max(maxTokens, 64), 16000),
    ...(json ? { response_format: { type: "json_object" } } : {}),
  };
  for (const param of refusedBy(name + variant)) delete payload[param];
  return payload;
}

/**
 * One turn of a conversation that may reach for a tool.
 *
 * The model does not run anything: it names a tool and its arguments, the desk
 * runs it, and the result goes back in as another message. That is the whole
 * trick, and keeping it here means the loop above can stay about the work.
 */
export async function askTurn(
  _config: AiConfig,
  messages: ChatMessage[],
  options: AskOptions & { tools?: ToolSpec[]; force?: string } = {}
): Promise<Turn> {
  const wired = Boolean(options.tools?.length);
  // What a model accepts with tools bolted on is a different question from what
  // it accepts bare, so it is remembered as a different question.
  const payload = buildTurnPayload(messages, options, wired ? TOOL_VARIANT : "");
  if (wired) {
    payload.tools = options.tools!.map((tool) => ({
      type: "function",
      function: { name: tool.name, description: tool.description, parameters: tool.parameters },
    }));
    payload.tool_choice = options.force
      ? { type: "function", function: { name: options.force } }
      : "auto";
    // This endpoint will not run a function call while it is also deliberating,
    // and it will not take silence for an answer: the budget must be named none.
    payload.reasoning_effort = "none";
  }

  const response = await postChat(payload, options.signal, wired ? TOOL_VARIANT : "");
  const text = await response.text();
  if (!response.ok) throw new AiError(readOpenAiError(text), response.status);

  const parsed = JSON.parse(text) as {
    choices?: { message?: ChatMessage; finish_reason?: string }[];
  };
  if (parsed.choices?.[0]?.finish_reason === "length") throw cutOff();
  const message = parsed.choices?.[0]?.message ?? { role: "assistant" as const, content: "" };
  const calls: ToolCall[] = (message.tool_calls ?? []).map((call) => {
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(call.function.arguments || "{}") as Record<string, unknown>;
    } catch {
      // A model that mangles its own arguments is told so by the executor.
    }
    return { id: call.id, name: call.function.name, args };
  });

  return {
    content: (message.content ?? "").trim(),
    calls,
    message: { ...message, role: "assistant", content: message.content ?? "" },
  };
}

/**
 * Sends the payload, negotiating the parameters and the model name the way this
 * key's generation of the API actually accepts them.
 */
async function postChat(
  payload: Record<string, unknown>,
  signal?: AbortSignal,
  variant = ""
): Promise<Response> {
  const { openai: key } = readCredentials();
  if (!key) throw new AiError("No assistant key on this desk.", 503);

  const send = (data: Record<string, unknown>) =>
    fetch(OPENAI_CHAT, {
      method: "POST",
      signal,
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify(data),
    });

  const OPTIONAL = ["reasoning_effort", "temperature", "max_completion_tokens", "response_format", "stream"];
  let response = await send(payload);

  // Each generation refuses a different set of knobs, and only names one at a
  // time, so drop what it names and ask again rather than guessing up front.
  for (let attempt = 0; attempt < OPTIONAL.length; attempt += 1) {
    if (response.status !== 400 && response.status !== 404) break;
    const detail = await response.text();
    const complaint = readOpenAiComplaint(detail);

    // "param" is the API saying which field it means. The prose is not: a
    // refused temperature is reported as an unsupported value "with this
    // model", which reads exactly like a missing model if you only grep.
    if (complaint.param === "model" || complaint.code === "model_not_found") {
      const wanted = String(payload.model);
      const available = await listModels(key);
      const match = available.find((id) => loosely(id) === loosely(wanted));
      if (!match) {
        throw new AiError(
          `No model called "${wanted}". This key can reach: ${available.slice(0, 40).join(", ") || "nothing"}.`,
          404
        );
      }
      payload.model = match;
      response = await send(payload);
      continue;
    }

    const named =
      OPTIONAL.find((param) => param === complaint.param && param in payload) ??
      OPTIONAL.find((param) => param in payload && detail.includes(param));
    if (!named) throw new AiError(complaint.message, response.status);
    rememberRefusal(String(payload.model) + variant, named);
    delete payload[named];
    response = await send(payload);
  }

  return response;
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

/** A model asked for JSON can still return prose around it, or nothing at all. */
const readJson = (raw: string): Record<string, unknown> => {
  try {
    return JSON.parse(stripFence(raw).match(/\{[\s\S]*\}/)?.[0] ?? "{}") as Record<string, unknown>;
  } catch {
    return {};
  }
};

/**
 * Inline continuation for the ghost-text completion. Deliberately short: it should
 * finish the writer's thought, not take the piece over.
 */
export async function completeInline(
  config: AiConfig,
  context: { before: string; after: string; title: string },
  signal?: AbortSignal
): Promise<string> {
  const prompt = `Continue the draft at the cursor, in the writer's own voice.

Rules:
- Return ONLY the continuation text. No preamble, no quotes, no markdown fence.
- At most one sentence, or finish the sentence in progress.
- If the text before the cursor ends mid-word, complete that word first.
- If it ends a finished sentence, begin a new one that carries the paragraph on.
- The text after the cursor already exists: lead towards it, never repeat it,
  and do not write past it.
- Match the existing tense, register and paragraph rhythm.
- Invent no facts, names, numbers or dates.

Working title: ${context.title || "(untitled)"}

--- TEXT BEFORE CURSOR ---
${context.before.slice(-2400)}
--- TEXT AFTER CURSOR ---
${context.after.slice(0, 600)}`;

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
// Research the desk can read from a browser
// ------------------------------------------------------------

export interface ResearchHit {
  title: string;
  url: string;
  snippet: string;
  origin: "news" | "web" | "reference";
}

/**
 * Pull public reference material the desk can show and feed to the model.
 *
 * Without a server this is what a browser is actually allowed to read:
 * MediaWiki answers cross-origin requests when asked with `origin=*`, while a
 * news feed or a search-results page does not. Narrower than the old
 * server-side sweep, and honest about it — the model is told these are the only
 * results, so it cites Wikipedia or it cites nothing.
 */
export async function fetchResearch(
  query: string,
  signal?: AbortSignal
): Promise<ResearchHit[]> {
  const wanted = query.trim().slice(0, 200);
  if (wanted.length < 2) return [];
  const api = new URL("https://en.wikipedia.org/w/api.php");
  api.search = new URLSearchParams({
    action: "query",
    list: "search",
    srsearch: wanted,
    srlimit: "8",
    format: "json",
    formatversion: "2",
    origin: "*",
  }).toString();

  const res = await fetch(api.toString(), { signal });
  if (!res.ok) throw new AiError(`Research failed (${res.status}).`, res.status);
  const data = (await res.json()) as {
    query?: { search?: { title: string; snippet?: string }[] };
  };
  return (data.query?.search ?? []).map((row) => ({
    title: row.title,
    url: `https://en.wikipedia.org/wiki/${encodeURIComponent(row.title.replace(/ /g, "_"))}`,
    snippet: (row.snippet ?? "").replace(/<[^>]*>/g, "").replace(/&quot;/g, '"').replace(/&amp;/g, "&").slice(0, 280),
    origin: "reference" as const,
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

  const parsed = readJson(raw);
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
