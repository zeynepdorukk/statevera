import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleApi } from "../../src/server/api";
import { resetRateLimits } from "../../src/server/rate-limit";
import { parseVitals, rate } from "../../src/server/vitals";
import { env, post } from "./helpers";

let logs: string[] = [];

beforeEach(() => {
  resetRateLimits();
  logs = [];
  vi.spyOn(console, "log").mockImplementation((line: string) => void logs.push(line));
});

afterEach(() => vi.restoreAllMocks());

describe("parseVitals", () => {
  it("keeps the path, a coarse device and sane numbers only", () => {
    expect(
      parseVitals({ path: "/articles/x/?utm_source=whatsapp#top", device: "mobile", metrics: { lcp: 2140.6, cls: 0.04321, inp: -5, ttfb: "abc", fcp: 1e9 } })
    ).toEqual({ path: "/articles/x/", device: "mobile", metrics: { lcp: 2141, cls: 0.043 } });
  });

  it("refuses foreign or empty reports", () => {
    expect(parseVitals({ path: "https://evil.example/", metrics: { lcp: 1 } })).toBeNull();
    expect(parseVitals({ path: "/<script>", metrics: { lcp: 1 } })).toBeNull();
    expect(parseVitals({ path: "/", metrics: {} })).toBeNull();
  });

  it("rates with Google's thresholds", () => {
    expect(rate("lcp", 2500)).toBe("good");
    expect(rate("lcp", 3000)).toBe("ni");
    expect(rate("cls", 0.3)).toBe("poor");
  });
});

describe("POST /api/vitals", () => {
  it("logs one line and stores nothing", async () => {
    const store = env();
    const response = await handleApi(post("/api/vitals", { path: "/", device: "desktop", metrics: { lcp: 1800, cls: 0.02 } }), store);
    expect(response.status).toBe(204);
    const line = logs.map((l) => JSON.parse(l)).find((l) => l.at === "vitals");
    expect(line).toMatchObject({ path: "/", device: "desktop", lcp: 1800, lcpRating: "good", cls: 0.02 });
    expect((store.VIEWS as unknown as { ops: Record<string, number> }).ops.put).toBe(0);
  });

  it("accepts a text/plain beacon body", async () => {
    const response = await handleApi(
      post("/api/vitals", { path: "/wire/", metrics: { inp: 120 } }, { headers: { "content-type": "text/plain" } }),
      env()
    );
    expect(response.status).toBe(204);
  });

  it("rejects other origins and junk", async () => {
    expect((await handleApi(post("/api/vitals", { path: "/", metrics: { lcp: 1 } }, { origin: "https://evil.example" }), env())).status).toBe(403);
    expect((await handleApi(post("/api/vitals", { path: "/", metrics: {} }), env())).status).toBe(400);
  });
});
