// ============================================================
// Real-user performance: how fast the site is for its readers.
// ------------------------------------------------------------
// Pages send a sampled beacon with their Core Web Vitals when the reader
// leaves. Nothing is stored: each report becomes one structured log line
// (Workers Logs indexes the fields), so the dashboard can chart LCP, CLS and
// INP by page and device without a KV write per page view. No identifier,
// no address, no referrer: only the path, the numbers and a coarse device.
// ============================================================

import type { WorkerContext } from "./env";
import { HttpError, clientKey, isAllowedOrigin, readJson, type Exchange } from "./http";
import { enforce } from "./rate-limit";

/** Upper bounds that no honest browser reports; anything above is noise. */
const LIMITS = { lcp: 120_000, fcp: 120_000, ttfb: 60_000, inp: 60_000, cls: 50 } as const;
type Metric = keyof typeof LIMITS;

export interface VitalsReport {
  path: string;
  device: "mobile" | "desktop";
  metrics: Partial<Record<Metric, number>>;
}

/** The report, cleaned, or null when nothing in it is usable. */
export function parseVitals(body: Record<string, unknown>): VitalsReport | null {
  const rawPath = typeof body.path === "string" ? body.path : "";
  // Only the path of a page on this site: no query, no fragment, no host.
  const path = rawPath.split(/[?#]/)[0].slice(0, 160);
  if (!/^\/[\w\-./%]*$/.test(path)) return null;
  const device = body.device === "mobile" ? "mobile" : "desktop";
  const metrics: Partial<Record<Metric, number>> = {};
  const source = (body.metrics && typeof body.metrics === "object" ? body.metrics : {}) as Record<string, unknown>;
  for (const name of Object.keys(LIMITS) as Metric[]) {
    const value = Number(source[name]);
    if (!Number.isFinite(value) || value < 0 || value > LIMITS[name]) continue;
    metrics[name] = name === "cls" ? Math.round(value * 1000) / 1000 : Math.round(value);
  }
  return Object.keys(metrics).length ? { path, device, metrics } : null;
}

/** Google's thresholds: good / needs improvement / poor. */
export function rate(name: Metric, value: number): "good" | "ni" | "poor" {
  const [good, poor] = {
    lcp: [2500, 4000],
    fcp: [1800, 3000],
    ttfb: [800, 1800],
    inp: [200, 500],
    cls: [0.1, 0.25],
  }[name];
  return value <= good ? "good" : value <= poor ? "ni" : "poor";
}

export async function recordVitals(exchange: Exchange, _ctx?: WorkerContext): Promise<Response> {
  const { request, env } = exchange;
  // A beacon from anywhere else is not one of our readers.
  if (!isAllowedOrigin(request, env)) throw new HttpError(403, "origin_not_allowed", "Unknown origin.");
  await enforce(env, "views", clientKey(request));
  const report = parseVitals(await readJson(request, 2048));
  if (!report) throw new HttpError(400, "bad_report", "No usable measurements.");
  const country = (request as Request & { cf?: { country?: string } }).cf?.country;
  console.log(
    JSON.stringify({
      at: "vitals",
      path: report.path,
      device: report.device,
      country,
      ...report.metrics,
      ...Object.fromEntries(
        (Object.entries(report.metrics) as [Metric, number][]).map(([name, value]) => [`${name}Rating`, rate(name, value)])
      ),
    })
  );
  return new Response(null, { status: 204 });
}
