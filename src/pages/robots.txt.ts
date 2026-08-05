import type { APIRoute } from "astro";
import { site } from "../site";

// The desk deployment is a working copy of the publication with a login on it.
// Only the real site should ever be crawled.
const isDesk = Boolean(process.env.NETLIFY);

const body = isDesk
  ? "User-agent: *\nDisallow: /\n"
  : `User-agent: *\nAllow: /\nDisallow: /editor\n\nSitemap: ${site.siteUrl}/sitemap-index.xml\n`;

export const GET: APIRoute = () =>
  new Response(body, { headers: { "content-type": "text/plain; charset=utf-8" } });
