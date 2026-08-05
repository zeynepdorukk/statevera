# STATEVERA — International Affairs Editorial Site

A complete, production-quality editorial news and analysis site focused on international
relations, built with **Astro 7**, **TypeScript**, **Tailwind CSS 4** and **MDX**. Static
output, no runtime JS dependencies (except the search overlay and theme toggle).

Brand assets live in `public/images/branding/`: `logo-mark.svg` (geometric three-colour
mark: ink ring + red/gold "V"), `favicon.svg` / `favicon.ico` / `favicon-*.png`,
`apple-touch-icon.png`, `logo-512.png` and the `og-image.jpg` social card.

## Quick start

```sh
npm install
npm run dev        # local server at http://localhost:4321
npm run build      # production build to ./dist/
npm run preview    # serve the built site
```

> On Windows PowerShell, use `npm.cmd` (the execution policy blocks `npm.ps1`).

## Content model

All content lives in `src/content/` with schemas defined in `src/content.config.ts`.

| Collection    | Format | Route              | Purpose                                   |
| ------------- | ------ | ------------------ | ----------------------------------------- |
| `articles`    | MDX    | `/articles/[slug]` | Full news / analysis / opinion pieces     |
| `briefings`   | MD     | `/briefings`       | Timestamped short updates (the ticker)    |
| `explainers`  | MDX    | `/explainers/[slug]`| Evergreen guides to concepts & chokepoints |

To add content, drop a file in the matching folder with a `slug`-based filename
(e.g. `src/content/articles/my-story.mdx`) and fill in the frontmatter. The site
rebuilds automatically in dev.

Key frontmatter fields:

- `date` — publication date (ISO). Use `updated` for revisions.
- `category` — `Politics | Geopolitics | Economy | Culture | Security | Diplomacy | Theory | Opinion`.
- `region` — `Europe | Middle East | Americas | Asia-Pacific | Africa | Eurasia | Turkey | Global`.
- `type` — `news | analysis | opinion | explainer`.
- `sample: true` — marks demo content; shows a "Demo content" note on the page.
- `heroImage` — `/images/articles/<file>.jpg` (place the image in `public/images/articles/`).
- `sources` — list of `{ name, url }` displayed at the end of the article.

## Editorial workspace (`/editor`)

The site includes a password-protected, client-side editor at `/editor` for the sole
editor & writer (Zeynep Doruk). It can:

- list all articles and explainers,
- load any piece from the repository and edit title, description, date, category,
  region, tags, hero image, sources and body (Markdown, with live preview),
- create new articles/explainers,
- commit changes back to GitHub (push to `master` triggers the Pages rebuild).

### Access

- **Password** (default): `statevera2026`.
  Change it by replacing `EDITOR_PASSWORD_HASH` in `src/pages/editor.astro` with the
  SHA-256 hex of a new password, e.g. `node -e "console.log(require('crypto').createHash('sha256').update('newpassword').digest('hex'))"`.
- **GitHub token** (required for saving): create a fine-grained personal access token
  with **Contents: Read and Write** scoped to the `zeynepdorukk/statevera` repository
  (https://github.com/settings/personal-access-tokens/new) and enter it on the sign-in
  screen. It is stored only in the browser (localStorage) and never sent anywhere
  except GitHub's API.
- This is a static-site gate, not a hard security boundary — anyone who can read the
  page source can read the hash. It keeps casual visitors out; the GitHub token is
  the real control for who can write.

## Architecture

```
src/
├── site.ts                # Single source of brand truth (name, nav, categories, regions, socials)
├── content.config.ts      # Zod schemas for all collections
├── data/imageCredits.ts   # Image attribution map + creditFor() helper
├── utils/collection.ts    # Data-access API used by every page
├── styles/global.css      # Tailwind 4 @theme tokens + editorial typography
├── layouts/BaseLayout.astro  # SEO, JSON-LD, header/footer, dark-mode init
├── components/            # Masthead, Header, BreakingBar, SearchOverlay, cards, sections…
│   ├── mdx/               # MDX components: KeyTakeaways, WhyItMatters, AnalysisSection…
│   └── article/           # ArticleHeader, ArticleSources, ArticleShare, RelatedStories
└── pages/
    ├── index.astro                    # Homepage (lead grid, Top Stories, World Today…)
    ├── [section].astro                # /latest, /explainers (+ legacy redirects)
    ├── news.astro                     # News hub
    ├── news/[section].astro           # /news/politics, /news/geopolitics, … category pages
    ├── concepts.astro                 # Concepts hub (Theory + Explainers)
    ├── concepts/theory.astro          # Academic theory section
    ├── risk.astro                     # Geopolitical Risk Analysis (Glorisk embedded)
    ├── editor.astro                   # Password-protected editorial workspace (noindex)
    ├── articles/[slug].astro
    ├── explainers/[slug].astro
    ├── regions/index.astro            # Regions index
    ├── regions/[region].astro         # Region pages (7 regions)
    ├── briefings.astro                # Dated briefing stream
    ├── about.astro
    ├── 404.astro
    ├── search-index.json.ts           # JSON search index consumed by SearchOverlay
    └── rss.xml.ts                     # RSS feed (dc:creator, media:content)
```

## Customization

- **Brand** — edit `src/site.ts` (publication name, tagline, author, nav, social URLs).
  The production domain is `https://zeynepdorukk.github.io/statevera` in `astro.config.mjs`
  and `public/robots.txt`.
- **Design tokens** — `src/styles/global.css` `@theme`: paper/ink/accent colors,
  font stacks, section numbering, article body typography. Dark mode flips CSS
  variables under `.dark`.
- **Images** — all wire images live in `public/images/articles/` (Web-optimized JPEGs).
  `heroImageAlt`, `imageCredit` and `imageFocus` are frontmatter fields.

## SEO & accessibility

- Per-page meta + canonical + Open Graph/Twitter cards; JSON-LD `WebSite`,
  `NewsArticle` and `Organization` schemas.
- `@astrojs/sitemap` → `/sitemap-index.xml`; `/rss.xml` feed; `robots.txt`.
- Semantic landmarks, skip link, ARIA labels, `prefers-reduced-motion` support,
  keyboard-driven search (`/`), accessible tabs (CSS-only) and dark mode persisted
  in `localStorage`.
