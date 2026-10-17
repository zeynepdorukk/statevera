// ============================================================
// THE PUBLIC API
// ------------------------------------------------------------
// Almost nothing needs a server: the desk holds its own keys and
// talks to GitHub from the browser. What is left lives here, as a
// small router over a handful of modules:
//
//   GET  /api/health            what is bound and what is running
//   GET  /api/primary-sources   official documents, many institutions
//   POST /api/views             count one reader, once
//   GET  /api/views             one article's breakdown, or many counts
//   GET  /api/views/popular     the most-read of a given set
//   POST /api/sign-in           start GitHub's device flow
//   POST /api/sign-in/finish    finish it, for the writer only
//   GET  /api/assistant         is the desk's key usable, and which model
//   POST /api/assistant         the writing assistant, for the writer only
//   POST /api/subscribe         a reader joins the mailing list
//   GET  /api/subscribers       the list, for the writer only
//   POST /api/subscribers/remove  take one address off, for the writer only
//   POST /api/vitals            one reader's Core Web Vitals, logged not stored
//
// The same handler runs as a Cloudflare Worker in production and
// behind the Astro dev server locally. Every answer goes through
// one envelope: CORS, hardening headers, a request id, timing, and
// one structured log line.
// ============================================================

import type { ApiEnv, WorkerContext } from "./env";
import { HttpError, corsHeaders, failure, finalize, json, logLine, newRequestId, type Exchange } from "./http";
import { popularViews, readViews, recordView } from "./views";
import { finishDeviceLogin, startDeviceLogin } from "./auth";
import { assistantStatus, handleAssistant } from "./assistant";
import { primarySources } from "./primary-sources";
import { health } from "./health";
import { recordVitals } from "./vitals";
import { listSubscribers, removeSubscriber, subscribe } from "./subscribe";

export type { ApiEnv, ViewMark, ViewStore, KvStore } from "./env";

type Handler = (exchange: Exchange, ctx?: WorkerContext) => Promise<Response>;

/** method + route → handler. Routes are matched exactly; there are no parameters. */
const ROUTES: Record<string, Partial<Record<string, Handler>>> = {
  health: { GET: health },
  "primary-sources": { GET: primarySources },
  views: { GET: readViews, POST: recordView },
  "views/popular": { GET: popularViews },
  "sign-in": { POST: startDeviceLogin },
  "sign-in/finish": { POST: finishDeviceLogin },
  assistant: { GET: assistantStatus, POST: handleAssistant },
  vitals: { POST: recordVitals },
  subscribe: { POST: subscribe },
  subscribers: { GET: listSubscribers },
  "subscribers/remove": { POST: removeSubscriber },
};

/** "/api/views/" and "/statevera/api/views" both mean "views". */
export const routeOf = (pathname: string): string =>
  pathname.replace(/^.*?\/api\//, "").replace(/\/+$/, "");

export async function handleApi(request: Request, env: ApiEnv, ctx?: WorkerContext): Promise<Response> {
  const url = new URL(request.url);
  const exchange: Exchange = {
    request,
    env,
    url,
    route: url.pathname.includes("/api/") ? routeOf(url.pathname) : "",
    id: request.headers.get("cf-ray")?.split("-")[0] || newRequestId(),
    startedAt: Date.now(),
  };

  if (request.method === "OPTIONS") {
    return finalize(exchange, new Response(null, { status: 204, headers: corsHeaders(exchange) }));
  }

  let response: Response;
  const methods = ROUTES[exchange.route];
  try {
    if (!methods) {
      response = failure(404, "not_found", "No such endpoint.");
    } else {
      const handler = methods[request.method] ?? (request.method === "HEAD" ? methods.GET : undefined);
      if (!handler) {
        response = failure(405, "method_not_allowed", `Use ${Object.keys(methods).join(" or ")}.`, {}, { allow: [...Object.keys(methods), "OPTIONS"].join(", ") });
      } else {
        response = await handler(exchange, ctx);
        if (request.method === "HEAD") response = new Response(null, response);
      }
    }
  } catch (error) {
    if (error instanceof HttpError) {
      response = failure(error.status, error.code, error.message, {}, error.headers);
    } else {
      // An upstream that threw (DNS, TLS, a timeout) is a bad gateway; a bug is ours.
      const message = (error as Error)?.message ?? String(error);
      const upstream = /fetch|network|timeout|abort/i.test(message);
      response = failure(upstream ? 502 : 500, upstream ? "upstream_error" : "internal", upstream ? message : "Something went wrong on our side.", { requestId: exchange.id });
      logLine(exchange, response.status, { error: message, stack: (error as Error)?.stack?.split("\n").slice(0, 4).join(" | ") });
      return finalize(exchange, response);
    }
  }

  logLine(exchange, response.status, response.headers.get("x-cache") ? { cache: response.headers.get("x-cache") } : {});
  return finalize(exchange, response);
}

export { json };
