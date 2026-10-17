import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleApi } from "../../src/server/api";
import { resetRateLimits } from "../../src/server/rate-limit";
import { ANNOUNCED_KEY, announceNewPieces, decodeEmail, encodeEmail, linkFor } from "../../src/server/mail";
import { allSubscribers, keyFor } from "../../src/server/subscribe";
import { context, env, memoryKv, post, request } from "./helpers";

const MAIL = { RESEND_API_KEY: "re_test_key", PUBLIC_API_URL: "https://statevera-desk.example.workers.dev" };

/** Captures every Resend batch; answers the site's search index with `pieces`. */
function stubNetwork(pieces: unknown[] = []) {
  const batches: any[][] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("https://api.resend.com/emails/batch")) {
        batches.push(JSON.parse(String(init?.body)));
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }
      if (url.startsWith("https://statevera.org/search-index.json")) return new Response(JSON.stringify(pieces));
      return new Response("not stubbed", { status: 599 });
    })
  );
  return batches;
}

const pathOf = (link: string) => link.replace("https://statevera-desk.example.workers.dev", "");

beforeEach(() => {
  resetRateLimits();
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("email encoding", () => {
  it("round-trips addresses, including non-ASCII", () => {
    for (const email of ["reader@example.com", "a.b+news@mail.example.org", "zeynep@örnek.com.tr"]) {
      expect(decodeEmail(encodeEmail(email))).toBe(email);
    }
  });
});

describe("double opt-in", () => {
  it("keeps a new address pending, mails a confirmation, and confirms on the signed link", async () => {
    const batches = stubNetwork();
    const store = memoryKv();
    const ctx = context();
    const res = await handleApi(post("/api/subscribe", { email: "reader@example.com", language: "tr", consent: true }), env({ VIEWS: store, ...MAIL }), ctx);
    await ctx.settle();
    expect(res.status).toBe(202);
    expect(await res.json()).toMatchObject({ ok: true, confirm: true });

    const key = await keyFor("reader@example.com");
    expect(JSON.parse(store.entries.get(key)!.value)).toMatchObject({ confirmed: false, language: "tr" });
    expect(store.entries.get(key)!.expires).toBeGreaterThan(Date.now());

    expect(batches).toHaveLength(1);
    expect(batches[0][0]).toMatchObject({ to: "reader@example.com", subject: "Statevera aboneliğinizi onaylayın" });
    const link = batches[0][0].text.match(/https:\S+subscribe\/confirm\S+/)[0];

    const page = await handleApi(request(pathOf(link), { origin: null }), env({ VIEWS: store, ...MAIL }));
    expect(page.status).toBe(200);
    expect(page.headers.get("content-type")).toContain("text/html");
    expect(await page.text()).toContain("Aboneliğiniz onaylandı");
    expect(JSON.parse(store.entries.get(key)!.value)).toMatchObject({ confirmed: true });
    expect(store.entries.get(key)!.expires).toBe(0);
  });

  it("does not mail a confirmed reader again, and answers exactly the same", async () => {
    const batches = stubNetwork();
    const store = memoryKv();
    await store.put(await keyFor("old@example.com"), JSON.stringify({ email: "old@example.com", language: "en", at: "2026-10-01T00:00:00Z" }));
    const res = await handleApi(post("/api/subscribe", { email: "old@example.com", consent: true }), env({ VIEWS: store, ...MAIL }));
    expect(await res.json()).toEqual({ ok: true, confirm: true });
    expect(batches).toHaveLength(0);
  });

  it("refuses a tampered link", async () => {
    stubNetwork();
    const link = await linkFor(env(MAIL), "confirm", "reader@example.com");
    const forged = link.replace(encodeEmail("reader@example.com"), encodeEmail("victim@example.com"));
    expect((await handleApi(request(pathOf(forged), { origin: null }), env(MAIL))).status).toBe(400);
  });

  it("sends nothing and keeps addresses confirmed when mail is off", async () => {
    const batches = stubNetwork();
    const store = memoryKv();
    const res = await handleApi(post("/api/subscribe", { email: "reader@example.com", consent: true }), env({ VIEWS: store }));
    expect(await res.json()).toEqual({ ok: true, confirm: false });
    expect(JSON.parse([...store.entries.values()][0].value).confirmed).toBeUndefined();
    expect(batches).toHaveLength(0);
  });
});

describe("unsubscribe", () => {
  it("asks on GET and removes only on POST", async () => {
    stubNetwork();
    const store = memoryKv();
    const key = await keyFor("reader@example.com");
    await store.put(key, JSON.stringify({ email: "reader@example.com", language: "en", at: "2026-10-01T00:00:00Z" }));
    const link = pathOf(await linkFor(env(MAIL), "unsubscribe", "reader@example.com"));

    const ask = await handleApi(request(link, { origin: null }), env({ VIEWS: store, ...MAIL }));
    expect(await ask.text()).toContain("<form method=\"post\"");
    expect(store.entries.has(key)).toBe(true);

    const done = await handleApi(request(link, { method: "POST", origin: null, body: "List-Unsubscribe=One-Click", headers: { "content-type": "application/x-www-form-urlencoded" } }), env({ VIEWS: store, ...MAIL }));
    expect(done.status).toBe(200);
    expect(store.entries.has(key)).toBe(false);
  });
});

describe("announcing new pieces", () => {
  const now = Date.parse("2026-10-20T12:00:00Z");
  const piece = (url: string, language: "en" | "tr", date = "2026-10-20T09:00:00Z") => ({
    title: `Title ${url}`, url, description: "Dek", date, language, pillar: "journal",
  });

  it("seeds on the first run without mailing the archive", async () => {
    const batches = stubNetwork([piece("/articles/old/", "en")]);
    const store = memoryKv();
    const result = await announceNewPieces(env({ VIEWS: store, ...MAIL }), allSubscribers, now);
    expect(result.seeded).toBe(1);
    expect(batches).toHaveLength(0);
    expect(JSON.parse(store.entries.get(ANNOUNCED_KEY)!.value)).toEqual(["/articles/old/"]);
  });

  it("mails a new piece once, to confirmed readers of its language only", async () => {
    const batches = stubNetwork([
      piece("/articles/old/", "en"),
      piece("/tr/articles/yeni/", "tr"),
      piece("/articles/stale/", "en", "2026-09-01T00:00:00Z"),
      { title: "Wire", url: "https://bbc.co.uk/x", pillar: "wire" },
    ]);
    const store = memoryKv();
    await store.put(ANNOUNCED_KEY, JSON.stringify(["/articles/old/"]));
    const add = async (email: string, language: string, confirmed?: boolean) =>
      store.put(await keyFor(email), JSON.stringify({ email, language, at: "2026-10-01T00:00:00Z", ...(confirmed === undefined ? {} : { confirmed }) }));
    await add("tr@example.com", "tr", true);
    await add("legacy-tr@example.com", "tr");
    await add("pending-tr@example.com", "tr", false);
    await add("en@example.com", "en", true);

    const result = await announceNewPieces(env({ VIEWS: store, ...MAIL }), allSubscribers, now);
    expect(result.announced).toEqual([{ url: "/tr/articles/yeni/", recipients: 2 }]);
    expect(batches).toHaveLength(1);
    expect(batches[0].map((m: any) => m.to).sort()).toEqual(["legacy-tr@example.com", "tr@example.com"]);
    expect(batches[0][0].headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(batches[0][0].html).toContain("utm_source=newsletter");

    const again = await announceNewPieces(env({ VIEWS: store, ...MAIL }), allSubscribers, now);
    expect(again.announced).toEqual([]);
    expect(batches).toHaveLength(1);
  });

  it("does nothing without the key", async () => {
    const batches = stubNetwork([piece("/articles/new/", "en")]);
    expect(await announceNewPieces(env(), allSubscribers, now)).toEqual({ announced: [] });
    expect(batches).toHaveLength(0);
  });
});
