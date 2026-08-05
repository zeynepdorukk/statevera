import { getAllArticles, getAllBriefings, getAllExplainers } from "../utils/collection";

export async function GET() {
  const [articles, briefings, explainers] = await Promise.all([
    getAllArticles(),
    getAllBriefings(),
    getAllExplainers(),
  ]);

  const index = [
    ...articles.map((a) => ({
      title: a.data.title,
      url: `/articles/${a.id.replace(/\.mdx?$/, "")}`,
      category: a.data.category,
      region: a.data.region,
      country: a.data.country,
      tags: a.data.tags,
      description: a.data.description,
      date: a.data.date.toISOString(),
      kind: a.data.type,
    })),
    ...explainers.map((e) => ({
      title: e.data.title,
      url: `/explainers/${e.id.replace(/\.mdx?$/, "")}`,
      category: "Explainers",
      region: "Global",
      country: [] as string[],
      tags: e.data.tags,
      description: e.data.description,
      date: e.data.date.toISOString(),
      kind: "explainer",
    })),
    ...briefings.map((b) => ({
      title: b.body.trim().slice(0, 80),
      url: "/briefings",
      category: b.data.category,
      region: b.data.region,
      country: [] as string[],
      tags: [],
      description: b.body.trim(),
      date: b.data.timestamp.toISOString(),
      kind: "briefing",
    })),
  ];

  return new Response(JSON.stringify(index), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
