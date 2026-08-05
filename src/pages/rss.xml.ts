import rss from "@astrojs/rss";
import type { APIRoute } from "astro";
import { site } from "../site";
import { getAllArticles, getAllExplainers, heroImageOf, slugOf } from "../utils/collection";

/** The feed carries Statevera's own writing only — the wire belongs to its publishers. */
export const GET: APIRoute = async (context) => {
  const [articles, explainers] = await Promise.all([getAllArticles(), getAllExplainers()]);

  const items = [
    ...articles.map((a) => ({
      title: a.data.title,
      description: a.data.description,
      pubDate: a.data.date,
      ...(a.data.updated ? { updatedDate: a.data.updated } : {}),
      link: `/articles/${slugOf(a)}`,
      categories: [...a.data.tags, a.data.region, a.data.category],
      customData: [
        `<dc:creator><![CDATA[${a.data.author}]]></dc:creator>`,
        `<media:content url="${new URL(heroImageOf(a.data.heroImage), site.siteUrl)}" medium="image"/>`,
      ].join(""),
    })),
    ...explainers.map((e) => ({
      title: e.data.title,
      description: e.data.description,
      pubDate: e.data.date,
      ...(e.data.updated ? { updatedDate: e.data.updated } : {}),
      link: `/explainers/${slugOf(e)}`,
      categories: [...e.data.tags, "Explainers"],
      customData: [
        `<dc:creator><![CDATA[${site.authorName}]]></dc:creator>`,
        `<media:content url="${new URL(heroImageOf(e.data.heroImage), site.siteUrl)}" medium="image"/>`,
      ].join(""),
    })),
  ].sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime());

  return rss({
    title: `${site.publicationName} — The Journal`,
    description: "Signed analysis, essays and explainers from Statevera.",
    site: context.site ?? site.siteUrl,
    items,
    xmlns: {
      dc: "http://purl.org/dc/elements/1.1/",
      media: "http://search.yahoo.com/mrss/",
      atom: "http://www.w3.org/2005/Atom",
    },
    customData: [
      `<language>${site.locale}</language>`,
      `<copyright>© ${new Date().getFullYear()} ${site.publicationNameDisplay}</copyright>`,
      `<atom:link href="${new URL("/rss.xml", site.siteUrl)}" rel="self" type="application/rss+xml"/>`,
    ].join(""),
  });
};
