import rss from "@astrojs/rss";
import type { APIRoute } from "astro";
import { feedImageTag } from "../../utils/feed";
import { site } from "../../site";
import { getArticlesByLanguage, absoluteUrl, articleHref } from "../../utils/collection";
import { journalCategoryLabel, journalRegionLabel } from "../../journal-i18n";

export const GET: APIRoute = async () => {
  const articles = await getArticlesByLanguage("tr");
  const items = await Promise.all(articles.map(async (article) => ({
    title: article.data.title,
    description: article.data.description,
    pubDate: article.data.date,
    ...(article.data.updated ? { updatedDate: article.data.updated } : {}),
    link: absoluteUrl(articleHref(article)),
    categories: [
      ...article.data.tags,
      journalRegionLabel(article.data.region, "tr"),
      journalCategoryLabel(article.data.category, "tr"),
    ],
    customData: [
      `<dc:creator><![CDATA[${article.data.author}]]></dc:creator>`,
      await feedImageTag(article.data.heroImage, article.data.heroImageAlt),
    ].join(""),
  })));

  return rss({
    title: `${site.publicationName} — Türkçe Journal`,
    description: "Statevera'nın Türkçe analiz ve denemeleri.",
    site: `${site.siteUrl}/tr/`,
    items,
    xmlns: {
      dc: "http://purl.org/dc/elements/1.1/",
      media: "http://search.yahoo.com/mrss/",
      atom: "http://www.w3.org/2005/Atom",
    },
    customData: [
      "<language>tr-TR</language>",
      `<copyright>© ${new Date().getFullYear()} ${site.publicationNameDisplay}</copyright>`,
      `<atom:link href="${site.siteUrl}/tr/rss.xml" rel="self" type="application/rss+xml"/>`,
    ].join(""),
  });
};