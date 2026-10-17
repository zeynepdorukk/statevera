// ============================================================
// HEALTH
// ------------------------------------------------------------
// What this Worker has been given and what it is running, without
// revealing a single secret: every key is reported as present or
// absent, never as a value. `?deep=1` also asks each institution
// adapter for a trivial query, which is what an uptime monitor or
// the desk's settings panel wants to know.
// ============================================================

import { SOURCE_ADAPTERS } from "../primary-sources/adapters";
import { clientKey, json, type Exchange } from "./http";
import { enforce } from "./rate-limit";

export async function health(exchange: Exchange): Promise<Response> {
  const { env, url } = exchange;
  const body: Record<string, unknown> = {
    ok: true,
    service: "statevera-desk",
    release: env.RELEASE || "dev",
    time: new Date().toISOString(),
    features: {
      views: Boolean(env.VIEWS),
      subscriptions: Boolean(env.VIEWS),
      mail: Boolean(env.RESEND_API_KEY),
      signIn: Boolean(env.GITHUB_CLIENT_ID),
      assistant: Boolean(env.OPENAI_KEY),
      rateLimits: {
        search: Boolean(env.LIMIT_SEARCH),
        views: Boolean(env.LIMIT_VIEWS),
        auth: Boolean(env.LIMIT_AUTH),
        assistant: Boolean(env.LIMIT_ASSISTANT),
        subscribe: Boolean(env.LIMIT_SUBSCRIBE),
      },
      sourceKeys: {
        govinfo: Boolean(env.GOVINFO_API_KEY),
        congress: Boolean(env.CONGRESS_API_KEY),
        osce: Boolean(env.OSCE_SEARCH_API_KEY),
      },
    },
    adapters: SOURCE_ADAPTERS.map((adapter) => adapter.id),
  };

  if (url.searchParams.get("deep") === "1") {
    // A deep probe fans out to every institution, so it spends a search.
    await enforce(env, "search", clientKey(exchange.request));
    const probes = await Promise.all(
      SOURCE_ADAPTERS.map(async (adapter) => {
        const started = Date.now();
        try {
          const results = await adapter.search({ query: "security", env, signal: AbortSignal.timeout(7_000) });
          return { id: adapter.id, ok: true, count: results.length, ms: Date.now() - started };
        } catch (error) {
          return { id: adapter.id, ok: false, error: (error as Error).message.slice(0, 160), ms: Date.now() - started };
        }
      })
    );
    body.probes = probes;
    body.ok = probes.filter((probe) => probe.ok).length * 2 >= probes.length;
  }

  return json(body, { status: body.ok ? 200 : 503, cache: "no-store" });
}
