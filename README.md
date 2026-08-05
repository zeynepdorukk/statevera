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
- `category` — `Geopolitics | Security | Diplomacy | Economy | Analysis | Opinion`.
- `region` — `Europe | Middle East | Americas | Asia-Pacific | Africa | Eurasia | Turkey | Global`.
- `type` — `news | analysis | opinion | explainer`.
- `sample: true` — marks demo content; shows a "Demo content" note on the page.
- `heroImage` — `/images/articles/<file>.jpg` (place the image in `public/images/articles/`).
- `sources` — list of `{ name, url }` displayed at the end of the article.

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
    ├── [section].astro                # /latest, /world, /geopolitics, /analysis, …
    ├── articles/[slug].astro
    ├── explainers/[slug].astro
    ├── regions/index.astro            # Regions desk index
    ├── regions/[region].astro         # Region desks (7 regions)
    ├── briefings.astro                # Dated briefing stream
    ├── about.astro
    ├── 404.astro
    ├── search-index.json.ts           # JSON search index consumed by SearchOverlay
    └── rss.xml.ts                     # RSS feed (dc:creator, media:content)
```

## Customization

- **Brand** — edit `src/site.ts` (publication name, tagline, author, nav, social URLs).
  The production domain is `https://statevera.example.com` in `astro.config.mjs`
  and `public/robots.txt`; update before going live.
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
