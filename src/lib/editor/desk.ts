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
