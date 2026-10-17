import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleApi, routeOf } from "../../src/server/api";
import { resetRateLimits } from "../../src/server/rate-limit";
import { forgetKnownTokens } from "../../src/server/auth";
import { pickModel, resetAssistant } from "../../src/server/assistant";
import { aggregate, referringHost, series } from "../../src/server/views";
import { context, device, env, memoryKv, post, request } from "./helpers";

const SLUG = "the-illusion-of-growth";

beforeEach(() => {
  resetRateLimits();
  forgetKnownTokens();
  resetAssistant();
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("routing and envelope", () => {
  it("normalises routes", () => {
    expect(routeOf("/api/views")).toBe("views");
    expect(routeOf("/api/views/")).toBe("views");
    expect(routeOf("/statevera/api/sign-in/finish")).toBe("sign-in/finish");
  });

  it("answers preflight with CORS for the publication only", async () => {
    const ok = await handleApi(request("/api/views", { method: "OPTIONS" }), env());
    expect(ok.status).toBe(204);
    expect(ok.headers.get("access-control-allow-origin")).toBe("https://statevera.org");
    expect(ok.headers.get("access-control-allow-headers")).toContain("authorization");

    const evil = await handleApi(request("/api/views", { method: "OPTIONS", origin: "https://evil.example" }), env());
    expect(evil.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("accepts extra origins from the environment", async () => {
    const res = await handleApi(
      request("/api/health", { origin: "https://preview.statevera.org" }),
      env({ EXTRA_ORIGINS: "https://preview.statevera.org, not-a-url" })
    );
    expect(res.headers.get("access-control-allow-origin")).toBe("https://preview.statevera.org");
  });

  it("returns a 404 envelope with hardening headers and a request id", async () => {
    const res = await handleApi(request("/api/nope"), env());
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: "No such endpoint.", code: "not_found" });
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-request-id")).toMatch(/^[a-z0-9]{8,}$/);
    expect(res.headers.get("server-timing")).toMatch(/^app;dur=\d+/);
  });

  it("returns 405 with an Allow header for a wrong method", async () => {
    const res = await handleApi(request("/api/health", { method: "DELETE" }), env());
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toContain("GET");
  });

  it("answers HEAD like GET without a body", async () => {
    const res = await handleApi(request("/api/health", { method: "HEAD" }), env());
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("");
  });

  it("turns an unexpected throw into a 500 with the request id, not a stack", async () => {
    const broken = memoryKv();
    broken.list = async () => {
      throw new TypeError("boom");
    };
    const res = await handleApi(request(`/api/views?slug=${SLUG}`), env({ VIEWS: broken }));
    expect(res.status).toBe(500);
    const body = (await res.json()) as Record<string, string>;
    expect(body.code).toBe("internal");
    expect(body.error).not.toContain("boom");
    expect(body.requestId).toBe(res.headers.get("x-request-id"));
  });
});

describe("health", () => {
  it("reports features without revealing secrets", async () => {
    const res = await handleApi(request("/api/health"), env({ OPENAI_KEY: "sk-secret-value", RELEASE: "abc123" }));
    const body = (await res.json()) as any;
    expect(body.ok).toBe(true);
    expect(body.release).toBe("abc123");
    expect(body.features.assistant).toBe(true);
    expect(body.features.signIn).toBe(false);
    expect(JSON.stringify(body)).not.toContain("sk-secret-value");
    expect(body.adapters.length).toBeGreaterThan(5);
  });
});

describe("views", () => {
  it("records a reader once and keeps the first visit", async () => {
    const e = env();
    const kv = e.VIEWS as ReturnType<typeof memoryKv>;
    const first = await handleApi(post("/api/views", { slug: SLUG, deviceId: device(1), referrer: "https://news.ycombinator.com/item?id=1" }, { headers: { "cf-ipcountry": "tr" } }), e);
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ ok: true, counted: true });

    const again = await handleApi(post("/api/views", { slug: SLUG, deviceId: device(1) }), e);
    expect(await again.json()).toMatchObject({ ok: true, counted: false });
    expect(kv.ops.put).toBe(1);

    const [entry] = [...kv.entries.values()];
    expect(entry.metadata).toMatchObject({ c: "TR", r: "news.ycombinator.com" });
    // The device id is hashed, never stored.
    expect([...kv.entries.keys()][0]).not.toContain(device(1));
  });

  it("refuses scripts without the publication's origin", async () => {
    const res = await handleApi(post("/api/views", { slug: SLUG, deviceId: device(1) }, { origin: null }), env());
    expect(res.status).toBe(403);
  });

  it("does not count crawlers", async () => {
    const e = env();
    const res = await handleApi(
      post("/api/views", { slug: SLUG, deviceId: device(2) }, { headers: { "user-agent": "Mozilla/5.0 (compatible; Googlebot/2.1)" } }),
      e
    );
    expect(await res.json()).toMatchObject({ counted: false });
    expect((e.VIEWS as ReturnType<typeof memoryKv>).ops.put).toBe(0);
  });

  it("validates slugs and device ids", async () => {
    const bad = await handleApi(post("/api/views", { slug: "../etc", deviceId: device(1) }), env());
    expect(bad.status).toBe(400);
    const short = await handleApi(post("/api/views", { slug: SLUG, deviceId: "x" }), env());
    expect(short.status).toBe(400);
  });

  it("rejects an oversized body", async () => {
    const res = await handleApi(post("/api/views", { slug: SLUG, deviceId: device(1), referrer: "x".repeat(10_000) }), env());
    expect(res.status).toBe(413);
  });

  it("says when no counter is bound", async () => {
    const res = await handleApi(request(`/api/views?slug=${SLUG}`), env({ VIEWS: undefined }));
    expect(res.status).toBe(501);
  });

  it("reads a breakdown and serves repeat reads from the aggregate", async () => {
    const e = env();
    const kv = e.VIEWS as ReturnType<typeof memoryKv>;
    for (let n = 1; n <= 5; n += 1) {
      await handleApi(post("/api/views", { slug: SLUG, deviceId: device(n) }, { ip: `198.51.100.${n}`, headers: { "cf-ipcountry": n < 4 ? "TR" : "DE" } }), e);
    }
    const ctx = context();
    const res = await handleApi(request(`/api/views?slug=${SLUG}`), e, ctx);
    await ctx.settle();
    const body = (await res.json()) as any;
    expect(body).toMatchObject({ slug: SLUG, total: 5, recent: 5 });
    expect(body.countries[0]).toEqual({ name: "TR", count: 3 });
    expect(body.days).toHaveLength(30);
    expect(body.days.at(-1).count).toBe(5);

    const listsAfterFirst = kv.ops.list;
    await handleApi(request(`/api/views?slug=${SLUG}`), e);
    expect(kv.ops.list).toBe(listsAfterFirst);
  });

  it("returns counts and recent counts for many slugs", async () => {
    const e = env();
    await handleApi(post("/api/views", { slug: "a-story", deviceId: device(1) }), e);
    await handleApi(post("/api/views", { slug: "a-story", deviceId: device(2) }), e);
    await handleApi(post("/api/views", { slug: "b-story", deviceId: device(3) }), e);
    const res = await handleApi(request("/api/views?slugs=a-story,b-story,c-story,BAD!"), e);
    expect(await res.json()).toEqual({
      counts: { "a-story": 2, "b-story": 1, "c-story": 0 },
      recent: { "a-story": 2, "b-story": 1, "c-story": 0 },
    });
  });

  it("ranks the most read", async () => {
    const e = env();
    for (const [slug, n] of [["one", 1], ["two", 3], ["three", 2]] as const) {
      for (let i = 0; i < n; i += 1) await handleApi(post("/api/views", { slug, deviceId: device(i + n * 10) }), e);
    }
    const res = await handleApi(request("/api/views/popular?slugs=one,two,three,four&limit=2"), e);
    const body = (await res.json()) as any;
    expect(body.window).toBe("week");
    expect(body.items.map((item: { slug: string }) => item.slug)).toEqual(["two", "three"]);
  });

  it("rate limits a single client", async () => {
    const e = env();
    let last: Response | undefined;
    for (let i = 0; i < 125; i += 1) last = await handleApi(request(`/api/views?slugs=a-story`), e);
    expect(last!.status).toBe(429);
    expect(last!.headers.get("retry-after")).toBe("60");
  });

  it("prefers the Cloudflare limiter binding when bound", async () => {
    const limit = vi.fn(async () => ({ success: false }));
    const res = await handleApi(request("/api/views?slugs=a-story"), env({ LIMIT_VIEWS: { limit } }));
    expect(res.status).toBe(429);
    expect(limit).toHaveBeenCalledWith({ key: "views:203.0.113.7" });
  });

  it("helpers: referrer host, series and aggregate", () => {
    expect(referringHost("https://www.google.com/search?q=x")).toBe("google.com");
    expect(referringHost("https://statevera.org/journal/")).toBe("");
    expect(referringHost("not a url")).toBe("");
    const now = new Date("2026-10-17T12:00:00Z");
    const marks = [{ d: "2026-10-17" }, { d: "2026-10-01" }, { d: "2026-09-01" }];
    const days = series(marks, 30, now);
    expect(days[0].date).toBe("2026-09-18");
    expect(days.at(-1)).toEqual({ date: "2026-10-17", count: 1 });
    expect(aggregate("x", marks, now)).toMatchObject({ total: 3, recent: 1 });
  });
});

describe("sign-in", () => {
  it("is off without a GitHub app", async () => {
    const res = await handleApi(post("/api/sign-in", {}), env());
    expect(res.status).toBe(501);
  });

  it("starts the device flow", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ device_code: "dc_1234567890", user_code: "ABCD-EFGH", verification_uri: "https://github.com/login/device", interval: 5, expires_in: 900 })));
    const res = await handleApi(post("/api/sign-in", {}), env({ GITHUB_CLIENT_ID: "Iv1" }));
    expect(await res.json()).toMatchObject({ deviceCode: "dc_1234567890", userCode: "ABCD-EFGH", interval: 5 });
  });

  it("reports pending politely", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "authorization_pending", error_description: "waiting" })));
    const res = await handleApi(post("/api/sign-in/finish", { deviceCode: "dc_1234567890" }), env({ GITHUB_CLIENT_ID: "Iv1" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ pending: true });
  });

  it("hands the token only to the writer", async () => {
    const fetcher = vi.fn(async (url: string | URL | Request) => {
      const href = String(url instanceof Request ? url.url : url);
      if (href.includes("access_token")) return Response.json({ access_token: "gho_token" });
      return Response.json({ login: "someone-else" });
    });
    vi.stubGlobal("fetch", fetcher);
    const refused = await handleApi(post("/api/sign-in/finish", { deviceCode: "dc_1234567890" }), env({ GITHUB_CLIENT_ID: "Iv1" }));
    expect(refused.status).toBe(403);
    expect(JSON.stringify(await refused.json())).not.toContain("gho_token");

    forgetKnownTokens();
    fetcher.mockImplementation(async (url) => {
      const href = String(url instanceof Request ? url.url : url);
      if (href.includes("access_token")) return Response.json({ access_token: "gho_token" });
      return Response.json({ login: "ZeynepDorukk" });
    });
    const ok = await handleApi(post("/api/sign-in/finish", { deviceCode: "dc_1234567890" }), env({ GITHUB_CLIENT_ID: "Iv1" }));
    expect(await ok.json()).toEqual({ token: "gho_token", login: "ZeynepDorukk" });
  });
});

describe("assistant", () => {
  it("reports unavailable without a key", async () => {
    const res = await handleApi(request("/api/assistant"), env());
    expect(await res.json()).toEqual({ available: false });
  });

  it("requires the writer's sign-in", async () => {
    const res = await handleApi(post("/api/assistant", { messages: [{ role: "user", content: "hi" }] }), env({ OPENAI_KEY: "sk-x" }));
    expect(res.status).toBe(401);
  });

  it("forwards only chat fields, with the server's model", async () => {
    const seen: Record<string, unknown>[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        const href = String(url instanceof Request ? url.url : url);
        if (href.includes("api.github.com/user")) return Response.json({ login: "zeynepdorukk" });
        if (href.endsWith("/v1/models")) return Response.json({ data: [{ id: "gpt-4o" }, { id: "gpt-5.6-luna" }] });
        seen.push(JSON.parse(String(init?.body)));
        return Response.json({ choices: [{ message: { content: "ok" } }] });
      })
    );
    const res = await handleApi(
      post(
        "/api/assistant",
        { model: "gpt-cheap", messages: [{ role: "user", content: "hi" }], n: 50, temperature: 0.2, evil: true },
        { headers: { authorization: "Bearer gho_writer" } }
      ),
      env({ OPENAI_KEY: "sk-x" })
    );
    expect(res.status).toBe(200);
    expect(seen[0]).toEqual({ model: "gpt-5.6-luna", messages: [{ role: "user", content: "hi" }], temperature: 0.2 });
  });

  it("refuses an empty conversation", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ login: "zeynepdorukk" })));
    const res = await handleApi(post("/api/assistant", {}, { headers: { authorization: "Bearer gho_writer" } }), env({ OPENAI_KEY: "sk-x", OPENAI_MODEL: "gpt-5.6-luna" }));
    expect(res.status).toBe(400);
  });

  it("picks a sensible model", () => {
    expect(pickModel(["gpt-4o", "gpt-5.6-luna", "gpt-5.6-realtime"])).toBe("gpt-5.6-luna");
    expect(pickModel(["gpt-5-mini", "gpt-5"])).toBe("gpt-5");
    expect(pickModel(["whisper-1", "gpt-4o-audio-preview"])).toBe("");
  });
});

describe("primary sources route", () => {
  it("validates the query before touching any institution", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const res = await handleApi(request("/api/primary-sources?q=a"), env());
    expect(res.status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("returns a ranked, deduplicated answer even when every institution fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 503 })));
    const res = await handleApi(request("/api/primary-sources?q=sanctions%20russia&type=Nonsense"), env());
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.query).toBe("sanctions russia");
    expect(body.results).toEqual([]);
    expect(body.sources.every((source: { ok: boolean }) => source.ok === false)).toBe(true);
    expect(body.sources[0]).toHaveProperty("ms");
  });
});
