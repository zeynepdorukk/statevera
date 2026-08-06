import { wireItems } from "../data/wire";
import { getAllArticles, articleHref } from "../utils/collection";

interface SearchItem {
  title: string;
  url: string;
  kind: string;
  pillar: "wire" | "journal";
  category: string;
  region: string;
  description: string;
  source: string;
  date: string;
  external: boolean;
}

export async function GET() {
  const articles = await getAllArticles();

  const index: SearchItem[] = [
    ...articles.map((a) => ({
      title: a.data.title,
      url: articleHref(a),
      kind: a.data.type === "opinion" ? "Opinion" : "Analysis",
      pillar: "journal" as const,
      category: a.data.category,
      region: a.data.region,
      description: a.data.description,
      source: "Statevera",
      date: a.data.date.toISOString(),
      external: false,
    })),
    ...wireItems.map((w) => ({
      title: w.title,
      url: w.url,
      kind: "News",
      pillar: "wire" as const,
      category: w.category,
      region: w.region,
      description: w.summary,
      source: w.publisher,
      date: w.publishedAt,
      external: true,
    })),
  ];

  return new Response(JSON.stringify(index), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=1800",
    },
  });
}
