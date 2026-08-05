import rss from "@astrojs/rss";
import type { APIRoute } from "astro";
import { site } from "../site";
import { getAllArticles, getAllExplainers, heroImageOf } from "../utils/collection";

export const GET: APIRoute = async (context) => {
  const [articles, explainers] = await Promise.all([
    getAllArticles(),
    getAllExplainers(),
  ]);

  const items = [
    ...articles.map((a) => ({
      title: a.data.title,
      description: a.data.description,
      pubDate: a.data.date,
      ...(a.data.updated ? { updatedDate: a.data.updated } : {}),
      link: `/articles/${a.id.replace(/\.mdx?$/, "")}`,
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
      link: `/explainers/${e.id.replace(/\.mdx?$/, "")}`,
      categories: [...e.data.tags, "Explainers"],
      customData: `<media:content url="${new URL(heroImageOf(e.data.heroImage), site.siteUrl)}" medium="image"/>`,
    })),
  ].sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime());

  return rss({
    title: `${site.publicationName} — RSS`,
    description: site.publicationTagline,
    site: context.site ?? site.siteUrl,
    items,
    xmlns: {
      dc: "http://purl.org/dc/elements/1.1/",
      media: "http://search.yahoo.com/mrss/",
      atom: "http://www.w3.org/2005/Atom",
    },
    customData: [
      `<language>${site.locale}</language>`,
      `<atom:link href="${new URL("/rss.xml", site.siteUrl)}" rel="self" type="application/rss+xml"/>`,
    ].join(""),
  });
};
