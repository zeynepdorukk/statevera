// ============================================================
// SIGNING IN WITHOUT A TOKEN TO COPY
// ------------------------------------------------------------
// GitHub's device flow, proxied. The browser cannot call it
// directly — those endpoints send no CORS headers — and this is
// the only reason the desk touches a server to sign in.
//
// The gate is here rather than in the browser: the token is handed
// back only when it belongs to an account this publication is
// written by. Anyone else can complete the approval on GitHub and
// still get nothing.
// ============================================================

import type { ApiEnv } from "./env";
import { HttpError, clientKey, json, readJson, sha256, type Exchange } from "./http";
import { enforce } from "./rate-limit";

const DEVICE_CODE = "https://github.com/login/device/code";
const DEVICE_TOKEN = "https://github.com/login/oauth/access_token";
const GITHUB_USER = "https://api.github.com/user";
const UPSTREAM_TIMEOUT_MS = 10_000;

/**
 * The GitHub accounts this desk will hand a token to. The repository belongs to
 * the writer, not to whoever keeps the worker running, so this is a setting and
 * not a name in the source.
 */
export const deskLogins = (env: ApiEnv): Set<string> =>
  new Set(
    (env.DESK_LOGINS ?? "zeynepdorukk")
      .split(",")
      .map((login) => login.trim().toLowerCase())
      .filter(Boolean)
  );

const timeout = (): AbortSignal => AbortSignal.timeout(UPSTREAM_TIMEOUT_MS);

const github = (env: ApiEnv, url: string, body: Record<string, string>) =>
  fetch(url, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json", "user-agent": "statevera-desk" },
    body: JSON.stringify({ client_id: env.GITHUB_CLIENT_ID, ...body }),
    signal: timeout(),
  });

function requireApp(env: ApiEnv): void {
  if (!env.GITHUB_CLIENT_ID) throw new HttpError(501, "not_configured", "No GitHub app is configured on this desk.");
}

/** Who a GitHub token belongs to, remembered briefly so every keystroke is not a round trip. */
const knownTokens = new Map<string, { login: string; at: number }>();
const TOKEN_MEMORY_MS = 10 * 60_000;
/** A refusal is remembered for less time, so a fixed token starts working quickly. */
const REFUSAL_MEMORY_MS = 30_000;

export async function loginFor(token: string): Promise<string> {
  if (!token) return "";
  const key = await sha256(token);
  const remembered = knownTokens.get(key);
  if (remembered) {
    const ttl = remembered.login ? TOKEN_MEMORY_MS : REFUSAL_MEMORY_MS;
    if (Date.now() - remembered.at < ttl) return remembered.login;
  }

  let login = "";
  try {
    const who = await fetch(GITHUB_USER, {
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${token}`,
        "user-agent": "statevera-desk",
      },
      signal: timeout(),
    });
    if (who.ok) login = String(((await who.json().catch(() => ({}))) as { login?: string }).login ?? "");
  } catch {
    // GitHub unreachable: do not remember a refusal that GitHub never gave.
    return "";
  }
  if (knownTokens.size > 200) knownTokens.clear();
  knownTokens.set(key, { login, at: Date.now() });
  return login;
}

/** Throws unless the bearer token belongs to one of the desk's writers. Returns the login. */
export async function requireWriter(request: Request, env: ApiEnv, message = "This desk belongs to someone else."): Promise<string> {
  const bearer = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!bearer) throw new HttpError(401, "unauthenticated", "Sign in first.");
  const login = await loginFor(bearer);
  if (!login || !deskLogins(env).has(login.toLowerCase())) throw new HttpError(403, "forbidden", message);
  return login;
}

/** Starts the flow: GitHub returns the code the writer types into github.com. */
export async function startDeviceLogin(exchange: Exchange): Promise<Response> {
  const { env, request } = exchange;
  requireApp(env);
  await enforce(env, "auth", clientKey(request));
  const response = await github(env, DEVICE_CODE, {
    // A GitHub App carries its own permissions; only an OAuth App wants a scope.
    ...(env.GITHUB_OAUTH_SCOPE ? { scope: env.GITHUB_OAUTH_SCOPE } : {}),
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok || !data.device_code) {
    throw new HttpError(502, "upstream_refused", String(data.error_description ?? "GitHub refused to start the sign-in."));
  }
  return json({
    deviceCode: data.device_code,
    userCode: data.user_code,
    verificationUri: data.verification_uri,
    interval: Number(data.interval ?? 5),
    expiresIn: Number(data.expires_in ?? 900),
  });
}

/** Finishes it, once the writer has approved — and only for the writer. */
export async function finishDeviceLogin(exchange: Exchange): Promise<Response> {
  const { env, request } = exchange;
  requireApp(env);
  // Polling is expected (every ~5 s) so this bucket is generous, but not endless.
  await enforce(env, "auth", `${clientKey(request)}:poll`);
  const body = await readJson<{ deviceCode: string }>(request, 4 * 1024);
  const deviceCode = typeof body.deviceCode === "string" ? body.deviceCode : "";
  if (!/^[\w-]{10,120}$/.test(deviceCode)) throw new HttpError(400, "missing_device_code", "No device code.");

  const response = await github(env, DEVICE_TOKEN, {
    device_code: deviceCode,
    grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    ...(env.GITHUB_CLIENT_SECRET ? { client_secret: env.GITHUB_CLIENT_SECRET } : {}),
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;

  // Still waiting, or being told to slow down: not an error, just not yet.
  if (typeof data.error === "string") {
    const pending = data.error === "authorization_pending" || data.error === "slow_down";
    return json(
      {
        pending,
        error: String(data.error_description ?? data.error),
        code: data.error,
        ...(data.error === "slow_down" && typeof data.interval === "number" ? { interval: data.interval } : {}),
      },
      { status: pending ? 200 : 400 }
    );
  }

  const accessToken = typeof data.access_token === "string" ? data.access_token : "";
  if (!accessToken) throw new HttpError(502, "upstream_empty", "GitHub returned no token.");

  const login = await loginFor(accessToken);
  if (!deskLogins(env).has(login.toLowerCase())) {
    throw new HttpError(403, "forbidden", "This desk belongs to someone else.");
  }
  return json({ token: accessToken, login });
}

/** Tests only. */
export const forgetKnownTokens = (): void => knownTokens.clear();
