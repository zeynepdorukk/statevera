import type { APIRoute } from "astro";
import { site } from "../site";

// The desk ships with the publication now, so there is one deployment and the
// only thing to keep out of the index is the desk itself.
const body = `User-agent: *\nAllow: /\nDisallow: /editor\n\nSitemap: ${site.siteUrl}/sitemap-index.xml\n`;

export const GET: APIRoute = () =>
  new Response(body, { headers: { "content-type": "text/plain; charset=utf-8" } });
