// The desk on Netlify. Cloudflare's pages.dev is blocked by some Turkish ISPs,
// so this is the entry point that Zeynep can actually reach.
import { handleDesk, type DeskEnv } from "../../src/server/desk";

export default (request: Request): Promise<Response> =>
  handleDesk(request, process.env as unknown as DeskEnv);

export const config = { path: "/api/*" };
