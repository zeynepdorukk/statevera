import rss from "@astrojs/rss";
import type { APIRoute } from "astro";
import { site } from "../site";
import { getAllArticles, absoluteUrl, heroImageOf, slugOf } from "../utils/collection";

/**
 * Every URL here is written out in full. `context.site` is the bare origin,
 * because the deployment lives under a base path, so anything relative would
 * syndicate readers to an address that does not exist.
 */
const absolute = (path: string) => `${site.siteUrl}${path}`;

/** The feed carries Statevera's own writing only — the wire belongs to its publishers. */
export const GET: APIRoute = async () => {
  const articles = await getAllArticles();

  const items = articles
    .map((a) => ({
      title: a.data.title,
      description: a.data.description,
      pubDate: a.data.date,
      ...(a.data.updated ? { updatedDate: a.data.updated } : {}),
      link: absolute(`/articles/${slugOf(a)}`),
      categories: [...a.data.tags, a.data.region, a.data.category],
      customData: [
        `<dc:creator><![CDATA[${a.data.author}]]></dc:creator>`,
        `<media:content url="${absoluteUrl(heroImageOf(a.data.heroImage))}" medium="image"/>`,
      ].join(""),
    }))
    .sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime());

  return rss({
    title: `${site.publicationName} — Journal`,
    description: "Signed analysis and essays from Statevera.",
    site: site.siteUrl,
    items,
    xmlns: {
      dc: "http://purl.org/dc/elements/1.1/",
      media: "http://search.yahoo.com/mrss/",
      atom: "http://www.w3.org/2005/Atom",
    },
    customData: [
      `<language>${site.locale}</language>`,
      `<copyright>© ${new Date().getFullYear()} ${site.publicationNameDisplay}</copyright>`,
      `<atom:link href="${absolute("/rss.xml")}" rel="self" type="application/rss+xml"/>`,
    ].join(""),
  });
};
