// ============================================================
// EDITOR — the desk's own API
// ------------------------------------------------------------
// There is no server half. The browser holds a fine-grained
// GitHub token scoped to this repository and talks to GitHub
// directly, which is what a git-based desk was always really
// doing — only now without a machine in the middle that has to
// be paid for, kept awake and trusted with the token.
//
// Pushing to the default branch triggers the Pages rebuild.
// ============================================================

import { DEFAULT_MODEL, REPO, clearCredentials, forgetGithubToken, readCredentials, writeCredentials } from "./credentials";
import { site } from "../../site";

export class DeskError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "DeskError";
  }
}

export interface FileEntry {
  name: string;
  path: string;
  sha: string;
  /** Repository frontmatter, read from GitHub rather than a deployed index. */
  draft?: boolean;
  title?: string;
  description?: string;
  date?: string;
  category?: string;
  region?: string;
}

export interface Session {
  signedIn: boolean;
  user: string;
  assistant: boolean;
  canPublish: boolean;
  model: string;
  /** Why a stored token stopped working, when it did. */
  note?: string;
}

export interface Library {
  articles: FileEntry[];
  images: string[];
}

/** A signed-in desk may only touch the content folder. */
const WRITEABLE = /^src\/content\/articles\/[a-z0-9][a-z0-9-]*\.mdx$/;
/** Pictures land here, and nowhere else. */
const IMAGE_WRITEABLE = /^public\/images\/articles\/[a-z0-9][a-z0-9-]*\.(jpg|png|webp)$/;
const DEVICE_IMAGE_MAX_BYTES = 4 * 1024 * 1024;
const DEVICE_IMAGE_TYPES: Record<string, "jpg" | "png" | "webp"> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const signedOut = (note?: string): Session => ({
  signedIn: false,
  user: "",
  assistant: false,
  canPublish: false,
  model: DEFAULT_MODEL,
  ...(note ? { note } : {}),
});

// ------------------------------------------------------------
// Bytes and text
// ------------------------------------------------------------

const encoder = new TextEncoder();

const toBase64 = (text: string): string => {
  let binary = "";
  for (const byte of encoder.encode(text)) binary += String.fromCharCode(byte);
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

const bytesFromBase64 = (value: string): Uint8Array => {
  const compact = value.replace(/\s/g, "");
  if (!compact || !/^[A-Za-z0-9+/]*={0,2}$/.test(compact)) {
    throw new DeskError("That picture could not be read.", 400);
  }
  const binary = atob(compact);
  if (binary.length > DEVICE_IMAGE_MAX_BYTES) {
    throw new DeskError("That picture is too large to file (4 MB maximum).", 400);
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

const textFromBase64 = (value: string): string => {
  const binary = atob(value.replace(/\s/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
};

function isImageBytes(bytes: Uint8Array, type: string): boolean {
  if (type === "image/jpeg") return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/png") return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, i) => bytes[i] === byte);
  if (type === "image/webp") {
    return bytes.length > 12 &&
      String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP";
  }
  return false;
}

// ------------------------------------------------------------
// GitHub
// ------------------------------------------------------------

const token = (): string => readCredentials().github;

async function github<T>(path: string, init: RequestInit = {}): Promise<T> {
  const bearer = token();
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });

  const text = await response.text();
  if (!response.ok) {
    let detail = `GitHub answered ${response.status}.`;
    try {
      const parsed = JSON.parse(text) as { message?: string };
      if (parsed.message) detail = parsed.message;
    } catch {
      /* keep the status */
    }
    if (response.status === 401) detail = "That token was refused. Create a new one and sign in again.";
    if (response.status === 403 && /rate limit/i.test(detail)) {
      detail = "GitHub is rate-limiting this token. Try again shortly.";
    }
    throw new DeskError(detail, response.status);
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

const repoPath = (path: string): string => `/repos/${REPO}${path}`;

interface Entry {
  name: string;
  path: string;
  sha: string;
  type: string;
}

async function listDirectory(directory: string): Promise<Entry[]> {
  const entries = await github<Entry[]>(repoPath(`/contents/${directory}?ref=HEAD`));
  return Array.isArray(entries) ? entries.filter((e) => e.type === "file") : [];
}

interface ArticleMeta {
  /** The content schema defaults an omitted draft flag to false. */
  draft: boolean;
  title?: string;
  description?: string;
  date?: string;
  category?: string;
  region?: string;
}

/** Read the small scalar subset of frontmatter the story list needs. */
function readArticleMeta(raw: string): ArticleMeta {
  const match = raw.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?/);
  const values: Record<string, string> = {};
  for (const line of (match?.[1] ?? "").split(/\r?\n/)) {
    if (!line.trim() || /^\s/.test(line)) continue;
    const field = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!field) continue;
    let value = field[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1).replace(/\\([\\"])/g, "$1");
    }
    values[field[1]] = value;
  }

  return {
    draft: /^true$/i.test(values.draft ?? "false"),
    ...(values.title ? { title: values.title } : {}),
    ...(values.description ? { description: values.description } : {}),
    ...(values.date ? { date: values.date } : {}),
    ...(values.category ? { category: values.category } : {}),
    ...(values.region ? { region: values.region } : {}),
  };
}

// ------------------------------------------------------------
// Session
// ------------------------------------------------------------

interface RepoResponse {
  permissions?: { push?: boolean };
  owner?: { login?: string };
}

/**
 * A token is the sign-in, so checking it means asking GitHub what it can do
 * with this one repository. A fine-grained token need not be able to read the
 * account profile, so the display name falls back to the repository owner.
 */
async function inspectToken(): Promise<Session> {
  const repo = await github<RepoResponse>(repoPath(""));
  const credentials = readCredentials();
  const login = await github<{ login?: string }>("/user")
    .then((user) => user.login ?? "")
    .catch(() => "");
  return {
    signedIn: true,
    user: login || repo.owner?.login || "Editor",
    assistant: Boolean(credentials.openai),
    // A read-only token can still open and draft, so say so rather than
    // refusing the desk outright.
    canPublish: repo.permissions?.push !== false,
    model: credentials.model || DEFAULT_MODEL,
  };
}

export async function readSession(): Promise<Session> {
  if (!token()) return signedOut();
  try {
    return await inspectToken();
  } catch (error) {
    const status = error instanceof DeskError ? error.status : 0;
    // A refused token is worth forgetting; a network hiccup is not. The
    // assistant key stays: a fine-grained token expires on its own schedule and
    // that is no reason to make the writer find a second key again.
    if (status === 401 || status === 403 || status === 404) {
      forgetGithubToken();
      return signedOut((error as Error).message);
    }
    return signedOut();
  }
}

/** An empty assistant key means "keep whatever this browser already holds". */
export async function signIn(githubToken: string, openaiKey: string): Promise<Session> {
  const previous = readCredentials();
  writeCredentials({
    github: githubToken.trim(),
    ...(openaiKey.trim() ? { openai: openaiKey.trim() } : {}),
  });
  try {
    return await inspectToken();
  } catch (error) {
    writeCredentials(previous);
    throw error;
  }
}

export const signOutRequest = async (): Promise<void> => {
  clearCredentials();
};

// ------------------------------------------------------------
// The library
// ------------------------------------------------------------

export async function readLibrary(): Promise<Library> {
  // An empty publication has no content folders in the repository at all.
  const [articles, images] = await Promise.all([
    listDirectory("src/content/articles").catch(() => [] as Entry[]),
    listDirectory("public/images/articles").catch(() => [] as Entry[]),
  ]);

  const files = articles.filter((f) => /\.mdx?$/.test(f.name));
  const withMeta = await Promise.all(
    files.map(async (entry) => {
      const file = await github<{ content?: string }>(repoPath(`/contents/${entry.path}?ref=HEAD`));
      return { name: entry.name, path: entry.path, sha: entry.sha, ...readArticleMeta(textFromBase64(file.content ?? "")) };
    })
  );

  return {
    articles: withMeta,
    images: images.filter((f) => /\.(jpe?g|png|webp|avif)$/i.test(f.name)).map((f) => f.name),
  };
}

/**
 * Read counts live in the one small API the publication still runs. It is
 * optional, so anything short of an answer means the desk shows no number
 * rather than one it cannot stand behind.
 */
export async function readViewCounts(slugs: string[]): Promise<Record<string, number>> {
  const unique = [...new Set(slugs.filter(Boolean))];
  if (!unique.length) return {};
  if (!site.deskUrl) throw new DeskError("No counter is configured.", 501);
  const response = await fetch(
    `${site.deskUrl}/api/views?slugs=${encodeURIComponent(unique.join(","))}`
  );
  const data = (await response.json().catch(() => ({}))) as {
    counts?: Record<string, number>;
    error?: string;
  };
  if (!response.ok) throw new DeskError(data.error ?? "No counter answered.", response.status);
  return data.counts ?? {};
}

export async function readFile(path: string): Promise<{ content: string; sha: string }> {
  if (!WRITEABLE.test(path)) throw new DeskError("That file is out of bounds.", 400);
  const file = await github<{ content?: string; sha?: string }>(repoPath(`/contents/${path}?ref=HEAD`));
  return { content: textFromBase64(file.content ?? ""), sha: file.sha ?? "" };
}

export async function writeFile(
  path: string,
  content: string,
  message: string,
  sha?: string
): Promise<{ sha: string }> {
  if (!WRITEABLE.test(path)) throw new DeskError("That file is out of bounds.", 400);
  if (!content.trim()) throw new DeskError("Nothing to save.", 400);
  const result = await github<{ content?: { sha?: string } }>(repoPath(`/contents/${path}`), {
    method: "PUT",
    body: JSON.stringify({
      message: message || `Edit ${path}`,
      content: toBase64(content),
      ...(sha ? { sha } : {}),
    }),
  });
  return { sha: result.content?.sha ?? "" };
}

export async function deleteFile(path: string, message: string, sha: string): Promise<{ deleted: boolean }> {
  if (!WRITEABLE.test(path)) throw new DeskError("That file is out of bounds.", 400);
  // GitHub needs the exact blob it is removing, which also stops a stale desk
  // from deleting a piece edited in the meantime.
  if (!sha) throw new DeskError("That piece has no version to delete.", 400);
  await github(repoPath(`/contents/${path}`), {
    method: "DELETE",
    body: JSON.stringify({ message: message || `Delete ${path}`, sha }),
  });
  return { deleted: true };
}

async function putImage(path: string, bytes: Uint8Array, message: string): Promise<void> {
  if (!IMAGE_WRITEABLE.test(path)) throw new DeskError("That is not a usable file name.", 400);
  const existing = await github<{ sha?: string }>(repoPath(`/contents/${path}?ref=HEAD`)).catch(
    () => ({}) as { sha?: string }
  );
  await github(repoPath(`/contents/${path}`), {
    method: "PUT",
    body: JSON.stringify({
      message,
      content: bytesToBase64(bytes),
      ...(existing.sha ? { sha: existing.sha } : {}),
    }),
  });
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

export interface Photo {
  file: string;
  title: string;
  thumb: string;
  width: number;
  height: number;
  artist: string;
  licence: string;
  source: string;
  /** A ready-made credit line: label, author, licence. */
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

/**
 * `origin=*` is what makes the MediaWiki API answer an anonymous cross-origin
 * request, and it only works on a request simple enough to skip preflight —
 * hence a plain GET carrying nothing but the query string.
 */
async function commons(params: Record<string, string>): Promise<CommonsPage[]> {
  const query = new URLSearchParams({ format: "json", formatversion: "2", origin: "*", ...params });
  const response = await fetch(`${COMMONS_API}?${query}`);
  if (!response.ok) throw new DeskError(`Wikimedia Commons answered ${response.status}.`, 502);
  const body = (await response.json()) as { query?: { pages?: CommonsPage[] } };
  return body.query?.pages ?? [];
}

export async function searchPhotos(query: string): Promise<{ photos: Photo[] }> {
  const wanted = query.trim().slice(0, 120);
  if (!wanted) throw new DeskError("Say what to look for.", 400);
  const pages = await commons({
    action: "query",
    generator: "search",
    gsrsearch: `filetype:bitmap ${wanted}`,
    gsrnamespace: "6",
    gsrlimit: "24",
    prop: "imageinfo",
    iiprop: "url|size|extmetadata",
    iiurlwidth: "420",
  });

  const photos: Photo[] = [];
  for (const page of pages) {
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
  return { photos };
}

/**
 * Commons only renders thumbnails at certain widths, and which ones is not
 * predictable from the URL, so the address of a publishable copy is asked for
 * rather than guessed.
 */
async function publishableUrl(file: string): Promise<string> {
  const pages = await commons({
    action: "query",
    titles: `File:${file}`,
    prop: "imageinfo",
    iiprop: "url|size",
    iiurlwidth: "1280",
  });
  const info = pages[0]?.imageinfo?.[0];
  const url = (info?.width ?? 0) > 1280 ? info?.thumburl : info?.url;
  if (!url) throw new DeskError("Commons has no copy of that file.", 404);
  return url;
}

/** Fetches the bytes of one Commons file, refusing any other host. */
async function fetchPhotoBytes(rawUrl: string): Promise<{ bytes: Uint8Array; type: string }> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new DeskError("That is not a picture address.", 400);
  }
  if (url.protocol !== "https:" || url.hostname !== COMMONS_FILES) {
    throw new DeskError("Pictures may only come from Wikimedia Commons.", 400);
  }
  const response = await fetch(url.toString());
  if (!response.ok) throw new DeskError(`Could not fetch that picture (${response.status}).`, 502);
  const type = response.headers.get("content-type") ?? "";
  if (!/^image\/(jpeg|png)$/.test(type)) throw new DeskError("That file is not a JPEG or a PNG.", 400);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > 8 * 1024 * 1024) throw new DeskError("That picture is too large to file.", 400);
  return { bytes, type };
}

/**
 * Filing a picture copies it into the repository: the publication then owns its
 * own copy, and no page depends on a link somewhere else staying up.
 */
export async function importPhoto(file: string, name: string): Promise<{ name: string; preview: string }> {
  const wanted = file.trim();
  if (!wanted || wanted.includes("/") || wanted.length > 240) throw new DeskError("That is not a Commons file.", 400);
  const remote = await publishableUrl(wanted);
  const { bytes, type } = await fetchPhotoBytes(remote);
  const path = `public/images/articles/${name.trim()}.${type === "image/png" ? "png" : "jpg"}`;
  await putImage(path, bytes, `Add picture ${path.split("/").pop()}`);
  // The picture is in the repository but not yet in a build, so the desk is
  // handed back where to preview it from until the site catches up.
  return { name: path.split("/").pop() ?? "", preview: remote };
}

/** Files a picture selected on the writer's device. */
export async function uploadImage(
  data: string,
  name: string,
  type: string
): Promise<{ name: string; preview: string }> {
  const kind = type.trim().toLowerCase();
  const extension = DEVICE_IMAGE_TYPES[kind];
  if (!extension) throw new DeskError("Use a JPEG, PNG or WebP image.", 400);
  const stem = name.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(stem)) throw new DeskError("That is not a usable image name.", 400);
  const raw = data.replace(/^data:[^;]+;base64,/, "");
  if (!raw) throw new DeskError("No picture was selected.", 400);
  const bytes = bytesFromBase64(raw);
  if (!isImageBytes(bytes, kind)) throw new DeskError("That file is not a valid image.", 400);

  const path = `public/images/articles/${stem}.${extension}`;
  await putImage(path, bytes, `Add device picture ${path.split("/").pop()}`);
  return { name: path.split("/").pop() ?? "", preview: `data:${kind};base64,${raw}` };
}
