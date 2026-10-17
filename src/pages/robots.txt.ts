import type { APIRoute } from "astro";
import { site } from "../site";

// The desk is the only thing kept out of the index; the wire and live pages
// carry a noindex of their own because they are other newsrooms' headlines.
const body = [
  "User-agent: *",
  "Allow: /",
  "Disallow: /editor",
  "Disallow: /tr/editor",
  "",
  `Sitemap: ${site.siteUrl}/sitemap-index.xml`,
  `Sitemap: ${site.siteUrl}/news-sitemap.xml`,
  "",
].join("\n");

export const GET: APIRoute = () =>
  new Response(body, { headers: { "content-type": "text/plain; charset=utf-8" } });
