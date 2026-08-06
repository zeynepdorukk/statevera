// ============================================================
// EDITOR — the desk's own API
// ------------------------------------------------------------
// The browser never holds a GitHub token. It asks the desk's
// server, which checks the session cookie and then talks to
// GitHub with a token only it can see. Pushing to the default
// branch triggers the Pages rebuild.
// ============================================================

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
}

export interface Session {
  configured: boolean;
  signedIn: boolean;
  user: string;
  assistant: boolean;
  canPublish: boolean;
  model: string;
}

export interface Library {
  articles: FileEntry[];
  explainers: FileEntry[];
  images: string[];
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api/${path}`, {
    ...init,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new DeskError(data.error ?? `Request failed (${res.status}).`, res.status);
  return data;
}

export const readSession = (): Promise<Session> =>
  call<Session>("session").catch(() => ({
    configured: false,
    signedIn: false,
    user: "",
    assistant: false,
    canPublish: false,
    model: "",
  }));

export const signIn = (user: string, password: string): Promise<Session> =>
  call<Session>("login", { method: "POST", body: JSON.stringify({ user, password }) });

export const signOutRequest = (): Promise<unknown> => call("logout", { method: "POST" });

export const readLibrary = (): Promise<Library> => call<Library>("library");

export const readFile = (path: string): Promise<{ content: string; sha: string }> =>
  call(`file?path=${encodeURIComponent(path)}`);

export const writeFile = (
  path: string,
  content: string,
  message: string,
  sha?: string
): Promise<{ sha: string }> =>
  call("file", { method: "PUT", body: JSON.stringify({ path, content, message, sha }) });

export const deleteFile = (path: string, message: string, sha: string): Promise<{ deleted: boolean }> =>
  call("file", { method: "DELETE", body: JSON.stringify({ path, message, sha }) });

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

export const searchPhotos = (query: string): Promise<{ photos: Photo[] }> =>
  call(`photos?q=${encodeURIComponent(query)}`);

/** Copies a Commons picture into the repository and returns its filename. */
export const importPhoto = (file: string, name: string): Promise<{ name: string; preview: string }> =>
  call("photos", { method: "POST", body: JSON.stringify({ file, name }) });
