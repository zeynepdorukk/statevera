# STATEVERA

An independent international-affairs publication, built as a static site with
**Astro 7**, **TypeScript**, **Tailwind CSS 4** and **MDX**.

Statevera is organised around three pillars, each with its own colour from the
masthead:

| Pillar          | Colour              | What it is                                                                   |
| --------------- | ------------------- | ---------------------------------------------------------------------------- |
| **The Wire**    | red `#9D1C20`       | Real reporting aggregated from public RSS feeds. Headline, summary, link out. |
| **The Journal** | gold `#C9A227`      | Original analysis, essays and explainers, signed by Zeynep Doruk.             |
| **Risk**        | ink `#17150E`       | Glorisk, the interactive geopolitical-risk tool, embedded.                    |

There is no placeholder content anywhere on the site.

## Quick start

```sh
npm install
cp .env.example .env   # then fill in EDITOR_PASSWORD and SESSION_SECRET
npm run wire           # take a fresh snapshot of the wire
npm run dev            # http://localhost:4321/statevera/
npm run verify         # integrity checks + production build
```

> On Windows PowerShell use `npm.cmd`; the execution policy blocks `npm.ps1`.

| Script             | Does                                                              |
| ------------------ | ----------------------------------------------------------------- |
| `npm run wire`     | Fetches every feed and rewrites `src/data/wire.json`               |
| `npm run wire:dry` | Same, but prints the result instead of writing it                  |
| `npm run check`    | Encoding damage, BOMs, wire health, content sanity                 |
| `npm run verify`   | `check` then `build`                                               |

---

## 1. The Wire

### Where it comes from

`scripts/wire-sources.mjs` lists the feeds. They are all free, key-less, public
RSS: the Guardian, BBC, Al Jazeera, Deutsche Welle, France 24, NPR, Anadolu
Agency, POLITICO Europe, The Diplomat, UN News, War on the Rocks, Responsible
Statecraft and the Atlantic Council.

### What happens to it

`scripts/fetch-wire.mjs` runs the whole pipeline and writes one committed file,
`src/data/wire.json`:

1. **Fetch** every feed in parallel, each isolated so one dead feed cannot spoil
   the run.
2. **Decode** deliberately as UTF-8, resolve entities twice (feeds are often
   double-encoded) and repair any cp1252 mojibake before the text is stored.
3. **Filter for relevance.** General news desks carry a lot that is not
   international affairs. An item from such a desk is kept only if the headline
   scores against the international-affairs vocabulary; an explicit exclusion
   list drops crime, sport and celebrity outright.
4. **Classify** onto a desk and a region by scoring every rule on word
   boundaries, titles weighted double, strongest match wins.
5. **De-duplicate** by URL and by headline similarity, so the same story from
   four newsrooms appears once.
6. **Verify every picture** with a real request. Feeds advertise images that
   401, 403 or have expired; anything that does not come back as an image is
   dropped rather than rendered as a broken box. The declared width is stored so
   the layout knows whether a picture is big enough to lead with.
7. **Refuse to write** a snapshot that is much smaller than the last good one.

Because the output is committed, a failed fetch never empties the site or breaks
a build.

### Keeping it fresh

`.github/workflows/wire.yml` runs the fetcher every three hours, verifies it, and
commits only if something changed — which triggers the Pages deploy. The wire
page shows the timestamp of the snapshot you are reading.

### Sourcing and rights

Statevera stores a headline, a short summary, the newsroom's name and the link.
It never reproduces an article, and every wire item opens at the publisher, who
keeps all rights. The footer names every source.

---

## 2. The Journal

All original work, in two collections under `src/content/`, with schemas in
`src/content.config.ts`:

| Collection   | Route                | Purpose                                    |
| ------------ | -------------------- | ------------------------------------------ |
| `articles`   | `/articles/[slug]`   | Analysis, reporting and opinion            |
| `explainers` | `/explainers/[slug]` | Evergreen reference                        |

Frontmatter of note:

- `draft: true` — keeps a piece out of every index, feed and sitemap. Drafts are
  visible while running `astro dev` so they can be previewed, and are excluded
  from production builds.
- `category` — `Politics | Geopolitics | Economy | Culture | Security | Diplomacy | Theory | Opinion`
- `region` — `Europe | Middle East | Americas | Asia-Pacific | Africa | Eurasia | Turkey | Global`
- `heroImage` — a path under `public/images/articles/`
- `sources` — `{ name, url }` pairs, printed at the foot of the piece

MDX components available in the body: `<KeyTakeaways>`, `<WhyItMatters>`,
`<TheBigPicture>`, `<AnalysisSection>`.

---

## 3. The editorial workspace (`/editor`)

A password-gated, client-side writing desk that commits straight to the
repository. It is `noindex` and disallowed in `robots.txt`.

### Writing

The desk is one surface. There are no forms, no Markdown and no preview pane:
the page you type on **is** the published article, in the published typography.

- **Type straight onto the page.** Headline, standfirst and body are all live
  text. Click the blank space under the story and the caret goes to the end.
- **Formatting appears when you need it.** Select any words and a small toolbar
  floats above them: bold, italic, link, heading, sub-heading, quote, clear.
  <kbd>Ctrl</kbd>+<kbd>B</kbd>, <kbd>Ctrl</kbd>+<kbd>I</kbd> and
  <kbd>Ctrl</kbd>+<kbd>K</kbd> also work.
- **Press `/` for anything else** — heading, sub-heading, bulleted or numbered
  list, quote, divider, image, and the four callouts (Key takeaways, Why it
  matters, The big picture, Analysis). Type to filter, arrows to move,
  <kbd>Enter</kbd> to insert. A **+** handle beside an empty line does the same
  with the mouse.
- **Markdown shortcuts** for people who already have the habit: `## `, `### `,
  `> `, `- `, `1. ` and `---` transform the line as you type it.
- **Images** are chosen from a thumbnail list of what is already in the
  repository, and the caption is typed under the picture.
- **Pasting** always arrives as clean text; a multi-paragraph paste is broken
  into real paragraphs.
- Word count and reading time in the top bar; autosave to this browser after
  every pause, offered back if a session is interrupted.
- **Filing details are out of the way.** Desk, region, tags, countries, lead
  image, alt text, sources and the draft switch live in a **Publish** drawer that
  slides in only when you are ready (<kbd>Ctrl</kbd>+<kbd>S</kbd>).
- The web address of a new piece is derived from the headline when it is first
  published, so nothing has to be named up front.
- **A save is refused if the file contains corrupted characters.**

### The assistant

The assistant is optional and runs on the editor's own OpenAI key. There is one
provider and one model, `gpt-5.6-LUNA`, fixed in `src/lib/editor/ai.ts` — nothing
to choose while writing.

- **Inline continuation.** Pause at the end of a paragraph and a one-sentence
  continuation appears as grey ghost text. <kbd>Tab</kbd> accepts,
  <kbd>Esc</kbd> dismisses, <kbd>Ctrl</kbd>+<kbd>Space</kbd> asks immediately.
- **Assist menu.** Tighten, Develop, Make it clearer, Remove editorialising —
  on the selection, or on the paragraph the caret is in.
- **Standfirst and headlines.** Writes a dek, or offers headline options to pick
  from in a list.
- **Key takeaways.** Drafts the opening callout from the finished piece.
- **Review the layout.** Reads the draft and returns production notes: where a
  picture belongs, where a callout would carry its weight, where a section break
  is missing, what should be cut. Clicking a note selects the passage it means.
- **Fill this in.** In the Publish drawer, proposes tags, countries, desk, region
  and alt text — only filling fields that are still empty.

The house prompt forbids inventing facts, figures, dates and sources, and
everything is proposed for the writer to accept, never applied silently.

Model generations disagree about which request parameters they accept. Rather
than guess, a rejected call is read and retried once without the parameter the
API named, so the desk keeps working when the model changes underneath it.

### Access and keys

Zeynep signs in with a **name and a password**. That is the whole of it: there
is no key to paste, no token to manage, and nothing sensitive in her browser.

Everything privileged lives on the server half of the desk, in
[src/server/desk.ts](src/server/desk.ts):

| Variable          | What it is                                              |
| ----------------- | ------------------------------------------------------- |
| `EDITOR_USER`     | the name she types (defaults to `zeynepdoruk`)          |
| `EDITOR_PASSWORD` | the password she types                                  |
| `SESSION_SECRET`  | signs the session cookie; changing it signs everyone out |
| `OPENAI_KEY`      | the assistant. Without it the desk works, unassisted     |
| `GITHUB_TOKEN`    | fine-grained PAT, **Contents: Read and Write**           |
| `GITHUB_REPO`     | `zeynepdorukk/statevera`                                 |

A successful sign-in returns a cookie that is `HttpOnly`, `Secure`,
`SameSite=Lax` and good for twelve hours. `HttpOnly` means page scripts cannot
read it even in principle, which is why `sessionStorage` is no longer used for
anything but the local draft of the piece being written.

The cookie carries `user.expiry.hmac`. Editing any part of it — extending the
expiry, changing the name — invalidates the signature, so a session cannot be
forged without `SESSION_SECRET`.

Two further limits apply after sign-in, on the assumption that a session could
one day be stolen:

- **Only two folders are reachable.** `src/content/articles` and
  `src/content/explainers`, matching `[a-z0-9-]+.mdx`. Anything else — `.env`,
  a workflow file, a `../` traversal — is refused before GitHub is contacted.
- **Mutating calls require a same-origin request.** `SameSite=Lax` already
  blocks cross-site form posts; an explicit `Origin` check closes the rest.

Login attempts are answered in constant time after a fixed delay, and both the
name and the password are compared without leaking where they diverge.

### Why the site is on GitHub Pages but the desk is not

GitHub Pages serves files. It cannot run code, so it cannot hold a secret: a key
baked in at build time is shipped to every visitor inside the JavaScript bundle,
whether it came from a committed file, an `.env` or a GitHub Actions secret.
There is no version of "put the key in the repo" that is safe.

So the two halves are hosted separately:

| | Where | What it holds |
| --- | --- | --- |
| The publication | GitHub Pages | static pages, free and unlimited |
| The desk | Cloudflare Pages | `/editor` and `/api/*`, and every secret |

Cloudflare was chosen because the editor and its API sit on the **same origin**
there, which is what allows a first-party `HttpOnly` cookie. Static requests are
free and unlimited; the free plan allows 100,000 function requests a day, and a
writer working all day uses a few hundred.

The public site is untouched by any of this. It has no login, no API and no
JavaScript that knows the desk exists.

#### Setting up the desk

1. Create a free Cloudflare account and a **Pages** project connected to this
   repository. Build command `npm run build`, output directory `dist`.
2. Add the variables in the table above under **Settings → Environment
   variables**, as **encrypted** values. They are write-only once saved.
3. Deploy. The desk answers at `<project>.pages.dev`, and its front door
   redirects to `/statevera/editor`.

Locally, copy `.env.example` to `.env` and run `npm run dev`; the same handler
runs behind the dev server, so there is one implementation to keep honest.
Reads work without a `GITHUB_TOKEN` because the repository is public — the desk
will open and render stories, and only refuse to publish.

**`npm run check` scans `dist/` for credential shapes** (OpenAI, Anthropic,
GitHub, Google) and fails the build if it finds one. It reports the file and the
kind of token, never the value. This runs in CI before every deploy.


---

## Where the data lives

There is no database and no server. **The git repository is the database**, which
is what makes the whole thing free to run and impossible to lose.

| What                | Stored as                          | Written by                        |
| ------------------- | ---------------------------------- | --------------------------------- |
| Articles            | `src/content/articles/*.mdx`       | the editor, as a commit           |
| Explainers          | `src/content/explainers/*.mdx`     | the editor, as a commit           |
| The wire            | `src/data/wire.json`               | `wire.yml`, every three hours     |
| Pictures            | `public/images/articles/*`         | committed by hand                 |
| Configuration       | `src/site.ts`                      | committed by hand                 |

Every save in the editor is a commit through the GitHub contents API. That means
an article is never "in" the site the way a row is in a table — it is a file with
a history:

- Every version of every piece is kept forever, with a date and a message.
- Any change can be reverted with `git revert`, from the GitHub UI if necessary.
- A piece written today and a piece written last year are the same kind of
  object; nothing expires.
- The whole publication can be cloned, backed up or moved to another host by
  copying one folder.

The wire is the only thing that turns over. Each refresh replaces
`src/data/wire.json` wholesale, so the page always shows one coherent snapshot
rather than an ever-growing pile. Superseded snapshots are not lost either — they
are in the commit history — but the site only ever renders the current one.

What this arrangement cannot do, and would need a real backend for: reader
accounts, comments, newsletter subscriptions, per-reader personalisation, or
analytics beyond what a third-party script provides. None of those are needed to
publish.

---

## Architecture

```
functions/
└── api/[[path]].ts         # Cloudflare entry point; one line, calls the router

scripts/
├── wire-sources.mjs        # feed registry + classification vocabulary
├── fetch-wire.mjs          # the aggregation pipeline
└── check-content.mjs       # encoding, BOM, wire and credential guards

src/
├── server/desk.ts          # sign-in, sessions, GitHub and OpenAI — the only secret holder
├── site.ts                # pillars, navigation, desks, regions — one source of truth
├── content.config.ts      # Zod schemas
├── data/
│   ├── wire.json          # the committed snapshot
│   ├── wire.ts            # typed access + lead selection
│   └── imageCredits.ts    # attribution for the journal's own pictures
├── utils/collection.ts    # journal data access
├── lib/editor/            # ai.ts · desk.ts · document.ts · richtext.ts
├── styles/global.css      # three-colour design system
├── layouts/BaseLayout.astro
├── layouts/EditorLayout.astro      # chrome-free shell for the desk
├── components/
│   ├── WireCard.astro     # lead · feature · compact · text
│   ├── JournalCard.astro  # the same four, in gold
│   ├── WireTicker.astro   # the live bar
│   ├── Header · Footer · Masthead · SearchOverlay · ThemeToggle · SectionHead
│   ├── article/           # ArticleHeader · Sources · Share · RelatedStories
│   └── mdx/               # the four callouts
└── pages/
    ├── index.astro                 # all three pillars
    ├── wire.astro, wire/[desk].astro
    ├── journal.astro, journal/theory.astro
    ├── explainers.astro, explainers/[slug].astro
    ├── articles/[slug].astro
    ├── regions/index.astro, regions/[region].astro
    ├── risk.astro, about.astro, editor.astro, 404.astro
    ├── search-index.json.ts        # wire + journal, filterable in the overlay
    └── rss.xml.ts                  # the Journal only
```

## Design system

Three colours do all the work, taken from the masthead: ink `#17150E`, red
`#9D1C20`, gold `#C9A227`. A `data-tone` attribute switches `--tone` on any
subtree, so a wire card is red and a journal card is gold without either
component knowing about the other. Newsreader sets headlines and body copy,
Inter carries metadata and interface furniture. Dark mode flips the variables
under `.dark`.

Edit `src/styles/global.css` for tokens and `src/site.ts` for everything else.

## SEO & accessibility

- Per-page meta, canonical, Open Graph and Twitter cards; JSON-LD `WebSite`,
  `AnalysisNewsArticle`/`OpinionNewsArticle`, `Article` and `Organization`.
- `@astrojs/sitemap` → `/sitemap-index.xml`; `/rss.xml`; `robots.txt`.
- Semantic landmarks, skip link, ARIA labels, visible focus rings,
  `prefers-reduced-motion` (the ticker stops), keyboard-driven search (`/`,
  arrows, Enter) and dark mode persisted in `localStorage`.
- Every image carries width and height; wire pictures are lazy-loaded and
  `no-referrer`, the lead is eager with `fetchpriority="high"`.
