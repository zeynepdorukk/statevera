// The publication's only server. It exists for the things a browser is not
// allowed to do: read institutions that send no CORS headers, keep a count,
// hold a key on the writer's behalf, and tell readers about a new piece.
import { handleApi } from "../src/server/api";
import type { ApiEnv, WorkerContext } from "../src/server/env";
import { announceNewPieces } from "../src/server/mail";
import { allSubscribers } from "../src/server/subscribe";

export default {
  fetch: (request: Request, env: ApiEnv, ctx: WorkerContext): Promise<Response> => handleApi(request, env, ctx),

  // Every 30 minutes (wrangler.toml [triggers]): mail any Journal piece not announced yet.
  scheduled: (_event: unknown, env: ApiEnv, ctx: WorkerContext): void => {
    ctx.waitUntil(
      announceNewPieces(env, allSubscribers)
        .then((result) => console.log(JSON.stringify({ level: "info", event: "announce", ...result })))
        .catch((error) => console.log(JSON.stringify({ level: "error", event: "announce_failed", error: String(error?.message ?? error) })))
    );
  },
};
