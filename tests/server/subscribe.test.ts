import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleApi } from "../../src/server/api";
import { resetRateLimits } from "../../src/server/rate-limit";
import { forgetKnownTokens } from "../../src/server/auth";
import { normaliseEmail } from "../../src/server/subscribe";
import { env, memoryKv, post, request } from "./helpers";

const writer = { headers: { authorization: "Bearer gho_writer" } };

beforeEach(() => {
  resetRateLimits();
  forgetKnownTokens();
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("normaliseEmail", () => {
  it("lowercases and trims plausible addresses", () => {
    expect(normaliseEmail("  Reader@Example.COM ")).toBe("reader@example.com");
    expect(normaliseEmail("a.b+news@mail.example.org")).toBe("a.b+news@mail.example.org");
  });
  it("refuses what is not an address", () => {
    for (const bad of ["", "nope", "a@b", "a@@b.com", "<x>@y.com", "a@.example.com", "a@exa..mple.com", 42, null]) {
      expect(normaliseEmail(bad)).toBeNull();
    }
  });
});

describe("POST /api/subscribe", () => {
  it("stores an address once, keyed by hash, and answers the same every time", async () => {
    const store = memoryKv();
    const body = { email: "Reader@Example.com", language: "tr", consent: true, page: "/tr/articles/x/?utm_source=x" };
    const first = await handleApi(post("/api/subscribe", body), env({ VIEWS: store }));
    const again = await handleApi(post("/api/subscribe", body), env({ VIEWS: store }));
    expect(first.status).toBe(202);
    expect(await again.json()).toEqual(await first.clone().json().catch(() => ({ ok: true })));
    expect(store.ops.put).toBe(1);
    const [[key, entry]] = [...store.entries];
    expect(key).toMatch(/^s\/[0-9a-f]{64}$/);
    expect(JSON.parse(entry.value)).toMatchObject({ email: "reader@example.com", language: "tr", page: "/tr/articles/x/" });
  });

  it("needs consent and a real address", async () => {
    expect((await handleApi(post("/api/subscribe", { email: "a@example.com" }), env())).status).toBe(400);
    expect((await handleApi(post("/api/subscribe", { email: "nope", consent: true }), env())).status).toBe(400);
  });

  it("quietly drops bots that fill the hidden field", async () => {
    const store = memoryKv();
    const res = await handleApi(post("/api/subscribe", { email: "bot@example.com", consent: true, website: "http://spam" }), env({ VIEWS: store }));
    expect(res.status).toBe(202);
    expect(store.ops.put).toBe(0);
  });

  it("refuses other origins and a missing store", async () => {
    expect((await handleApi(post("/api/subscribe", { email: "a@example.com", consent: true }, { origin: "https://evil.example" }), env())).status).toBe(403);
    expect((await handleApi(post("/api/subscribe", { email: "a@example.com", consent: true }), { })).status).toBe(503);
  });

  it("limits sign-ups per address", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) {
      statuses.push((await handleApi(post("/api/subscribe", { email: `r${i}@example.com`, consent: true }), env())).status);
    }
    expect(statuses.filter((s) => s === 429).length).toBeGreaterThan(0);
  });
});

describe("the writer's list", () => {
  it("is closed to everyone else", async () => {
    expect((await handleApi(request("/api/subscribers"), env())).status).toBe(401);
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ login: "someone-else" })));
    expect((await handleApi(request("/api/subscribers", writer), env())).status).toBe(403);
  });

  it("exports newest first and removes on request", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ login: "zeynepdorukk" })));
    const store = memoryKv();
    for (const [email, language] of [["one@example.com", "en"], ["iki@example.com", "tr"], ["three@example.com", "en"]]) {
      await handleApi(post("/api/subscribe", { email, language, consent: true }, { ip: email }), env({ VIEWS: store }));
      await new Promise((r) => setTimeout(r, 2));
    }
    const list = await (await handleApi(request("/api/subscribers", writer), env({ VIEWS: store }))).json();
    expect(list.count).toBe(3);
    expect(list.byLanguage).toEqual({ en: 2, tr: 1 });
    expect(list.subscribers[0].email).toBe("three@example.com");

    const removed = await (await handleApi(post("/api/subscribers/remove", { email: "IKI@example.com" }, writer), env({ VIEWS: store }))).json();
    expect(removed).toEqual({ ok: true, removed: true });
    expect((await (await handleApi(request("/api/subscribers", writer), env({ VIEWS: store }))).json()).count).toBe(2);
  });
});
