import { handleDesk, type DeskEnv } from "../../src/server/desk";

interface Context {
  request: Request;
  env: DeskEnv;
}

export const onRequest = (context: Context): Promise<Response> =>
  handleDesk(context.request, context.env);
