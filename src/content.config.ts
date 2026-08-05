import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const CATEGORIES = [
  "Politics",
  "Geopolitics",
  "Economy",
  "Culture",
  "Security",
  "Diplomacy",
  "Theory",
  "Opinion",
] as const;

const REGIONS = [
  "Europe",
  "Middle East",
  "Americas",
  "Asia-Pacific",
  "Africa",
  "Eurasia",
  "Turkey",
  "Global",
] as const;

const media = {
  heroImage: z.string(),
  heroImageAlt: z.string(),
  imageCredit: z.string().optional(),
  imageFocus: z.string().optional(),
};

const sources = z
  .array(z.object({ name: z.string(), url: z.string() }))
  .optional()
  .default([]);

/** Signed analysis and essays written for Statevera. */
const articles = defineCollection({
  loader: glob({ pattern: "**/*.mdx", base: "./src/content/articles" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    updated: z.coerce.date().optional(),
    author: z.string().default("Zeynep Doruk"),
    category: z.enum(CATEGORIES),
    region: z.enum(REGIONS),
    country: z.array(z.string()).optional().default([]),
    tags: z.array(z.string()).optional().default([]),
    type: z.enum(["news", "analysis", "opinion", "explainer"]).default("analysis"),
    featured: z.boolean().optional().default(false),
    editorsPick: z.boolean().optional().default(false),
    /** Unpublished work in progress: kept out of every index and feed. */
    draft: z.boolean().optional().default(false),
    readingTime: z.number().optional(),
    sources,
    ...media,
  }),
});

/** Evergreen reference entries. */
const explainers = defineCollection({
  loader: glob({ pattern: "**/*.mdx", base: "./src/content/explainers" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    updated: z.coerce.date().optional(),
    tags: z.array(z.string()).optional().default([]),
    draft: z.boolean().optional().default(false),
    readingTime: z.number().optional(),
    sources,
    ...media,
  }),
});

export const collections = { articles, explainers };
