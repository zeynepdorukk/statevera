// @ts-check
import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import { unified } from "@astrojs/markdown-remark";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generateVariants } from "./scripts/responsive-images.mjs";

// statevera.org serves the site from its root, in production as in development.
// Kept as a constant because the helpers below still ask where the root is.
const BASE = "";

/**
 * Reads one key out of the project's .env.
 *
 * Deliberately not Vite's loadEnv: that also merges ambient process.env, and the
 * dev server can inherit an unrelated OPENAI key from whatever launched it. Only
 * a key written into this project's .env is ever used.
 *
 * @param {string} name
 * @returns {string}
 */
function readProjectEnv(name) {
  const file = resolve(process.cwd(), ".env");
  if (!existsSync(file)) return "";
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/i);
    if (!match || match[1] !== name) continue;
    return match[2].trim().replace(/^["']|["']$/g, "");
  }
  return "";
}

/**
 * Runs the public API locally, using the same handler the Cloudflare Worker
 * runs in production, so there is only one implementation to keep honest.
 *
 * `apply: "serve"` means this plugin does not exist during a build. Keys are
 * read from the gitignored .env at request time and never reach the bundler, so
 * they cannot end up in dist/.
 */

/** @type {import("vite").Plugin} */
const apiDevPlugin = {
  name: "statevera-api",
  apply: "serve",
  configureServer(server) {
    /** Stands in for the Worker's KV binding, so read counts work while writing. */
    /** @type {Map<string, { value: string, metadata: unknown, expires: number }>} */
    const kv = new Map();
    const views = {
      /** @param {string} key @param {string} [type] */
      get: async (key, type) => {
        const entry = kv.get(key);
        if (!entry || (entry.expires && entry.expires < Date.now())) return null;
        return type === "json" ? JSON.parse(entry.value) : entry.value;
      },
      /** @param {string} key @param {string} value @param {{ metadata?: unknown, expirationTtl?: number }} [options] */
      put: async (key, value, options) =>
        void kv.set(key, {
          value,
          metadata: options?.metadata ?? {},
          expires: options?.expirationTtl ? Date.now() + options.expirationTtl * 1000 : 0,
        }),
      /** @param {{ prefix: string }} options */
      list: async ({ prefix }) => ({
        keys: [...kv]
          .filter(([name]) => name.startsWith(prefix))
          .map(([name, entry]) => ({ name, metadata: entry.metadata })),
        list_complete: true,
      }),
    };

    const env = () => ({
      GOVINFO_API_KEY: readProjectEnv("GOVINFO_API_KEY"),
      CONGRESS_API_KEY: readProjectEnv("CONGRESS_API_KEY"),
      OSCE_SEARCH_API_KEY: readProjectEnv("OSCE_SEARCH_API_KEY"),
      VIEWS: views,
    });

    server.middlewares.use((req, res, next) => {
      const url = req.url ?? "";
      const path = url.startsWith(`${BASE}/api/`) ? url.slice(BASE.length) : url;
      if (!path.startsWith("/api/")) return next();

      /** @type {Buffer[]} */
      const chunks = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", () => {
        void (async () => {
          try {
            const { handleApi } = await server.ssrLoadModule("/src/server/api.ts");
            const headers = new Headers();
            for (const [name, value] of Object.entries(req.headers)) {
              if (typeof value === "string") headers.set(name, value);
              else if (Array.isArray(value)) headers.set(name, value.join(", "));
            }
            const request = new Request(`http://${req.headers.host ?? "localhost"}${path}`, {
              method: req.method,
              headers,
              body: chunks.length ? Buffer.concat(chunks) : undefined,
            });
            const response = await handleApi(request, env());
            res.statusCode = response.status;
            response.headers.forEach((/** @type {string} */ value, /** @type {string} */ name) =>
              res.setHeader(name, value)
            );
            res.end(Buffer.from(await response.arrayBuffer()));
          } catch (error) {
            res.statusCode = 500;
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({ error: String(error) }));
          }
        })();
      });
    });
  },
};


/**
 * Markdown images are written as `/images/articles/x.jpg`, the path the file
 * actually has in the repository. Astro leaves those alone, so under a base path
 * they would 404. This puts the base back on the way out.
 *
 * @returns {(tree: any) => void}
 */
function rehypeBaseImages() {
  return (tree) => {
    const walk = (/** @type {any} */ node) => {
      if (node.tagName === "img") {
        const src = node.properties?.src;
        if (typeof src === "string" && src.startsWith("/") && !src.startsWith(`${BASE}/`)) {
          node.properties.src = BASE + src;
        }
      }
      for (const child of node.children ?? []) walk(child);
    };
    walk(tree);
  };
}

// The site was reorganised around three pillars; these keep the addresses that
// were published under the old structure working. Astro prefixes the base path
// onto redirect sources but not onto targets, so the targets carry it here.
const legacy = {
  "/news": "/wire",
  "/news/politics": "/wire/politics",
  "/news/geopolitics": "/wire/geopolitics",
  "/news/economy": "/wire/economy",
  "/news/culture": "/wire",
  "/news/security": "/wire/security",
  "/news/diplomacy": "/wire/diplomacy",
  "/news/opinion": "/journal",
  "/politics": "/wire/politics",
  "/geopolitics": "/wire/geopolitics",
  "/economy": "/wire/economy",
  "/culture": "/wire",
  "/security": "/wire/security",
  "/diplomacy": "/wire/diplomacy",
  "/opinion": "/journal",
  "/world": "/wire",
  "/briefings": "/wire",
  "/latest": "/wire",
  "/analysis": "/journal",
  "/concepts": "/journal",
  "/concepts/theory": "/journal/theory",
  "/theory": "/journal/theory",
  "/explainers": "/journal",
};;

// Targets carry the trailing slash the pages are served at, so an old address
// costs one redirect instead of two.
const legacyRedirects = Object.fromEntries(
  Object.entries(legacy).map(([from, to]) => [from, `${BASE}${to}/`])
);

/**
 * When each published article last changed, keyed by its canonical address, for
 * the sitemap's <lastmod>. Read from frontmatter so the sitemap never claims a
 * page changed just because the site was rebuilt (which happens every 15 min).
 * Translations are paired by translationKey, so the sitemap can name both
 * editions even though their slugs differ.
 *
 * @returns {{ dates: Map<string, string>, editions: Map<string, { url: string, lang: string }[]> }}
 */
function articleIndex() {
  /** @type {Map<string, string>} */
  const dates = new Map();
  /** @type {Map<string, { url: string, lang: string }[]>} */
  const byKey = new Map();
  /** @type {Map<string, { url: string, lang: string }[]>} */
  const editions = new Map();
  const dir = resolve(process.cwd(), "src/content/articles");
  if (!existsSync(dir)) return { dates, editions };
  for (const name of readdirSync(dir).filter((file) => file.endsWith(".mdx"))) {
    const head = readFileSync(resolve(dir, name), "utf8").split(/^---\s*$/m)[1] ?? "";
    /** @param {string} key */
    const field = (key) => head.match(new RegExp(`^${key}:\\s*["']?([^"'\\n]+)`, "m"))?.[1]?.trim() ?? "";
    if (field("draft") === "true") continue;
    const stamp = Date.parse(field("updated") || field("date"));
    if (Number.isNaN(stamp)) continue;
    const lang = field("language") === "tr" ? "tr" : "en";
    const url = `https://statevera.org${lang === "tr" ? "/tr" : ""}/articles/${name.replace(/\.mdx$/, "")}/`;
    dates.set(url, new Date(stamp).toISOString());
    const key = field("translationKey");
    if (key) byKey.set(key, [...(byKey.get(key) ?? []), { url, lang }]);
  }
  for (const group of byKey.values()) {
    if (group.length < 2) continue;
    for (const edition of group) editions.set(edition.url, group);
  }
  return { dates, editions };
}
const { dates: lastmods, editions } = articleIndex();

/**
 * Writes WebP width variants and a link-preview cut for every picture the
 * publication serves itself, after the build, into dist/ only.
 *
 * @type {import("astro").AstroIntegration}
 */
const responsiveImages = {
  name: "statevera-responsive-images",
  hooks: {
    "astro:build:done": async ({ dir, logger }) => {
      await generateVariants(fileURLToPath(dir), { log: (/** @type {string} */ line) => logger.info(line) });
    },
  },
};

// https://astro.build/config
export default defineConfig({
  site: "https://statevera.org",
  base: `${BASE}/`,
  output: "static",
  trailingSlash: "ignore",
  i18n: {
    locales: ["en", "tr"],
    defaultLocale: "en",
    fallback: { tr: "en" },
    routing: { prefixDefaultLocale: false, fallbackType: "rewrite" },
  },
  redirects: legacyRedirects,
  markdown: { processor: unified({ rehypePlugins: [rehypeBaseImages] }) },
  // The wire and the live page carry other newsrooms' headlines, not this
  // publication's writing, so they stay out of the index and out of the sitemap.
  integrations: [
    mdx(),
    responsiveImages,
    sitemap({
      filter: (page) => !/\/(404|editor|wire|live)\//.test(page),
      // The English and Turkish editions of a section page share a path; the
      // sitemap says so, which is how Google pairs them without guessing.
      i18n: { defaultLocale: "en", locales: { en: "en", tr: "tr" } },
      serialize(item) {
        const lastmod = lastmods.get(item.url);
        if (lastmod) {
          const group = editions.get(item.url);
          return { ...item, lastmod, priority: 0.8, ...(group ? { links: group } : {}) };
        }
        if (item.url === "https://statevera.org/" || item.url === "https://statevera.org/tr/") return { ...item, priority: 1 };
        return item;
      },
    }),
  ],
  vite: {
    plugins: [tailwindcss(), apiDevPlugin],
  },
});
