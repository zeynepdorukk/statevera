import type { APIRoute } from "astro";
import { site } from "../site";

// One deployment now serves both the publication and the desk, so the desk is
// the only thing kept out of the index.
const body = `User-agent: *\nAllow: /\nDisallow: /editor\n\nSitemap: ${site.siteUrl}/sitemap-index.xml\n`;

export const GET: APIRoute = () =>
  new Response(body, { headers: { "content-type": "text/plain; charset=utf-8" } });
