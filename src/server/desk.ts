// ============================================================
// THE DESK — server side
// ------------------------------------------------------------
// Everything the browser must never see lives here: the OpenAI
// key, the GitHub token and the password. The writer signs in
// with a name and a password and gets an HttpOnly cookie back;
// every privileged call goes through this router.
//
// The same handler runs as a Cloudflare Pages Function in
// production and behind the Astro dev server locally, so there
// is only one implementation to reason about.
// ============================================================

export interface DeskEnv {
  EDITOR_USER?: string;
  EDITOR_PASSWORD?: string;
  SESSION_SECRET?: string;
  OPENAI_KEY?: string;
  OPENAI_MODEL?: string;
  GITHUB_TOKEN?: string;
  GITHUB_REPO?: string;
}

const DEFAULT_USER = "zeynepdoruk";
const DEFAULT_REPO = "zeynepdorukk/statevera";
const COOKIE = "sv_session";
const SESSION_MS = 12 * 60 * 60 * 1000;

/** The catalogue writes it GPT-5.6 Luna; the API id is lower case with dots. */
const DEFAULT_MODEL = "gpt-5.6-luna";
const modelOf = (env: DeskEnv): string => env.OPENAI_MODEL?.trim() || DEFAULT_MODEL;

/** A signed-in session may only touch the two content folders. */
const WRITEABLE = /^src\/content\/(articles|explainers)\/[a-z0-9][a-z0-9-]*\.mdx$/;
const READABLE_DIRS = new Set([
  "src/content/articles",
  "src/content/explainers",
  "public/images/articles",
]);

const encoder = new TextEncoder();

// ------------------------------------------------------------
// Small helpers
// ------------------------------------------------------------

const json = (data: unknown, init: ResponseInit = {}): Response =>
  new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...(init.headers ?? {}),
    },
  });

const fail = (status: number, message: string): Response => json({ error: message }, { status });

const hex = (buffer: ArrayBuffer): string =>
  [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return hex(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
}

/** Compares without leaking where two strings start to differ. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function readCookie(request: Request, name: string): string {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return "";
}

const toBase64 = (text: string): string => {
  const bytes = encoder.encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

const fromBase64 = (value: string): string => {
  const binary = atob(value.replace(/\s/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
};

// ------------------------------------------------------------
// Session
// ------------------------------------------------------------

async function issueSession(user: string, env: DeskEnv): Promise<string> {
  const expiry = Date.now() + SESSION_MS;
  const payload = `${user}.${expiry}`;
  return `${payload}.${await hmacHex(env.SESSION_SECRET!, payload)}`;
}

async function readSession(request: Request, env: DeskEnv): Promise<string | null> {
  if (!env.SESSION_SECRET) return null;
  const raw = readCookie(request, COOKIE);
  const parts = raw.split(".");
  if (parts.length !== 3) return null;
  const [user, expiry, signature] = parts;
  if (!Number(expiry) || Number(expiry) < Date.now()) return null;
  const expected = await hmacHex(env.SESSION_SECRET, `${user}.${expiry}`);
  return safeEqual(signature, expected) ? user : null;
}

const sessionCookie = (value: string, maxAgeSeconds: number): string =>
  `${COOKIE}=${encodeURIComponent(value)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}`;

/**
 * SameSite=Lax already blocks cross-site form posts, but an explicit origin
 * check costs nothing and closes the gap for anything that sets Lax aside.
 */
function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

// ------------------------------------------------------------
// GitHub
// ------------------------------------------------------------

async function github(env: DeskEnv, path: string, init: RequestInit = {}): Promise<Response> {
  const repo = env.GITHUB_REPO || DEFAULT_REPO;
  // The repository is public, so reads work without a token. Writes do not.
  return fetch(`https://api.github.com/repos/${repo}${path}`, {
    ...init,
    headers: {
      accept: "application/vnd.github+json",
      ...(env.GITHUB_TOKEN ? { authorization: `Bearer ${env.GITHUB_TOKEN}` } : {}),
      "user-agent": "statevera-desk",
      "x-github-api-version": "2022-11-28",
      ...(init.headers ?? {}),
    },
  });
}

async function githubJson<T>(env: DeskEnv, path: string, init?: RequestInit): Promise<T> {
  const response = await github(env, path, init);
  const text = await response.text();
  if (!response.ok) {
    let detail = `${response.status}`;
    try {
      detail = (JSON.parse(text) as { message?: string }).message ?? detail;
    } catch {
      /* keep the status */
    }
    throw new Error(`GitHub: ${detail}`);
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

interface Entry {
  name: string;
  path: string;
  sha: string;
  type: string;
}

async function listDirectory(env: DeskEnv, directory: string): Promise<Entry[]> {
  if (!READABLE_DIRS.has(directory)) throw new Error("That folder is not available.");
  const entries = await githubJson<Entry[]>(env, `/contents/${directory}?ref=HEAD`);
  return Array.isArray(entries) ? entries.filter((e) => e.type === "file") : [];
}

// ------------------------------------------------------------
// OpenAI
// ------------------------------------------------------------

interface AskBody {
  prompt?: string;
  system?: string;
  temperature?: number;
  maxTokens?: number;
  jsonOnly?: boolean;
}

async function listModels(env: DeskEnv): Promise<string[]> {
  const response = await fetch("https://api.openai.com/v1/models", {
    headers: { authorization: `Bearer ${env.OPENAI_KEY}` },
  });
  if (!response.ok) return [];
  const listed = (await response.json()) as { data?: { id: string }[] };
  return (listed.data ?? []).map((m) => m.id);
}

/** Model names get written with dots, capitals and underscores interchangeably. */
const loosely = (id: string): string => id.toLowerCase().replace(/[._-]/g, "");

/**
 * Model generations disagree about which parameters they accept, and the name a
 * model is written with is not always the id the API answers to. Rather than
 * guess at either, a rejection is read: a refused parameter is dropped and the
 * call repeated, and a refused model is looked up in the account's real list.
 */
async function askOpenAI(env: DeskEnv, body: AskBody, signal?: AbortSignal): Promise<string> {
  const payload: Record<string, unknown> = {
    model: modelOf(env),
    messages: [
      { role: "system", content: body.system ?? "" },
      { role: "user", content: body.prompt ?? "" },
    ],
    temperature: body.temperature ?? 0.4,
    // These are reasoning models: without this, a short budget is spent thinking
    // and the reply comes back empty. Copy-editing does not need deliberation.
    reasoning_effort: "none",
    max_completion_tokens: Math.min(Math.max(body.maxTokens ?? 400, 64), 4000),
    ...(body.jsonOnly ? { response_format: { type: "json_object" } } : {}),
  };

  const send = async (data: Record<string, unknown>) =>
    fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.OPENAI_KEY}`,
      },
      body: JSON.stringify(data),
    });

  const OPTIONAL = ["reasoning_effort", "temperature", "max_completion_tokens", "response_format"];
  let response = await send(payload);

  // Each generation refuses a different set of knobs, and only names one at a
  // time, so drop what it names and ask again rather than guessing up front.
  for (let attempt = 0; attempt < OPTIONAL.length; attempt += 1) {
    if (response.status !== 400 && response.status !== 404) break;
    const detail = await response.text();

    if (/model/i.test(detail) && /does not exist|not found|unsupported/i.test(detail)) {
      const wanted = String(payload.model);
      const available = await listModels(env);
      const match = available.find((id) => loosely(id) === loosely(wanted));
      if (!match) {
        throw new Error(
          `No model called "${wanted}". This key can reach: ${available.slice(0, 40).join(", ") || "nothing"}.`
        );
      }
      payload.model = match;
      response = await send(payload);
      continue;
    }

    const named = OPTIONAL.find((param) => param in payload && detail.includes(param));
    if (!named) throw new Error(readOpenAiError(detail));
    delete payload[named];
    response = await send(payload);
  }

  const text = await response.text();
  if (!response.ok) throw new Error(readOpenAiError(text));

  const parsed = JSON.parse(text) as { choices?: { message?: { content?: string } }[] };
  return parsed.choices?.[0]?.message?.content?.trim() ?? "";
}

function readOpenAiError(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string } };
    return parsed.error?.message ?? "The assistant refused that request.";
  } catch {
    return "The assistant refused that request.";
  }
}

// ------------------------------------------------------------
// Router
// ------------------------------------------------------------

export async function handleDesk(request: Request, env: DeskEnv): Promise<Response> {
  const url = new URL(request.url);
  const route = url.pathname.replace(/^.*\/api\//, "");
  const configured = Boolean(env.SESSION_SECRET && env.EDITOR_PASSWORD);

  if (request.method !== "GET" && !sameOrigin(request)) return fail(403, "Cross-site request refused.");

  // ---- who am I -------------------------------------------------
  if (route === "session" && request.method === "GET") {
    const user = configured ? await readSession(request, env) : null;
    return json({
      configured,
      signedIn: Boolean(user),
      user: user ?? "",
      assistant: Boolean(env.OPENAI_KEY),
      canPublish: Boolean(env.GITHUB_TOKEN),
      model: modelOf(env),
    });
  }

  // ---- sign in --------------------------------------------------
  if (route === "login" && request.method === "POST") {
    if (!configured) return fail(503, "The desk is not configured yet.");
    const body = (await request.json().catch(() => ({}))) as { user?: string; password?: string };
    // A flat delay on every attempt removes the timing signal and slows guessing.
    await new Promise((resolve) => setTimeout(resolve, 400));
    const expectedUser = env.EDITOR_USER || DEFAULT_USER;
    const ok =
      safeEqual((body.user ?? "").trim().toLowerCase(), expectedUser.toLowerCase()) &&
      safeEqual(body.password ?? "", env.EDITOR_PASSWORD!);
    if (!ok) return fail(401, "That name and password do not match.");
    return json(
      {
        signedIn: true,
        user: expectedUser,
        assistant: Boolean(env.OPENAI_KEY),
        canPublish: Boolean(env.GITHUB_TOKEN),
        model: modelOf(env),
      },
      { headers: { "set-cookie": sessionCookie(await issueSession(expectedUser, env), SESSION_MS / 1000) } }
    );
  }

  if (route === "logout" && request.method === "POST") {
    return json({ signedIn: false }, { headers: { "set-cookie": sessionCookie("", 0) } });
  }

  // ---- everything below needs a session -------------------------
  if (!configured) return fail(503, "The desk is not configured yet.");
  if (!(await readSession(request, env))) return fail(401, "Sign in again.");

  try {
    if (route === "library" && request.method === "GET") {
      const [articles, explainers, images] = await Promise.all([
        listDirectory(env, "src/content/articles"),
        listDirectory(env, "src/content/explainers"),
        listDirectory(env, "public/images/articles").catch(() => [] as Entry[]),
      ]);
      const slim = (entries: Entry[]) => entries.map(({ name, path, sha }) => ({ name, path, sha }));
      return json({
        articles: slim(articles.filter((f) => /\.mdx?$/.test(f.name))),
        explainers: slim(explainers.filter((f) => /\.mdx?$/.test(f.name))),
        images: images
          .filter((f) => /\.(jpe?g|png|webp|avif)$/i.test(f.name))
          .map((f) => f.name),
      });
    }

    if (route === "file" && request.method === "GET") {
      const path = url.searchParams.get("path") ?? "";
      if (!WRITEABLE.test(path)) return fail(400, "That file is out of bounds.");
      const file = await githubJson<{ content: string; sha: string }>(
        env,
        `/contents/${path}?ref=HEAD`
      );
      return json({ content: fromBase64(file.content ?? ""), sha: file.sha });
    }

    if (route === "file" && request.method === "PUT") {
      if (!env.GITHUB_TOKEN) return fail(503, "This deployment cannot publish: no GitHub token on the server.");
      const body = (await request.json().catch(() => ({}))) as {
        path?: string;
        content?: string;
        message?: string;
        sha?: string;
      };
      if (!WRITEABLE.test(body.path ?? "")) return fail(400, "That file is out of bounds.");
      if (typeof body.content !== "string" || !body.content.trim()) return fail(400, "Nothing to save.");
      const result = await githubJson<{ content?: { sha?: string } }>(env, `/contents/${body.path}`, {
        method: "PUT",
        body: JSON.stringify({
          message: body.message || `Edit ${body.path}`,
          content: toBase64(body.content),
          ...(body.sha ? { sha: body.sha } : {}),
        }),
      });
      return json({ sha: result.content?.sha ?? "" });
    }

    if (route === "models" && request.method === "GET") {
      if (!env.OPENAI_KEY) return fail(503, "No assistant key on the server.");
      return json({ using: modelOf(env), available: (await listModels(env)).sort() });
    }

    if (route === "ai" && request.method === "POST") {
      if (!env.OPENAI_KEY) return fail(503, "No assistant key on the server.");
      const body = (await request.json().catch(() => ({}))) as AskBody;
      if (!body.prompt?.trim()) return fail(400, "Nothing to ask.");
      return json({ text: await askOpenAI(env, body, request.signal) });
    }
  } catch (error) {
    return fail(502, (error as Error).message);
  }

  return fail(404, "No such endpoint.");
}
