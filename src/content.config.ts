import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const articles = defineCollection({
  loader: glob({ pattern: "**/*.mdx", base: "./src/content/articles" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    updated: z.coerce.date().optional(),
    author: z.string().default("Daniel Marchetti"),
    category: z.enum([
      "World",
      "Geopolitics",
      "Security",
      "Diplomacy",
      "Economy",
      "Analysis",
      "Opinion",
    ]),
    region: z.enum([
      "Europe",
      "Middle East",
      "Americas",
      "Asia-Pacific",
      "Africa",
      "Eurasia",
      "Turkey",
      "Global",
    ]),
    country: z.array(z.string()).optional().default([]),
    tags: z.array(z.string()).optional().default([]),
    type: z
      .enum(["news", "analysis", "opinion", "explainer", "briefing"])
      .default("news"),
    featured: z.boolean().optional().default(false),
    breaking: z.boolean().optional().default(false),
    editorsPick: z.boolean().optional().default(false),
    sample: z.boolean().optional().default(false),
    heroImage: z.string(),
    heroImageAlt: z.string(),
    imageCredit: z.string().optional(),
    imageFocus: z.string().optional(),
    readingTime: z.number().optional(),
    sources: z
      .array(z.object({ name: z.string(), url: z.string() }))
      .optional()
      .default([]),
  }),
});

const briefings = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/briefings" }),
  schema: z.object({
    timestamp: z.coerce.date(),
    location: z.string(),
    category: z.enum([
      "World",
      "Geopolitics",
      "Security",
      "Diplomacy",
      "Economy",
      "Analysis",
      "Opinion",
    ]),
    region: z.enum([
      "Europe",
      "Middle East",
      "Americas",
      "Asia-Pacific",
      "Africa",
      "Eurasia",
      "Turkey",
      "Global",
    ]),
    importance: z.enum(["high", "medium", "low"]).default("medium"),
    headline: z.string().optional(),
  }),
});

const explainers = defineCollection({
  loader: glob({ pattern: "**/*.mdx", base: "./src/content/explainers" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    updated: z.coerce.date().optional(),
    tags: z.array(z.string()).optional().default([]),
    heroImage: z.string(),
    heroImageAlt: z.string(),
    imageCredit: z.string().optional(),
    imageFocus: z.string().optional(),
    readingTime: z.number().optional(),
    sources: z
      .array(z.object({ name: z.string(), url: z.string() }))
      .optional()
      .default([]),
  }),
});

export const collections = { articles, briefings, explainers };
