import type { APIRoute } from "astro";
import { getAllArticles, absoluteUrl, articleHref } from "../utils/collection";
import { site } from "../site";

// Google News reads only the last two days of a news sitemap, and wants the
// publication's name and language on every entry. Older pieces live in the
// ordinary sitemap; this one exists so a new analysis is found within minutes.
const WINDOW_MS = 2 * 24 * 60 * 60 * 1000;

const escape = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

export const GET: APIRoute = async () => {
  const now = Date.now();
  const recent = (await getAllArticles()).filter((article) => {
    const stamp = (article.data.updated ?? article.data.date).getTime();
    return !article.data.draft && now - stamp <= WINDOW_MS;
  });

  const entries = recent
    .map((article) => {
      const url = absoluteUrl(articleHref(article).replace(/\/?$/, "/"));
      return `  <url>
    <loc>${escape(url)}</loc>
    <news:news>
      <news:publication>
        <news:name>${escape(site.publicationName)}</news:name>
        <news:language>${article.data.language}</news:language>
      </news:publication>
      <news:publication_date>${article.data.date.toISOString()}</news:publication_date>
      <news:title>${escape(article.data.title)}</news:title>
    </news:news>
  </url>`;
    })
    .join("\n");

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${entries}
</urlset>
`;
  return new Response(body, { headers: { "content-type": "application/xml; charset=utf-8" } });
};
