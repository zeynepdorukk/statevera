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

/** A signed-in session may only touch the content folder. */
const WRITEABLE = /^src\/content\/articles\/[a-z0-9][a-z0-9-]*\.mdx$/;
/** Pictures imported from the web land here, and nowhere else. */
const IMAGE_WRITEABLE = /^public\/images\/articles\/[a-z0-9][a-z0-9-]*\.(jpg|png)$/;
const READABLE_DIRS = new Set(["src/content/articles", "public/images/articles"]);

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

/** Chunked so a multi-megabyte picture does not blow the argument limit. */
const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
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
// Photographs from the web
// ------------------------------------------------------------
// Wikimedia Commons is the only source. It needs no key, and every file
// carries the author and the licence, which is what a published picture
// needs and what a general image search will not give you.

const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
/** The only host a picture may be fetched from. Anything else is an open proxy. */
const COMMONS_FILES = "upload.wikimedia.org";
const AGENT = "Statevera editorial desk (https://statevera.netlify.app)";

export interface Photo {
  file: string;
  title: string;
  thumb: string;
  width: number;
  height: number;
  artist: string;
  licence: string;
  source: string;
  credit: string;
}

/** Commons returns author and description as HTML fragments. */
const plain = (html: string): string =>
  html
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

interface CommonsPage {
  title?: string;
  imageinfo?: {
    url?: string;
    width?: number;
    height?: number;
    thumburl?: string;
    descriptionurl?: string;
    extmetadata?: Record<string, { value?: string }>;
  }[];
}

async function searchPhotos(query: string, limit: number): Promise<Photo[]> {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    generator: "search",
    gsrsearch: `filetype:bitmap ${query}`,
    gsrnamespace: "6",
    gsrlimit: String(limit),
    prop: "imageinfo",
    iiprop: "url|size|extmetadata",
    iiurlwidth: "420",
  });
  const response = await fetch(`${COMMONS_API}?${params}`, {
    headers: { "user-agent": AGENT, accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Wikimedia Commons answered ${response.status}.`);
  const body = (await response.json()) as { query?: { pages?: CommonsPage[] } };

  const photos: Photo[] = [];
  for (const page of body.query?.pages ?? []) {
    const info = page.imageinfo?.[0];
    const meta = info?.extmetadata ?? {};
    if (!info?.thumburl || !info.width || !info.height) continue;
    // Below this a picture cannot carry a lead slot, so it is not worth offering.
    if (info.width < 900) continue;

    const artist = plain(meta.Artist?.value ?? "");
    const licence = plain(meta.LicenseShortName?.value ?? "");
    const label = plain(meta.ObjectName?.value ?? "") || (page.title ?? "").replace(/^File:|\.\w+$/g, "");
    photos.push({
      file: (page.title ?? "").replace(/^File:/, ""),
      title: label,
      thumb: info.thumburl,
      width: info.width,
      height: info.height,
      artist,
      licence,
      source: info.descriptionurl ?? "",
      credit: [label, artist, licence].filter(Boolean).join(". ") + (artist || licence ? "." : ""),
    });
  }
  return photos;
}

/**
 * Commons only renders thumbnails at certain widths, and which ones is not
 * predictable from the URL, so the address of a publishable copy is asked for
 * rather than guessed. Taking a file title instead of a URL also means the
 * browser never chooses what the server fetches.
 */
async function publishableUrl(file: string): Promise<string> {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    titles: `File:${file}`,
    prop: "imageinfo",
    iiprop: "url|size",
    iiurlwidth: "1280",
  });
  const response = await fetch(`${COMMONS_API}?${params}`, {
    headers: { "user-agent": AGENT, accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Wikimedia Commons answered ${response.status}.`);
  const body = (await response.json()) as { query?: { pages?: CommonsPage[] } };
  const info = body.query?.pages?.[0]?.imageinfo?.[0];
  const url = (info?.width ?? 0) > 1280 ? info?.thumburl : info?.url;
  if (!url) throw new Error("Commons has no copy of that file.");
  return url;
}

/** Fetches the bytes of one Commons file, refusing any other host. */
async function fetchPhotoBytes(rawUrl: string): Promise<{ bytes: Uint8Array; type: string }> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("That is not a picture address.");
  }
  if (url.protocol !== "https:" || url.hostname !== COMMONS_FILES) {
    throw new Error("Pictures may only come from Wikimedia Commons.");
  }
  const response = await fetch(url.toString(), { headers: { "user-agent": AGENT } });
  if (!response.ok) throw new Error(`Could not fetch that picture (${response.status}).`);
  const type = response.headers.get("content-type") ?? "";
  if (!/^image\/(jpeg|png)$/.test(type)) throw new Error("That file is not a JPEG or a PNG.");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > 8 * 1024 * 1024) throw new Error("That picture is too large to file.");
  return { bytes, type };
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
      // An empty publication has no content folders in the repository at all.
      const [articles, images] = await Promise.all([
        listDirectory(env, "src/content/articles").catch(() => [] as Entry[]),
        listDirectory(env, "public/images/articles").catch(() => [] as Entry[]),
      ]);
      const slim = (entries: Entry[]) => entries.map(({ name, path, sha }) => ({ name, path, sha }));
      return json({
        articles: slim(articles.filter((f) => /\.mdx?$/.test(f.name))),
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

    if (route === "file" && request.method === "DELETE") {
      if (!env.GITHUB_TOKEN) return fail(503, "This deployment cannot publish: no GitHub token on the server.");
      const body = (await request.json().catch(() => ({}))) as {
        path?: string;
        message?: string;
        sha?: string;
      };
      if (!WRITEABLE.test(body.path ?? "")) return fail(400, "That file is out of bounds.");
      // GitHub needs the exact blob it is removing, which also stops a stale
      // desk from deleting a piece someone edited in the meantime.
      if (!body.sha) return fail(400, "That piece has no version to delete.");
      await githubJson(env, `/contents/${body.path}`, {
        method: "DELETE",
        body: JSON.stringify({ message: body.message || `Delete ${body.path}`, sha: body.sha }),
      });
      return json({ deleted: true });
    }

    if (route === "models" && request.method === "GET") {
      if (!env.OPENAI_KEY) return fail(503, "No assistant key on the server.");
      return json({ using: modelOf(env), available: (await listModels(env)).sort() });
    }

    if (route === "photos" && request.method === "GET") {
      const query = (url.searchParams.get("q") ?? "").trim().slice(0, 120);
      if (!query) return fail(400, "Say what to look for.");
      return json({ photos: await searchPhotos(query, 24) });
    }

    // Filing a picture copies it into the repository: the publication then owns
    // its own copy, and no page depends on a link somewhere else staying up.
    if (route === "photos" && request.method === "POST") {
      if (!env.GITHUB_TOKEN) return fail(503, "This deployment cannot publish: no GitHub token on the server.");
      const body = (await request.json().catch(() => ({}))) as { file?: string; name?: string };
      const file = (body.file ?? "").trim();
      if (!file || file.includes("/") || file.length > 240) return fail(400, "That is not a Commons file.");
      const remote = await publishableUrl(file);
      const { bytes, type } = await fetchPhotoBytes(remote);
      const path = `public/images/articles/${(body.name ?? "").trim()}.${type === "image/png" ? "png" : "jpg"}`;
      if (!IMAGE_WRITEABLE.test(path)) return fail(400, "That is not a usable file name.");

      const existing = await githubJson<{ sha?: string }>(env, `/contents/${path}?ref=HEAD`).catch(
        () => ({}) as { sha?: string }
      );
      await githubJson(env, `/contents/${path}`, {
        method: "PUT",
        body: JSON.stringify({
          message: `Add picture ${path.split("/").pop()}`,
          content: bytesToBase64(bytes),
          ...(existing.sha ? { sha: existing.sha } : {}),
        }),
      });
      // The picture is in the repository but not yet in a build, so the desk is
      // handed back where to preview it from until the site catches up.
      return json({ name: path.split("/").pop(), preview: remote });
    }

    if (route === "ai" && request.method === "POST") {
      if (!env.OPENAI_KEY) return fail(503, "No assistant key on the server.");
      const body = (await request.json().catch(() => ({}))) as AskBody;
      if (!body.prompt?.trim()) return fail(400, "Nothing to ask.");
      return json({ text: await askOpenAI(env, body, request.signal) });
    }

    // Key-less public search for the desk assistant (research / sources).
    // Never returns raw HTML to the browser — only title, url, snippet, origin.
    if (route === "research" && request.method === "POST") {
      const body = (await request.json().catch(() => ({}))) as { query?: string };
      const query = (body.query ?? "").trim().slice(0, 200);
      if (query.length < 2) return fail(400, "Say what to look up.");
      return json({ query, results: await researchWeb(query, request.signal) });
    }
  } catch (error) {
    return fail(502, (error as Error).message);
  }

  return fail(404, "No such endpoint.");
}

// ------------------------------------------------------------
// Research (key-less public sources for the desk assistant)
// ------------------------------------------------------------

export interface ResearchHit {
  title: string;
  url: string;
  snippet: string;
  origin: "news" | "web" | "reference";
}

const RESEARCH_AGENT = "Statevera editorial desk (https://statevera.netlify.app)";

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function stripTags(value: string): string {
  return decodeEntities(value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function cleanUrl(raw: string): string {
  try {
    // DuckDuckGo wraps outbound links as //duckduckgo.com/l/?uddg=<encoded>
    if (raw.includes("uddg=")) {
      const u = new URL(raw.startsWith("http") ? raw : `https:${raw}`);
      const target = u.searchParams.get("uddg");
      if (target) return decodeURIComponent(target);
    }
    const u = new URL(raw);
    if (!/^https?:$/.test(u.protocol)) return "";
    return u.toString();
  } catch {
    return "";
  }
}

async function researchNews(query: string, signal?: AbortSignal): Promise<ResearchHit[]> {
  const url =
    "https://news.google.com/rss/search?q=" +
    encodeURIComponent(query) +
    "&hl=en-GB&gl=GB&ceid=GB:en";
  const res = await fetch(url, {
    signal,
    headers: { "user-agent": RESEARCH_AGENT, accept: "application/rss+xml, application/xml, text/xml" },
  });
  if (!res.ok) return [];
  const xml = await res.text();
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0, 8);
  return items
    .map((m) => {
      const block = m[1];
      const title = stripTags(block.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? "");
      const link = cleanUrl(stripTags(block.match(/<link>([\s\S]*?)<\/link>/i)?.[1] ?? ""));
      const snippet = stripTags(block.match(/<description>([\s\S]*?)<\/description>/i)?.[1] ?? "").slice(0, 280);
      if (!title || !link) return null;
      return { title, url: link, snippet, origin: "news" as const };
    })
    .filter(Boolean) as ResearchHit[];
}

async function researchWeb(query: string, signal?: AbortSignal): Promise<ResearchHit[]> {
  const [news, web, reference] = await Promise.all([
    researchNews(query, signal).catch(() => [] as ResearchHit[]),
    researchDdg(query, signal).catch(() => [] as ResearchHit[]),
    researchWiki(query, signal).catch(() => [] as ResearchHit[]),
  ]);

  const seen = new Set<string>();
  const out: ResearchHit[] = [];
  for (const hit of [...news, ...reference, ...web]) {
    const key = hit.url.replace(/\/$/, "").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(hit);
    if (out.length >= 12) break;
  }
  return out;
}

async function researchDdg(query: string, signal?: AbortSignal): Promise<ResearchHit[]> {
  const url = "https://html.duckduckgo.com/html/?q=" + encodeURIComponent(query);
  const res = await fetch(url, {
    signal,
    headers: {
      "user-agent": RESEARCH_AGENT,
      accept: "text/html",
    },
  });
  if (!res.ok) return [];
  const html = await res.text();
  const hits: ResearchHit[] = [];
  const re =
    /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|td)>|)/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) && hits.length < 8) {
    const href = cleanUrl(decodeEntities(match[1]));
    const title = stripTags(match[2]);
    const snippet = stripTags(match[3] ?? "").slice(0, 280);
    if (!href || !title) continue;
    if (/duckduckgo\.com/i.test(href)) continue;
    hits.push({ title, url: href, snippet, origin: "web" });
  }
  return hits;
}

async function researchWiki(query: string, signal?: AbortSignal): Promise<ResearchHit[]> {
  const api =
    "https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=" +
    encodeURIComponent(query) +
    "&srlimit=4&utf8=&format=json&origin=*";
  const res = await fetch(api, {
    signal,
    headers: { "user-agent": RESEARCH_AGENT, accept: "application/json" },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    query?: { search?: { title: string; snippet: string; pageid: number }[] };
  };
  return (data.query?.search ?? []).map((row) => ({
    title: row.title,
    url: `https://en.wikipedia.org/wiki/${encodeURIComponent(row.title.replace(/ /g, "_"))}`,
    snippet: stripTags(row.snippet).slice(0, 280),
    origin: "reference" as const,
  }));
}
