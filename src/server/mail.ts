// ============================================================
// MAIL — confirmation, unsubscribe, new-piece announcements
// ------------------------------------------------------------
// Everything is switched on by one secret, RESEND_API_KEY. Without
// it the list works exactly as before: addresses are kept and the
// writer exports them; nothing is ever sent.
//
// With it:
//   1. A new address is kept as *pending* for 7 days and sent one
//      confirmation email (double opt-in). Only confirmed addresses
//      ever receive anything else, so nobody can sign up a stranger.
//   2. Every email carries a signed unsubscribe link and the
//      RFC 8058 one-click headers Gmail and Outlook ask for.
//   3. A cron trigger reads the site's own search index every 30
//      minutes. A Journal piece it has not announced yet goes to the
//      confirmed readers of that language, once.
//
// Links are signed with HMAC-SHA256 (MAIL_SECRET, or the Resend key
// when that is not set), so a link only works for the address it
// was sent to, and the list never needs to store a token.
// ============================================================

import type { ApiEnv, KvStore } from "./env";
import { HttpError, hex, type Exchange } from "./http";

export const SITE = "https://statevera.org";
const DEFAULT_API = "https://statevera-desk.onatozmen44.workers.dev";
const DEFAULT_FROM = "Statevera <journal@statevera.org>";
/** Where the cron remembers what it has already announced. */
export const ANNOUNCED_KEY = "mail/announced";
/** A piece older than this is never announced, even if the marker is lost. */
const FRESH_FOR_MS = 3 * 24 * 60 * 60 * 1000;
/** Pending sign-ups that are never confirmed simply expire. */
export const PENDING_TTL_SECONDS = 7 * 24 * 60 * 60;

export type Language = "en" | "tr";

export interface OutgoingMail {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
}

export const mailOn = (env: ApiEnv): boolean => Boolean(env.RESEND_API_KEY?.trim());

const apiBase = (env: ApiEnv) => (env.PUBLIC_API_URL || DEFAULT_API).replace(/\/$/, "");

// ---------- signing ----------

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export const encodeEmail = (email: string) => b64url(new TextEncoder().encode(email));

export function decodeEmail(value: string): string | null {
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
    return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
  } catch {
    return null;
  }
}

async function hmac(env: ApiEnv, message: string): Promise<string> {
  const secret = env.MAIL_SECRET?.trim() || env.RESEND_API_KEY?.trim();
  if (!secret) throw new HttpError(503, "mail_off", "Email is not switched on.");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message))).slice(0, 32);
}

export const tokenFor = (env: ApiEnv, purpose: "confirm" | "unsubscribe", email: string) => hmac(env, `${purpose}:${email}`);

/** Constant-time comparison of two short hex strings. */
function sameToken(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function linkFor(env: ApiEnv, purpose: "confirm" | "unsubscribe", email: string): Promise<string> {
  const route = purpose === "confirm" ? "subscribe/confirm" : "unsubscribe";
  return `${apiBase(env)}/api/${route}?e=${encodeEmail(email)}&t=${await tokenFor(env, purpose, email)}`;
}

/** The address a signed link names, or an error page's worth of HttpError. */
async function verifiedEmail(env: ApiEnv, url: URL, purpose: "confirm" | "unsubscribe"): Promise<string> {
  const email = decodeEmail(url.searchParams.get("e") ?? "");
  const token = url.searchParams.get("t") ?? "";
  if (!email || !token || !sameToken(token, await tokenFor(env, purpose, email))) {
    throw new HttpError(400, "bad_link", "This link is not valid.");
  }
  return email;
}

// ---------- sending ----------

/** Sends up to 100 messages per call through Resend's batch endpoint. */
export async function sendMail(env: ApiEnv, messages: OutgoingMail[]): Promise<number> {
  if (!mailOn(env) || messages.length === 0) return 0;
  let sent = 0;
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100).map((m) => ({ from: env.MAIL_FROM || DEFAULT_FROM, ...m }));
    const response = await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: { authorization: `Bearer ${env.RESEND_API_KEY!.trim()}`, "content-type": "application/json" },
      body: JSON.stringify(chunk),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Resend refused the batch (${response.status}): ${detail.slice(0, 200)}`);
    }
    sent += chunk.length;
  }
  return sent;
}

const esc = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** One plain, readable email layout: no images, no tracking pixels. */
function layout(language: Language, body: string, unsubscribe?: string): string {
  const foot = unsubscribe
    ? language === "tr"
      ? `Bu e-postayı statevera.org'da abone olduğunuz için aldınız. <a href="${esc(unsubscribe)}" style="color:#6b6b6b">Abonelikten çıkın</a>.`
      : `You are receiving this because you subscribed at statevera.org. <a href="${esc(unsubscribe)}" style="color:#6b6b6b">Unsubscribe</a>.`
    : language === "tr"
      ? "Bu isteği siz yapmadıysanız bu e-postayı yok sayın; adresiniz 7 gün içinde silinir."
      : "If you did not ask for this, ignore this email; the address is deleted within 7 days.";
  return `<!doctype html><html lang="${language}"><body style="margin:0;background:#f6f4ef;font-family:Georgia,'Times New Roman',serif;color:#1a1a1a">
<div style="max-width:560px;margin:0 auto;padding:32px 24px">
<p style="font:600 13px/1 Arial,sans-serif;letter-spacing:.18em;margin:0 0 28px">STATEVERA</p>
${body}
<p style="font:12px/1.6 Arial,sans-serif;color:#6b6b6b;margin:40px 0 0;border-top:1px solid #ddd8cc;padding-top:16px">${foot}</p>
</div></body></html>`;
}

const button = (href: string, label: string) =>
  `<p style="margin:28px 0"><a href="${esc(href)}" style="background:#1a1a1a;color:#fff;text-decoration:none;font:600 15px/1 Arial,sans-serif;padding:14px 22px;display:inline-block">${esc(label)}</a></p>`;

const oneClick = (unsubscribe: string) => ({
  "List-Unsubscribe": `<${unsubscribe}>`,
  "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
});

export async function confirmationMail(env: ApiEnv, email: string, language: Language): Promise<OutgoingMail> {
  const link = await linkFor(env, "confirm", email);
  const tr = language === "tr";
  const subject = tr ? "Statevera aboneliğinizi onaylayın" : "Confirm your Statevera subscription";
  const lead = tr
    ? "Zeynep Doruk yeni bir yazı yayımladığında e-posta almak için adresinizi onaylayın."
    : "Confirm your address to get an email when Zeynep Doruk publishes a new piece.";
  return {
    to: email,
    subject,
    html: layout(language, `<h1 style="font-size:26px;line-height:1.25;margin:0 0 16px">${esc(subject)}</h1><p style="font-size:17px;line-height:1.6;margin:0">${esc(lead)}</p>${button(link, tr ? "Aboneliği onayla" : "Confirm subscription")}`),
    text: `${subject}\n\n${lead}\n\n${link}\n`,
  };
}

export interface Piece {
  title: string;
  url: string;
  description: string;
  date: string;
  language: Language;
}

export async function announcementMail(env: ApiEnv, email: string, piece: Piece): Promise<OutgoingMail> {
  const unsubscribe = await linkFor(env, "unsubscribe", email);
  const href = `${SITE}${piece.url}?utm_source=newsletter&utm_medium=email&utm_campaign=new-piece`;
  const tr = piece.language === "tr";
  const kicker = tr ? "Yeni yazı" : "New in the Journal";
  return {
    to: email,
    subject: piece.title,
    html: layout(
      piece.language,
      `<p style="font:600 12px/1 Arial,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#9a7b2f;margin:0 0 12px">${kicker}</p><h1 style="font-size:28px;line-height:1.2;margin:0 0 16px"><a href="${esc(href)}" style="color:#1a1a1a;text-decoration:none">${esc(piece.title)}</a></h1><p style="font-size:17px;line-height:1.6;margin:0">${esc(piece.description)}</p>${button(href, tr ? "Yazıyı okuyun" : "Read the piece")}<p style="font-size:15px;color:#4a4a4a;margin:0">Zeynep Doruk</p>`,
      unsubscribe
    ),
    text: `${kicker}\n\n${piece.title}\n\n${piece.description}\n\n${href}\n\n— Zeynep Doruk\n\n${tr ? "Abonelikten çıkın" : "Unsubscribe"}: ${unsubscribe}\n`,
    headers: oneClick(unsubscribe),
  };
}

// ---------- reader-facing pages ----------

function page(status: number, language: Language, title: string, body: string): Response {
  const html = `<!doctype html><html lang="${language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)} — Statevera</title></head>
<body style="margin:0;background:#f6f4ef;font-family:Georgia,'Times New Roman',serif;color:#1a1a1a"><main style="max-width:520px;margin:12vh auto;padding:0 24px">
<p style="font:600 13px/1 Arial,sans-serif;letter-spacing:.18em">STATEVERA</p><h1 style="font-size:30px;line-height:1.2">${esc(title)}</h1>${body}
<p style="margin-top:32px"><a href="${SITE}${language === "tr" ? "/tr/" : "/"}" style="color:#1a1a1a">statevera.org</a></p></main></body></html>`;
  return new Response(html, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'",
    },
  });
}

const languageOf = (url: URL, record?: { language?: string } | null): Language =>
  record?.language === "tr" || url.searchParams.get("l") === "tr" ? "tr" : "en";

function linkError(error: unknown, url: URL): Response {
  if (error instanceof HttpError && error.code === "bad_link") {
    const tr = url.searchParams.get("l") === "tr";
    return page(400, tr ? "tr" : "en", tr ? "Bu bağlantı geçersiz" : "This link is not valid", `<p style="font-size:17px;line-height:1.6">${tr ? "Bağlantı eksik kopyalanmış olabilir." : "It may have been copied incompletely."}</p>`);
  }
  throw error;
}

/** GET /api/subscribe/confirm?e=&t= — a pending address becomes a reader. */
export async function confirmSubscription(exchange: Exchange, store: KvStore, keyFor: (email: string) => Promise<string>): Promise<Response> {
  const { env, url } = exchange;
  let email: string;
  try {
    email = await verifiedEmail(env, url, "confirm");
  } catch (error) {
    return linkError(error, url);
  }
  const key = await keyFor(email);
  const record = (await store.get(key, "json")) as ({ language?: string; confirmed?: boolean } & Record<string, unknown>) | null;
  const language = languageOf(url, record);
  if (!record) {
    return page(410, language, language === "tr" ? "Bu bağlantının süresi doldu" : "This link has expired",
      `<p style="font-size:17px;line-height:1.6">${language === "tr" ? "Lütfen sitedeki formdan yeniden abone olun." : "Please sign up again with the form on the site."}</p>`);
  }
  if (record.confirmed === false) {
    await store.put(key, JSON.stringify({ ...record, confirmed: true, confirmedAt: new Date().toISOString() }));
  }
  return page(200, language, language === "tr" ? "Aboneliğiniz onaylandı" : "You are subscribed",
    `<p style="font-size:17px;line-height:1.6">${language === "tr" ? "Bir sonraki yazı yayımlandığında e-postanızda olacak." : "The next piece will arrive in your inbox when it is published."}</p>`);
}

/**
 * GET  /api/unsubscribe?e=&t= — a page with one button (link scanners
 *      follow GETs, so a GET alone never removes anyone).
 * POST /api/unsubscribe?e=&t= — removes the address. Also what mail
 *      clients send for RFC 8058 one-click unsubscribe.
 */
export async function unsubscribe(exchange: Exchange, store: KvStore, keyFor: (email: string) => Promise<string>): Promise<Response> {
  const { env, url, request } = exchange;
  let email: string;
  try {
    email = await verifiedEmail(env, url, "unsubscribe");
  } catch (error) {
    return linkError(error, url);
  }
  const key = await keyFor(email);
  const record = (await store.get(key, "json")) as { language?: string } | null;
  const language = languageOf(url, record);
  const tr = language === "tr";

  if (request.method === "POST") {
    if (record) await store.delete?.(key);
    return page(200, language, tr ? "Abonelikten çıktınız" : "You are unsubscribed",
      `<p style="font-size:17px;line-height:1.6">${tr ? "Adresiniz listeden silindi. Başka e-posta almayacaksınız." : "Your address has been deleted from the list. You will get no more emails."}</p>`);
  }
  if (!record) {
    return page(200, language, tr ? "Listede değilsiniz" : "You are not on the list",
      `<p style="font-size:17px;line-height:1.6">${tr ? "Bu adres zaten listede değil." : "This address is not on the list."}</p>`);
  }
  return page(200, language, tr ? "Abonelikten çıkılsın mı?" : "Unsubscribe?",
    `<p style="font-size:17px;line-height:1.6">${esc(email)}</p><form method="post" action="${esc(url.pathname + url.search)}"><button style="background:#1a1a1a;color:#fff;border:0;font:600 15px/1 Arial,sans-serif;padding:14px 22px;cursor:pointer">${tr ? "Abonelikten çık" : "Unsubscribe"}</button></form>`);
}

// ---------- the cron: announce new pieces ----------

interface IndexItem {
  title?: string;
  url?: string;
  description?: string;
  date?: string;
  language?: string;
  pillar?: string;
}

/** The Journal pieces in the site's search index. */
export async function journalPieces(): Promise<Piece[]> {
  const response = await fetch(`${SITE}/search-index.json?cron=${Date.now()}`, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`search-index.json answered ${response.status}`);
  const items = (await response.json()) as IndexItem[];
  return items
    .filter((item) => item.pillar === "journal" && typeof item.url === "string" && item.url.startsWith("/") && item.title)
    .map((item) => ({
      title: item.title!,
      url: item.url!,
      description: item.description ?? "",
      date: item.date ?? "",
      language: item.language === "tr" ? "tr" : "en",
    }));
}

export interface AnnounceResult {
  seeded?: number;
  announced: { url: string; recipients: number }[];
}

/**
 * Sends each Journal piece not announced before to the confirmed readers
 * of its language. The first run only remembers what already exists, so
 * switching mail on never mails the archive.
 */
export async function announceNewPieces(
  env: ApiEnv,
  readers: (store: KvStore) => Promise<{ email: string; language: Language; confirmed?: boolean }[]>,
  now = Date.now()
): Promise<AnnounceResult> {
  const store = env.VIEWS;
  if (!store || !mailOn(env)) return { announced: [] };
  const pieces = await journalPieces();
  const known = (await store.get(ANNOUNCED_KEY, "json")) as string[] | null;
  if (!known) {
    await store.put(ANNOUNCED_KEY, JSON.stringify(pieces.map((p) => p.url)));
    return { seeded: pieces.length, announced: [] };
  }
  const fresh = pieces.filter((p) => !known.includes(p.url) && now - Date.parse(p.date) < FRESH_FOR_MS);
  if (fresh.length === 0) return { announced: [] };

  // Remember first: a crash halfway must never mean the same piece twice.
  await store.put(ANNOUNCED_KEY, JSON.stringify([...fresh.map((p) => p.url), ...known].slice(0, 500)));
  const everyone = (await readers(store)).filter((r) => r.confirmed !== false);
  const announced: AnnounceResult["announced"] = [];
  for (const piece of fresh) {
    const audience = everyone.filter((r) => r.language === piece.language);
    const mails = await Promise.all(audience.map((r) => announcementMail(env, r.email, piece)));
    announced.push({ url: piece.url, recipients: await sendMail(env, mails) });
  }
  return { announced };
}
