// The publication's only server. It exists for the two things a browser is not
// allowed to do: read institutions that send no CORS headers, and keep a count.
import { handleApi, type ApiEnv } from "../src/server/api";

export default {
  fetch: (request: Request, env: ApiEnv): Promise<Response> => handleApi(request, env),
};
