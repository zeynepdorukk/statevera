// The publication's only server. It exists for the things a browser is not
// allowed to do: read institutions that send no CORS headers, keep a count,
// and hold a key on the writer's behalf.
import { handleApi } from "../src/server/api";
import type { ApiEnv, WorkerContext } from "../src/server/env";

export default {
  fetch: (request: Request, env: ApiEnv, ctx: WorkerContext): Promise<Response> => handleApi(request, env, ctx),
};
