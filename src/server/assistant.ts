// ============================================================
// THE ASSISTANT, WHEN THE DESK KEEPS THE KEY
// ------------------------------------------------------------
// A writer should not have to hold an API key to be helped with
// her own sentences. Bind OPENAI_KEY and the desk stops asking:
// calls come through here instead, with the same gate as the
// sign-in — the caller proves she is the writer by presenting the
// GitHub token she signed in with.
//
// Bind nothing and none of this exists; the desk asks for a key
// and talks to OpenAI directly, as it always has.
// ============================================================

import type { ApiEnv } from "./env";
import { HttpError, json, readJson, type Exchange } from "./http";
import { requireWriter } from "./auth";
import { enforce } from "./rate-limit";

const OPENAI_CHAT = "https://api.openai.com/v1/chat/completions";
const OPENAI_MODELS = "https://api.openai.com/v1/models";
/** A long rewrite with reasoning can take a while; a hung upstream cannot take forever. */
const UPSTREAM_TIMEOUT_MS = 120_000;

/**
 * Only these request fields reach OpenAI. The desk sends a chat payload; anything
 * else (a different endpoint's fields, a stray `n: 50`) is dropped rather than paid for.
 */
const PASSTHROUGH = new Set([
  "messages",
  "stream",
  "stream_options",
  "temperature",
  "top_p",
  "max_tokens",
  "max_completion_tokens",
  "response_format",
  "tools",
  "tool_choice",
  "parallel_tool_calls",
  "reasoning_effort",
  "verbosity",
  "stop",
  "presence_penalty",
  "frequency_penalty",
  "seed",
  "user",
]);

/** Which model this key can actually reach, asked once and remembered. */
let chosenModel = "";
/** Why it could not be asked, when it could not. */
let modelTrouble = "";
let modelCheckedAt = 0;
const MODEL_RETRY_MS = 5 * 60_000;

/** OpenAI's own words, which are the only useful ones when a key is refused. */
export function readOpenAiError(raw: string): string {
  try {
    return (JSON.parse(raw) as { error?: { message?: string } }).error?.message ?? "The assistant key was refused.";
  } catch {
    return "The assistant key was refused.";
  }
}

/** The house model first, then whatever this key does have. */
export function pickModel(ids: string[]): string {
  const chat = ids.filter((id) => id.startsWith("gpt-") && !/(audio|realtime|transcribe|tts|image|search)/.test(id));
  for (const wanted of [/^gpt-5\.6/, /^gpt-5(?!.*mini|.*nano)/, /^gpt-5/, /^gpt-4\.1/, /^gpt-4o/, /^gpt-/]) {
    const found = chat.find((id) => wanted.test(id));
    if (found) return found;
  }
  return "";
}

export async function assistantModel(env: ApiEnv): Promise<string> {
  if (env.OPENAI_MODEL) return env.OPENAI_MODEL;
  if (chosenModel) return chosenModel;
  // A refused key is not asked again on every request.
  if (modelTrouble && Date.now() - modelCheckedAt < MODEL_RETRY_MS) return "";

  modelCheckedAt = Date.now();
  try {
    const response = await fetch(OPENAI_MODELS, {
      headers: { authorization: `Bearer ${env.OPENAI_KEY}` },
      signal: AbortSignal.timeout(10_000),
    });
    const body = await response.text();
    if (!response.ok) {
      modelTrouble = readOpenAiError(body);
      return "";
    }
    const ids = ((JSON.parse(body) as { data?: { id: string }[] }).data ?? []).map((model) => model.id);
    chosenModel = pickModel(ids);
    modelTrouble = chosenModel ? "" : `This key reaches no chat model. It offers: ${ids.slice(0, 10).join(", ") || "nothing"}.`;
  } catch (error) {
    modelTrouble = `OpenAI could not be reached: ${(error as Error).message}`;
  }
  return chosenModel;
}

export async function assistantStatus(exchange: Exchange): Promise<Response> {
  const { env } = exchange;
  if (!env.OPENAI_KEY) return json({ available: false });
  const model = await assistantModel(env);
  return json({ available: Boolean(model), ...(model ? { model } : { note: modelTrouble }) });
}

export async function handleAssistant(exchange: Exchange): Promise<Response> {
  const { env, request } = exchange;
  if (!env.OPENAI_KEY) throw new HttpError(501, "not_configured", "This desk holds no assistant key.");

  const login = await requireWriter(request, env, "This assistant belongs to someone else.");
  await enforce(env, "assistant", login.toLowerCase());

  const incoming = await readJson<Record<string, unknown>>(request);
  if (!Array.isArray(incoming.messages) || incoming.messages.length === 0) {
    throw new HttpError(400, "missing_messages", "The assistant was sent nothing to read.");
  }
  const payload: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(incoming)) if (PASSTHROUGH.has(field)) payload[field] = value;

  // The model belongs to whoever holds the key, not to whoever is typing.
  const model = await assistantModel(env);
  payload.model = model || (typeof incoming.model === "string" ? incoming.model : "");
  if (!payload.model) throw new HttpError(503, "no_model", modelTrouble || "No assistant model is available.");

  // If the writer closes the tab, stop paying for the answer.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  request.signal?.addEventListener?.("abort", () => controller.abort(), { once: true });

  let upstream: Response;
  try {
    upstream = await fetch(OPENAI_CHAT, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${env.OPENAI_KEY}` },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timer);
    throw new HttpError(504, "upstream_timeout", `The assistant did not answer: ${(error as Error).message}`);
  }
  // Streamed bodies keep flowing after this returns; the timer only guards the connect.
  if (!payload.stream) clearTimeout(timer);

  // The body is passed through as it arrives, so a streamed answer stays streamed.
  const headers = new Headers();
  headers.set("content-type", upstream.headers.get("content-type") ?? "application/json");
  headers.set("cache-control", "no-store");
  return new Response(upstream.body, { status: upstream.status, headers });
}

/** Tests only. */
export const resetAssistant = (): void => {
  chosenModel = "";
  modelTrouble = "";
  modelCheckedAt = 0;
};
