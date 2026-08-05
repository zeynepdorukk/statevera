// @ts-check
import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const BASE = "/statevera";

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
 * Hands the local OpenAI key to the editor while running `astro dev`.
 *
 * `apply: "serve"` means this plugin does not exist during a build, and the key
 * is read from disk rather than from anything the bundler can see, so it cannot
 * end up in dist/. Put it in the gitignored .env:
 *
 *   OPENAI_KEY=sk-...
 */
const DEV_KEY_PATH = "/__dev/openai-key";

/** @type {import("vite").Plugin} */
const devKeyPlugin = {
  name: "statevera-dev-openai-key",
  apply: "serve",
  configureServer(server) {
    const key = readProjectEnv("OPENAI_KEY");
    console.log(
      key
        ? "  editor: OpenAI key loaded from .env — the assistant is ready in dev"
        : "  editor: no OPENAI_KEY in .env — paste a key in the editor to use the assistant"
    );

    // Mounted at the root and matched by hand: the base path is stripped from
    // req.url at different points depending on middleware order.
    server.middlewares.use((req, res, next) => {
      const url = req.url ?? "";
      const wanted = url.startsWith(DEV_KEY_PATH) || url.startsWith(`${BASE}${DEV_KEY_PATH}`);
      if (!wanted) return next();

      // Only the editor page itself may read it, never another local page.
      const site = req.headers["sec-fetch-site"];
      const sameOrigin = site === undefined || site === "same-origin";

      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "no-store");
      res.end(JSON.stringify({ key: sameOrigin ? key : "" }));
    });
  },
};

// The site was reorganised around three pillars; these keep the addresses that
// were published under the old structure working. Astro prefixes the base path
// onto redirect sources but not onto targets, so the targets carry it here.
const legacy = {
  "/news": "/wire",
  "/news/politics": "/wire/politics",
  "/news/geopolitics": "/wire/geopolitics",
  "/news/economy": "/wire/economy",
  "/news/culture": "/wire/culture",
  "/news/security": "/wire/security",
  "/news/diplomacy": "/wire/diplomacy",
  "/news/opinion": "/journal",
  "/politics": "/wire/politics",
  "/geopolitics": "/wire/geopolitics",
  "/economy": "/wire/economy",
  "/culture": "/wire/culture",
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
};

const legacyRedirects = Object.fromEntries(
  Object.entries(legacy).map(([from, to]) => [from, `${BASE}${to}`])
);

// https://astro.build/config
export default defineConfig({
  site: "https://zeynepdorukk.github.io",
  base: `${BASE}/`,
  output: "static",
  trailingSlash: "ignore",
  redirects: legacyRedirects,
  integrations: [mdx(), sitemap({ filter: (page) => !page.includes("/editor") })],
  vite: {
    plugins: [tailwindcss(), devKeyPlugin],
  },
});
