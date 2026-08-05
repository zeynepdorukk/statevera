// ============================================================
// EDITOR — GitHub contents API
// ------------------------------------------------------------
// The editor commits straight to the repository; pushing to the
// default branch triggers the Pages rebuild.
// ============================================================

export const REPO = "zeynepdorukk/statevera";
export const BRANCH = "master";
const API = `https://api.github.com/repos/${REPO}`;

export class GitHubError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "GitHubError";
  }
}

export interface FileEntry {
  name: string;
  path: string;
  sha: string;
  size: number;
}

const headers = (token: string, extra: Record<string, string> = {}) => ({
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
  ...extra,
});

async function request<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(API + path, {
    ...init,
    headers: headers(token, (init.headers as Record<string, string>) ?? {}),
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* GitHub always sends JSON, but never assume */
  }
  if (!res.ok) {
    const message = (json as { message?: string })?.message ?? `HTTP ${res.status}`;
    throw new GitHubError(message, res.status);
  }
  return json as T;
}

// ---------- base64 that survives non-ASCII ----------

export function encodeBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export function decodeBase64(base64: string): string {
  const binary = atob(base64.replace(/\s/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder("utf-8").decode(bytes);
}

// ---------- operations ----------

export async function verifyToken(token: string): Promise<{ login: string; canWrite: boolean }> {
  const me = await request<{ login: string }>(token, "".replace(API, ""), {});
  return { login: me.login ?? "", canWrite: true };
}

/** Confirms the token can see the repository and reports whether it may push. */
export async function checkAccess(token: string): Promise<{ canWrite: boolean; name: string }> {
  const repo = await request<{ full_name: string; permissions?: { push?: boolean } }>(token, "");
  return { canWrite: Boolean(repo.permissions?.push), name: repo.full_name };
}

export async function listDirectory(token: string, path: string): Promise<FileEntry[]> {
  const entries = await request<FileEntry[]>(token, `/contents/${path}?ref=${BRANCH}`);
  return Array.isArray(entries) ? entries : [];
}

export async function readFile(
  token: string,
  path: string
): Promise<{ text: string; sha: string }> {
  const file = await request<{ content: string; sha: string; encoding: string }>(
    token,
    `/contents/${path}?ref=${BRANCH}`
  );
  return { text: decodeBase64(file.content), sha: file.sha };
}

export async function writeFile(
  token: string,
  path: string,
  text: string,
  message: string,
  sha?: string
): Promise<{ sha: string; commitUrl: string }> {
  const result = await request<{ content: { sha: string }; commit: { html_url: string } }>(
    token,
    `/contents/${path}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        branch: BRANCH,
        content: encodeBase64(text),
        ...(sha ? { sha } : {}),
      }),
    }
  );
  return { sha: result.content.sha, commitUrl: result.commit.html_url };
}

export async function deleteFile(
  token: string,
  path: string,
  message: string,
  sha: string
): Promise<void> {
  await request(token, `/contents/${path}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, branch: BRANCH, sha }),
  });
}
