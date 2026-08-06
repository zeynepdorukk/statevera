// @ts-check
import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import { unified } from "@astrojs/markdown-remark";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// The publication is served from the root of statevera.netlify.app, which also
// runs the desk. There is no base path any more: the GitHub Pages deployment,
// which needed /statevera/, has been retired.
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
 * Runs the desk's API locally, using the same handler that Netlify runs in
 * production, so there is only one implementation to keep honest.
 *
 * `apply: "serve"` means this plugin does not exist during a build. Secrets are
 * read from the gitignored .env at request time and never reach the bundler, so
 * they cannot end up in dist/.
 */

/** @type {import("vite").Plugin} */
const deskDevPlugin = {
  name: "statevera-desk-api",
  apply: "serve",
  configureServer(server) {
    /** @returns {Record<string, string>} */
    const env = () => ({
      EDITOR_USER: readProjectEnv("EDITOR_USER"),
      EDITOR_PASSWORD: readProjectEnv("EDITOR_PASSWORD"),
      SESSION_SECRET: readProjectEnv("SESSION_SECRET"),
      OPENAI_KEY: readProjectEnv("OPENAI_KEY"),
      GITHUB_TOKEN: readProjectEnv("GITHUB_TOKEN"),
      GITHUB_REPO: readProjectEnv("GITHUB_REPO"),
    });

    const ready = env();
    console.log(
      ready.EDITOR_PASSWORD && ready.SESSION_SECRET
        ? `  desk: sign in as ${ready.EDITOR_USER || "zeynepdoruk"}${ready.OPENAI_KEY ? " — assistant ready" : " — no assistant key"}`
        : "  desk: add EDITOR_PASSWORD and SESSION_SECRET to .env to sign in locally"
    );

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
            const { handleDesk } = await server.ssrLoadModule("/src/server/desk.ts");
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
            const response = await handleDesk(request, env());
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

const legacyRedirects = Object.fromEntries(
  Object.entries(legacy).map(([from, to]) => [from, `${BASE}${to}`])
);

// https://astro.build/config
export default defineConfig({
  site: "https://statevera.netlify.app",
  base: `${BASE}/`,
  output: "static",
  trailingSlash: "ignore",
  redirects: legacyRedirects,
  markdown: { processor: unified({ rehypePlugins: [rehypeBaseImages] }) },
  integrations: [mdx(), sitemap({ filter: (page) => !page.includes("/editor") })],
  vite: {
    plugins: [tailwindcss(), deskDevPlugin],
  },
});
