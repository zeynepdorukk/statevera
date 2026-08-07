// Client runtime for the editorial desk. The Astro page owns only the shell markup.

import { type AiConfig,
  completeInline, suggestMeta, suggestPhotoQuery,
  chatAboutPiece, suggestSources, type ChatApply, type SourceSuggestion } from "../lib/editor/ai";
import { readSession, signIn, signOutRequest, readLibrary, readFile, writeFile, deleteFile,
  searchPhotos, importPhoto, uploadImage, type FileEntry, type Photo } from "../lib/editor/desk";
import { TEMPLATES, templateById, type Template } from "../lib/editor/templates";
import { parseDocument, serialiseArticle, slugify,
  findBrokenCharacters, type ArticleFields } from "../lib/editor/document";
import { markdownToHtml, htmlToMarkdown, canvasText, countWords, readingMinutes,
  setAssetBase, inlineToHtml, CALLOUTS, type CalloutName } from "../lib/editor/richtext";
import { site } from "../site";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
setAssetBase(import.meta.env.BASE_URL);

// Titles and dates come from the published site, not from this deployment's own
// build, so a piece published a minute ago is named properly in the list even
// if the desk itself has not been rebuilt since.
const LIVE_INDEX = `${site.siteUrl}/search-index.json`;

const K_DRAFT = "sv-draft:";

const DESKS = ["Politics", "Geopolitics", "Economy", "Security", "Diplomacy", "Theory", "Opinion"];
const REGIONS = ["Europe", "Middle East", "Americas", "Asia-Pacific", "Africa", "Eurasia", "Turkey", "Global"];
const TYPES = ["analysis", "news", "opinion"];

type Kind = "article";

interface Story {
  kind: Kind;
  slug: string;
  path: string;
  sha: string;
  title: string;
  description: string;
  date: string;
  desk: string;
  region: string;
  live: boolean;
}

const root = document.querySelector<HTMLElement>("[data-editor-root]")!;

const state = {
  user: "",
  assistant: false,
  canPublish: false,
  model: "",
  ai: {} as AiConfig,
  stories: [] as Story[],
  images: [] as string[],
};

const aiReady = () => state.assistant;

const esc = (v: unknown) =>
  String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const el = <T extends HTMLElement>(s: string) => root.querySelector<T>(s)!;
const maybe = <T extends HTMLElement>(s: string) => root.querySelector<T>(s);
const view = (html: string) => { root.innerHTML = html; };
const today = () => new Date().toISOString().slice(0, 10);
const booting = (label: string) => `
  <div class="ed-boot">
    <img src="${BASE}/images/branding/logo-mark-light.svg" alt="" width="34" height="34" />
    <span>${esc(label)}</span>
  </div>`;

const debounce = <A extends unknown[]>(fn: (...a: A) => void, ms: number) => {
  let t: number | undefined;
  return (...a: A) => { window.clearTimeout(t); t = window.setTimeout(() => fn(...a), ms); };
};

// ==========================================================
// Sign in
// ==========================================================

// Every screen shown before the desk opens shares one frame: the mark, what
// this place is, and a single card holding whatever needs an answer.
function gate(card: string) {
  const stamp = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  view(`
    <div class="ed-gate">
      <div class="ed-gate-inner">
        <div class="ed-gate-brand">
          <span class="ed-gate-mark">
            <img src="${BASE}/images/branding/logo-mark-light.svg" alt="" width="44" height="44" />
            <span>${esc(site.publicationName)}</span>
          </span>
          <h1 class="ed-gate-title">The desk</h1>
          <p class="ed-gate-lede">Where Statevera is written, edited and published \u{2014} one writer, one surface.</p>
          <ul class="ed-gate-pillars">
            <li><span class="ed-gate-dot" data-p="journal"></span><b>Journal</b><span>Signed analysis, drafted and filed here</span></li>
            <li><span class="ed-gate-dot" data-p="wire"></span><b>News</b><span>Public-source reporting, refreshed every 15 minutes</span></li>
            <li><span class="ed-gate-dot" data-p="risk"></span><b>Glorisk</b><span>Interactive geopolitical risk</span></li>
          </ul>
          <p class="ed-gate-meta">Editorial desk \u{b7} ${esc(stamp)}</p>
        </div>
        <div class="ed-gate-card">${card}</div>
      </div>
    </div>
  `);
}

function signInView(message = "") {
  gate(`
    <p class="ed-legend">Sign in</p>
    <p class="ed-gate-say">Two things, then you are writing.</p>
    ${message ? `<p class="ed-warn" style="margin-bottom:1rem">${esc(message)}</p>` : ""}
    <form data-signin>
      <div class="ed-field">
        <label for="who">Name</label>
        <input id="who" type="text" class="ed-input" required autocomplete="username" autocapitalize="off" spellcheck="false" />
      </div>
      <div class="ed-field">
        <label for="pw">Password</label>
        <div class="ed-gate-pw">
          <input id="pw" type="password" class="ed-input" required autocomplete="current-password" />
          <button type="button" class="ed-gate-reveal" data-reveal aria-label="Show password">Show</button>
        </div>
      </div>
      <button type="submit" class="ed-btn ed-btn-primary ed-gate-go" data-submit>Start writing</button>
    </form>
    <p class="ed-gate-foot">Nothing else to enter. The keys live on the server.</p>
  `);

  const pw = el<HTMLInputElement>("#pw");
  const reveal = el<HTMLButtonElement>("[data-reveal]");
  reveal.addEventListener("click", () => {
    const shown = pw.type === "text";
    pw.type = shown ? "password" : "text";
    reveal.textContent = shown ? "Show" : "Hide";
    reveal.setAttribute("aria-label", shown ? "Show password" : "Hide password");
    pw.focus();
  });

  el<HTMLFormElement>("[data-signin]").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = el<HTMLButtonElement>("[data-submit]");
    button.disabled = true;
    button.textContent = "Checking\u{2026}";
    try {
      const session = await signIn(el<HTMLInputElement>("#who").value, pw.value);
      state.user = session.user;
      state.assistant = session.assistant;
      state.canPublish = session.canPublish;
      state.model = session.model;
      await openStories();
    } catch (error) {
      signInView((error as Error).message);
    }
  });
  el<HTMLInputElement>("#who").focus();
}

async function signOut() {
  await signOutRequest().catch(() => {});
  state.user = "";
  state.assistant = false;
  signInView();
}

// ==========================================================
// Stories
// ==========================================================

async function openStories(notice = "") {
  view(booting("Reading the archive"));

  try {
    const library = await readLibrary();
    state.images = library.images;

    const index: { url: string; title: string; description: string; category: string; region: string; date: string }[] =
      await fetch(LIVE_INDEX)
        .then((r) => r.json())
        .catch(() => fetch(`${BASE}/search-index.json`).then((r) => r.json()).catch(() => []));

    const build = (kind: Kind) => (f: FileEntry): Story => {
      const slug = f.name.replace(/\.mdx?$/, "");
      const meta = index.find((i) => i.url.endsWith(`/${slug}`));
      return {
        kind,
        slug,
        path: f.path,
        sha: f.sha,
        title: meta?.title ?? slug.replace(/-/g, " "),
        description: meta?.description ?? "",
        date: meta?.date?.slice(0, 10) ?? "",
        desk: meta?.category ?? "",
        region: meta?.region ?? "",
        live: Boolean(meta),
      };
    };

    state.stories = library.articles
      .filter((f) => /\.mdx?$/.test(f.name))
      .map(build("article"))
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""));

    storiesView(notice);
  } catch (error) {
    signInView((error as Error).message);
  }
}

function storiesView(notice = "") {
  const card = (s: Story) => {
    const unsaved = Boolean(localStorage.getItem(K_DRAFT + s.path));
    const stateLabel = unsaved ? "Unsaved" : s.live ? "Published" : "Draft";
    const stateKind = unsaved ? "edit" : s.live ? "live" : "draft";
    const foot = [s.region, s.date].filter(Boolean).map(esc).join(" \u{b7} ");
    return `
      <article class="ed-card" data-card="${esc(s.path)}">
        <div class="ed-card-top">
          <span class="ed-pill" data-kind="${stateKind}">${stateLabel}</span>
          <span class="ed-card-desk">${esc(s.desk || "Journal")}</span>
        </div>
        <h2 class="ed-card-title">
          <button type="button" class="ed-card-open" data-open="${esc(s.path)}">${esc(s.title)}</button>
        </h2>
        ${s.description ? `<p class="ed-card-desc">${esc(s.description)}</p>` : ""}
        <div class="ed-card-foot">
          <span class="ed-card-meta">${foot || "Not filed yet"}</span>
          <button type="button" class="ed-card-kill" data-kill aria-label="Delete ${esc(s.title)}">Delete</button>
        </div>
        <div class="ed-card-ask" hidden>
          <p>Delete \u{201c}${esc(s.title)}\u{201d}? It leaves the site at the next build.</p>
          <div class="ed-card-ask-row">
            <button type="button" class="ed-btn ed-btn-quiet" data-keep>Keep</button>
            <button type="button" class="ed-btn ed-btn-danger" data-kill-yes>Delete</button>
          </div>
        </div>
      </article>`;
  };

  const published = state.stories.filter((s) => s.live).length;

  view(`
    <div class="ed-bar">
      <div class="ed-bar-left">
        <img class="ed-bar-mark" src="${BASE}/images/branding/logo-mark-light.svg" alt="" width="22" height="22" />
        <span class="ed-legend" style="margin:0">Statevera</span>
      </div>
      <div class="ed-bar-right">
        <button type="button" class="ed-btn ed-btn-quiet" data-out>Sign out</button>
        <button type="button" class="ed-btn ed-btn-primary" data-new>New piece</button>
      </div>
    </div>
    <div class="ed-stories">
      ${notice ? `<p class="ed-note" data-state="ok" style="margin-bottom:1rem">${esc(notice)}</p>` : ""}
      ${state.canPublish ? "" : '<p class="ed-warn" style="margin-bottom:1rem">This deployment cannot publish \u{2014} no GitHub token on the server. You can read and draft, but not save.</p>'}
      <div class="ed-stories-head">
        <h1>Your stories</h1>
        <p class="ed-note">${state.stories.length} pieces \u{b7} ${published} live</p>
      </div>
      ${state.stories.length === 0
        ? `<div class="ed-empty">
             <img src="${BASE}/images/branding/logo-mark-light.svg" alt="" width="40" height="40" />
             <p>Nothing filed yet.</p>
             <button type="button" class="ed-btn ed-btn-primary" data-new-empty>Write the first piece</button>
           </div>`
        : `<div class="ed-grid">${state.stories.map(card).join("")}</div>`}
    </div>
  `);

  root.querySelectorAll<HTMLButtonElement>("[data-open]").forEach((b) =>
    b.addEventListener("click", () => openStory(b.dataset.open!))
  );
  root.querySelectorAll<HTMLElement>("[data-card]").forEach((cardEl) => {
    const ask = cardEl.querySelector<HTMLElement>(".ed-card-ask")!;
    const show = (open: boolean) => {
      ask.hidden = !open;
      cardEl.dataset.asking = String(open);
    };
    cardEl.querySelector<HTMLButtonElement>("[data-kill]")!.addEventListener("click", () => show(true));
    cardEl.querySelector<HTMLButtonElement>("[data-keep]")!.addEventListener("click", () => show(false));
    cardEl
      .querySelector<HTMLButtonElement>("[data-kill-yes]")!
      .addEventListener("click", () => removeStory(cardEl.dataset.card!, cardEl));
  });
  el<HTMLButtonElement>("[data-new]").addEventListener("click", templatesView);
  maybe<HTMLButtonElement>("[data-new-empty]")?.addEventListener("click", templatesView);
  el<HTMLButtonElement>("[data-out]").addEventListener("click", signOut);
}

async function removeStory(path: string, cardEl: HTMLElement) {
  const story = state.stories.find((s) => s.path === path);
  if (!story) return;
  const yes = cardEl.querySelector<HTMLButtonElement>("[data-kill-yes]")!;
  yes.disabled = true;
  yes.textContent = "Deleting\u{2026}";
  try {
    await deleteFile(path, `Delete ${story.kind} "${story.title}"`, story.sha);
    localStorage.removeItem(K_DRAFT + path);
    await openStories(`Deleted \u{201c}${story.title}\u{201d}.`);
  } catch (error) {
    const ask = cardEl.querySelector<HTMLElement>(".ed-card-ask p")!;
    ask.textContent = (error as Error).message;
    yes.disabled = false;
    yes.textContent = "Delete";
  }
}

// ==========================================================
// Forms a piece can take
// ==========================================================

function templatesView() {
  const card = (t: Template) => `
    <article class="ed-form" data-form="${esc(t.id)}">
      <div class="ed-form-top">
        <span class="ed-pill" data-kind="draft">${esc(t.type)}</span>
        <span class="ed-card-desk">${esc(t.length)}</span>
      </div>
      <h2 class="ed-form-name"><button type="button" class="ed-form-use" data-use>${esc(t.name)}</button></h2>
      <p class="ed-form-blurb">${esc(t.blurb)}</p>
      <div class="ed-form-shape">${t.shape.map((part) => `<span>${esc(part)}</span>`).join("")}</div>
      <button type="button" class="ed-form-peek" data-peek>
        <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
        <span>Preview</span>
      </button>
    </article>`;

  view(`
    <div class="ed-bar">
      <div class="ed-bar-left">
        <button type="button" class="ed-btn ed-btn-quiet" data-back-stories>&larr; Stories</button>
      </div>
      <div class="ed-bar-right">
        <button type="button" class="ed-btn ed-btn-quiet" data-blank>Start from nothing</button>
      </div>
    </div>
    <div class="ed-stories">
      <div class="ed-stories-head">
        <h1>What are you writing?</h1>
        <p class="ed-note">Pick a form. You are typing over it, not filling it in.</p>
      </div>
      <div class="ed-forms">${TEMPLATES.map(card).join("")}</div>
    </div>
  `);

  root.querySelectorAll<HTMLElement>("[data-form]").forEach((formEl) => {
    const template = templateById(formEl.dataset.form!)!;
    formEl.querySelector<HTMLButtonElement>("[data-use]")!.addEventListener("click", () => createStory(template));
    formEl.querySelector<HTMLButtonElement>("[data-peek]")!.addEventListener("click", () => previewTemplate(template));
  });
  el<HTMLButtonElement>("[data-blank]").addEventListener("click", () => createStory());
  el<HTMLButtonElement>("[data-back-stories]").addEventListener("click", () => openStories());
}

/**
 * Shows the form as a finished piece. Uses the invented sample (headline,
 * standfirst, lead photo, full body) so design work can be judged against
 * something that reads like the live site. "Write this" still opens the blank
 * skeleton in `t.body`, not the fake copy.
 */
function previewTemplate(t: Template) {
  const host = document.createElement("div");
  host.className = "ed-modal";
  const leadSrc = BASE + t.sample.image;
  host.innerHTML = `
    <div class="ed-modal-box ed-peek-box" role="dialog" aria-label="${esc(t.name)} preview">
      <div class="ed-modal-head">
        <p class="ed-legend" style="margin:0">Preview &middot; ${esc(t.name)}</p>
        <button type="button" class="ed-btn ed-btn-quiet" data-shut>Close</button>
      </div>
      <div class="ed-peek-scroll">
        <article class="ed-peek">
          <div class="ed-peek-lead">
            <img src="${esc(leadSrc)}" alt="${esc(t.sample.imageAlt)}" width="1200" height="675" />
          </div>
          <p class="ed-peek-credit">${esc(t.sample.imageCredit)}</p>
          <p class="ed-peek-kicker">Journal / ${esc(t.sample.desk)}</p>
          <h1>${esc(t.sample.headline)}</h1>
          <p class="ed-peek-stand">${esc(t.sample.standfirst)}</p>
          <p class="ed-peek-byline">By Zeynep Doruk &middot; ${esc(
            new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
          )} &middot; ${t.sample.minutes} min read</p>
          <div class="ed-body ed-peek-body">${markdownToHtml(t.sample.body)}</div>
        </article>
      </div>
      <div class="ed-peek-foot">
        <p class="ed-note">Design sample. Writing still starts from the blank form.</p>
        <button type="button" class="ed-btn ed-btn-primary" data-take>Write this &rarr;</button>
      </div>
    </div>`;
  document.body.append(host);

  const shut = () => {
    document.removeEventListener("keydown", onKey, true);
    host.remove();
  };
  function onKey(event: KeyboardEvent) {
    if (event.key === "Escape") { event.preventDefault(); shut(); }
  }
  document.addEventListener("keydown", onKey, true);
  host.addEventListener("mousedown", (event) => { if (event.target === host) shut(); });
  host.querySelector<HTMLButtonElement>("[data-shut]")!.addEventListener("click", shut);
  host.querySelector<HTMLButtonElement>("[data-take]")!.addEventListener("click", () => {
    shut();
    createStory(t);
  });
}

function createStory(template?: Template) {
  compose({
    kind: "article",
    slug: "",
    path: "",
    sha: "",
    isNew: true,
    fields: {
      title: "",
      description: "",
      date: today(),
      updated: "",
      author: "Zeynep Doruk",
      category: template?.category ?? "Geopolitics",
      region: "Global",
      country: [],
      tags: [],
      type: template?.type ?? "analysis",
      featured: false,
      editorsPick: false,
      draft: true,
      heroImage: "",
      heroImageAlt: "",
      imageCaption: "",
      imageCredit: "",
      imageSource: "",
      imageDate: "",
      imageLicense: "",
      sources: [],
    },
    body: template?.body ?? "",
    standfirstHint: template?.standfirst,
  });
}

async function openStory(path: string) {
  view(booting("Opening"));
  const kind: Kind = "article";
  const slug = path.split("/").pop()!.replace(/\.mdx?$/, "");
  try {
    const file = await readFile(path);
    const parsed = parseDocument(file.content);
    const fm = parsed.frontmatter;
    const bool = (k: string) => fm[k] === "true";
    const local = localStorage.getItem(K_DRAFT + path);

    compose({
      kind,
      slug,
      path,
      sha: file.sha,
      isNew: false,
      fields: {
        title: fm.title ?? "",
        description: fm.description ?? "",
        date: (fm.date ?? today()).slice(0, 10),
        updated: (fm.updated ?? "").slice(0, 10),
        author: fm.author || "Zeynep Doruk",
        category: fm.category || "Geopolitics",
        region: fm.region || "Global",
        country: parsed.lists.country ?? [],
        tags: parsed.lists.tags ?? [],
        type: fm.type || "analysis",
        featured: bool("featured"),
        editorsPick: bool("editorsPick"),
        draft: bool("draft"),
        heroImage: fm.heroImage ?? "",
        heroImageAlt: fm.heroImageAlt ?? "",
        imageCaption: fm.imageCaption ?? "",
        imageCredit: fm.imageCredit ?? "",
        imageSource: fm.imageSource ?? "",
        imageDate: fm.imageDate ?? "",
        imageLicense: fm.imageLicense ?? "",
        sources: parsed.sources,
      },
      body: parsed.body,
      localBody: local ?? undefined,
    });
  } catch (error) {
    openStories(`Could not open ${slug}: ${(error as Error).message}`);
  }
}

// ==========================================================
// Finding a photograph
// ==========================================================

interface FiledPhoto {
  name: string;
  credit: string;
  alt: string;
  source: string;
  caption: string;
  date: string;
  license: string;
}

/**
 * A picture filed this minute is in the repository but not yet in a build, so
 * the site would serve a 404 for it. Until the next deploy, preview it from
 * where it came from.
 */
const freshPhotos = new Map<string, string>();

/**
 * Searches Wikimedia Commons, then files the chosen picture into the
 * repository so the publication serves its own copy. Resolves with the
 * filename and the credit line that has to travel with it.
 */
function findPhoto(seed: {
  query: string;
  suggest?: () => Promise<string>;
}): Promise<FiledPhoto | null> {
  return new Promise((resolve) => {
    const host = document.createElement("div");
    host.className = "ed-modal";
    host.innerHTML = `
      <div class="ed-modal-box" role="dialog" aria-label="Find a photograph">
        <div class="ed-modal-head">
          <p class="ed-legend" style="margin:0">Find a photograph</p>
          <button type="button" class="ed-btn ed-btn-quiet" data-shut>Close</button>
        </div>
        <form class="ed-photo-form" data-form>
          <input class="ed-input" data-q placeholder="What should the picture show?" value="${esc(seed.query)}" autocomplete="off" spellcheck="false" />
          ${seed.suggest ? '<button type="button" class="ed-btn" data-suggest>Ask the assistant</button>' : ""}
          <button type="submit" class="ed-btn ed-btn-primary" data-go>Search</button>
        </form>
        <p class="ed-note" data-note>Pictures come from Wikimedia Commons, and the credit is filed with them.</p>
        <div class="ed-photo-grid" data-results></div>
      </div>`;
    document.body.append(host);

    const pick = <T extends HTMLElement>(s: string) => host.querySelector<T>(s)!;
    const q = pick<HTMLInputElement>("[data-q]");
    const note = pick<HTMLElement>("[data-note]");
    const results = pick<HTMLElement>("[data-results]");
    let busy = false;

    const shut = (value: FiledPhoto | null) => {
      document.removeEventListener("keydown", onKey, true);
      host.remove();
      resolve(value);
    };
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) { event.preventDefault(); shut(null); }
    }
    document.addEventListener("keydown", onKey, true);
    host.addEventListener("mousedown", (event) => { if (event.target === host && !busy) shut(null); });
    pick<HTMLButtonElement>("[data-shut]").addEventListener("click", () => shut(null));

    const say = (text: string, state = "") => {
      note.dataset.state = state;
      note.textContent = text;
    };

    async function file(photo: Photo) {
      if (busy) return;
      busy = true;
      say(`Filing ${photo.title || photo.file}\u{2026}`);
      results.dataset.busy = "true";
      try {
        const name = slugify(photo.title || photo.file.replace(/\.\w+$/, "")).slice(0, 60) || `photo-${Date.now()}`;
        const filed = await importPhoto(photo.file, name);
        freshPhotos.set(filed.name, filed.preview);
        shut({
          name: filed.name,
          credit: photo.credit,
          alt: photo.title,
          source: photo.source,
          caption: photo.title,
          date: "",
          license: photo.licence,
        });
      } catch (error) {
        busy = false;
        results.dataset.busy = "false";
        say((error as Error).message, "error");
      }
    }

    async function run(query: string) {
      if (!query.trim() || busy) return;
      busy = true;
      say("Searching Wikimedia Commons\u{2026}");
      results.innerHTML = "";
      try {
        const { photos } = await searchPhotos(query.trim());
        if (photos.length === 0) {
          say("Nothing usable came back. Try what would be in the frame: a place, a building, an institution.");
        } else {
          say(`${photos.length} pictures. Choosing one files it into the repository.`);
          results.innerHTML = photos
            .map(
              (p, i) => `
              <button type="button" class="ed-photo" data-p="${i}">
                <img src="${esc(p.thumb)}" alt="" loading="lazy" />
                <span class="t">${esc(p.title)}</span>
                <span class="m">${esc([p.artist, p.licence].filter(Boolean).join(" \u{b7} ") || "No credit given")}</span>
              </button>`
            )
            .join("");
          results.querySelectorAll<HTMLButtonElement>("[data-p]").forEach((button) =>
            button.addEventListener("click", () => file(photos[Number(button.dataset.p)]))
          );
        }
      } catch (error) {
        say((error as Error).message, "error");
      } finally {
        busy = false;
      }
    }

    pick<HTMLFormElement>("[data-form]").addEventListener("submit", (event) => {
      event.preventDefault();
      run(q.value);
    });

    const suggestButton = host.querySelector<HTMLButtonElement>("[data-suggest]");
    suggestButton?.addEventListener("click", async () => {
      suggestButton.disabled = true;
      say("Reading the piece\u{2026}");
      try {
        q.value = (await seed.suggest!()) || q.value;
        await run(q.value);
      } catch (error) {
        say((error as Error).message, "error");
      } finally {
        suggestButton.disabled = false;
      }
    });

    q.focus();
    q.select();
    // A headline is almost never a good archive query, so only a short seed \u{2014}
    // something already shaped like a subject \u{2014} is searched unasked.
    if (seed.query.trim().split(/\s+/).length <= 5) run(seed.query);
  });
}

// ==========================================================
// A photograph from the writer's device
// ==========================================================

const DEVICE_IMAGE_LIMIT = 3_400_000;
const DEVICE_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const readDataUrl = (file: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result ?? "")));
    reader.addEventListener("error", () => reject(new Error("The picture could not be read.")));
    reader.readAsDataURL(file);
  });

const dataUrlBytes = (dataUrl: string): number => {
  const encoded = dataUrl.split(",", 2)[1] ?? "";
  const padding = encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor(encoded.length * 0.75) - padding);
};

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("The picture could not be decoded."));
    image.src = src;
  });

/** Keeps a camera original when it is small, otherwise makes a web-friendly copy. */
async function prepareDeviceImage(file: File): Promise<{ dataUrl: string; type: string }> {
  if (!DEVICE_IMAGE_TYPES.has(file.type)) throw new Error("Use a JPEG, PNG or WebP image.");
  const original = await readDataUrl(file);
  if (file.size <= DEVICE_IMAGE_LIMIT) return { dataUrl: original, type: file.type };

  const image = await loadImage(original);
  const longest = Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height);
  if (!longest) throw new Error("The picture has no usable dimensions.");

  // Large phone originals are resized in the browser before crossing the
  // serverless function's request-size limit. Photos become JPEGs; a small PNG
  // remains untouched so a writer can still use a transparent graphic.
  let edge = Math.min(longest, 2400);
  let quality = 0.84;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const scale = Math.min(1, edge / longest);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
    canvas.height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser cannot prepare the picture.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    if (dataUrlBytes(dataUrl) <= DEVICE_IMAGE_LIMIT) return { dataUrl, type: "image/jpeg" };
    edge = Math.round(edge * 0.78);
    quality *= 0.86;
  }
  throw new Error("That picture is still too large. Choose a smaller image.");
}

function pickDeviceFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/jpeg,image/png,image/webp";
    input.setAttribute("aria-label", "Choose a picture from this device");
    input.style.position = "fixed";
    input.style.left = "-9999px";
    document.body.append(input);
    const finish = (file: File | null) => {
      input.remove();
      resolve(file);
    };
    input.addEventListener("change", () => finish(input.files?.[0] ?? null), { once: true });
    input.click();
  });
}

async function fileFromDevice(): Promise<FiledPhoto | null> {
  const file = await pickDeviceFile();
  if (!file) return null;
  const { dataUrl, type } = await prepareDeviceImage(file);
  const encoded = dataUrl.split(",", 2)[1] ?? "";
  const base = slugify(file.name.replace(/\.[^.]+$/, "")).slice(0, 46) || "device-picture";
  const name = `${base}-${Date.now().toString(36)}`.slice(0, 78);
  const filed = await uploadImage(encoded, name, type);
  freshPhotos.set(filed.name, dataUrl);
  const label = file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim();
  return {
    name: filed.name,
    credit: "",
    alt: label,
    source: "",
    caption: label,
    date: "",
    license: "",
  };
}

function editImageDetails(seed: FiledPhoto): Promise<FiledPhoto | null> {
  return new Promise((resolve) => {
    const host = document.createElement("div");
    host.className = "ed-modal";
    host.innerHTML = `
      <div class="ed-modal-box ed-image-meta-modal" role="dialog" aria-label="Image details">
        <div class="ed-modal-head">
          <p class="ed-legend" style="margin:0">Image details</p>
          <button type="button" class="ed-btn ed-btn-quiet" data-shut>Close</button>
        </div>
        <p class="ed-note">Add the details that let readers identify the picture and its rights. A source or licence does not replace permission to use an image.</p>
        <form class="ed-image-meta-form" data-form>
          <div class="ed-field"><label for="image-alt">Alt text</label><input id="image-alt" class="ed-input" data-alt value="${esc(seed.alt)}" required /><p class="note">Describe what is visible, not what you want the picture to imply.</p></div>
          <div class="ed-field"><label for="image-caption">Caption</label><input id="image-caption" class="ed-input" data-caption value="${esc(seed.caption)}" placeholder="Optional caption" /></div>
          <div class="ed-field"><label for="image-credit">Creator / credit</label><input id="image-credit" class="ed-input" data-credit value="${esc(seed.credit)}" placeholder="Photographer, archive or author" /></div>
          <div class="ed-field"><label for="image-source">Source or original URL</label><input id="image-source" class="ed-input" data-source value="${esc(seed.source)}" placeholder="https://… or Author's own photograph" /></div>
          <div class="ed-field ed-pair"><div><label for="image-date">Photo date</label><input id="image-date" type="date" class="ed-input" data-date value="${esc(seed.date)}" /></div><div><label for="image-license">Rights / licence</label><input id="image-license" class="ed-input" data-license value="${esc(seed.license)}" placeholder="CC BY 4.0 / All rights reserved" /></div></div>
          <div class="ed-image-meta-actions"><button type="button" class="ed-btn" data-cancel>Cancel</button><button type="submit" class="ed-btn ed-btn-primary">Use this image</button></div>
        </form>
      </div>`;
    document.body.append(host);

    const pick = <T extends HTMLElement>(selector: string) => host.querySelector<T>(selector)!;
    let settled = false;
    const shut = (value: FiledPhoto | null) => {
      if (settled) return;
      settled = true;
      document.removeEventListener("keydown", onKey, true);
      host.remove();
      resolve(value);
    };
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); shut(null); }
    }
    document.addEventListener("keydown", onKey, true);
    host.addEventListener("mousedown", (event) => { if (event.target === host) shut(null); });
    pick<HTMLButtonElement>("[data-shut]").addEventListener("click", () => shut(null));
    pick<HTMLButtonElement>("[data-cancel]").addEventListener("click", () => shut(null));
    pick<HTMLFormElement>("[data-form]").addEventListener("submit", (event) => {
      event.preventDefault();
      const alt = pick<HTMLInputElement>("[data-alt]").value.trim();
      if (!alt) {
        pick<HTMLInputElement>("[data-alt]").focus();
        return;
      }
      shut({
        ...seed,
        alt,
        caption: pick<HTMLInputElement>("[data-caption]").value.trim(),
        credit: pick<HTMLInputElement>("[data-credit]").value.trim(),
        source: pick<HTMLInputElement>("[data-source]").value.trim(),
        date: pick<HTMLInputElement>("[data-date]").value,
        license: pick<HTMLInputElement>("[data-license]").value.trim(),
      });
    });
    pick<HTMLInputElement>("[data-alt]").focus();
  });
}

// ==========================================================
// The desk
// ==========================================================

interface ComposeArgs {
  kind: Kind;
  slug: string;
  path: string;
  sha: string;
  isNew: boolean;
  fields: ArticleFields;
  body: string;
  localBody?: string;
  /** A template's suggested standfirst, shown as a prompt until something is typed. */
  standfirstHint?: string;
}

function compose(args: ComposeArgs) {
  const { kind } = args;
  let slug = args.slug;
  let path = args.path;
  const f = args.fields;
  let sha = args.sha;
  let isNew = args.isNew;

  /** New pieces have no path yet, so their local draft needs its own key. */
  const draftKey = () => K_DRAFT + (path || `new:${kind}`);

  // The content stores a bare filename, exactly as heroImageOf expects. Storing
  // anything else means the select never matches and Publish wipes the picture.
  const inArticles = (name: string) =>
    name.startsWith("http") || name.startsWith("/") ? name : `/images/articles/${name}`;
  const heroSrc = (p: string) =>
    p ? freshPhotos.get(p) ?? (p.startsWith("http") ? p : BASE + inArticles(p)) : "";

  view(`
    <div class="ed-bar">
      <div class="ed-bar-left">
        <button type="button" class="ed-btn ed-btn-quiet" data-back>&larr; Stories</button>
        <span class="ed-bar-meta" data-status></span>
      </div>
      <div class="ed-bar-right">
        <span class="ed-bar-meta" data-count></span>
        ${aiReady() ? '<button type="button" class="ed-btn ed-btn-quiet ed-float-ai" data-bar-ask title="Ask the assistant  Ctrl+J">Ask</button>' : ""}
        <button type="button" class="ed-btn ed-btn-primary" data-publish>Publish</button>
      </div>
    </div>

    ${args.localBody ? `<div style="max-width:46rem;margin:1rem auto 0;padding:0 1.25rem"><div class="ed-warn" style="display:flex;gap:.6rem;align-items:center;flex-wrap:wrap">
      <span>Unsaved changes from this browser.</span>
      <button type="button" class="ed-btn" data-restore>Restore</button>
      <button type="button" class="ed-btn ed-btn-quiet" data-drop>Ignore</button></div></div>` : ""}

    <div class="ed-page">
      <div class="ed-cover ${f.heroImage ? "has-image" : ""}" data-cover>
        ${f.heroImage
          ? `<img src="${esc(heroSrc(f.heroImage))}" alt="" /><button type="button" class="ed-btn ed-cover-swap" data-cover-swap>Change</button>`
          : '<span class="ed-cover-hint">+ Lead image</span>'}
      </div>

      <h1 class="ed-title" contenteditable="true" data-title data-placeholder="Headline">${esc(f.title)}</h1>
      <p class="ed-standfirst" contenteditable="true" data-standfirst data-placeholder="${esc(args.standfirstHint ?? "One line on what this argues, and why now")}">${esc(f.description)}</p>

      <div class="ed-body" contenteditable="true" data-body spellcheck="true"></div>
    </div>

    <button type="button" class="ed-add" data-add title="Insert (or type /)">+</button>

    <div class="ed-float" data-float data-scope="body">
      <button type="button" data-cmd="bold" title="Bold  Ctrl+B"><strong>B</strong></button>
      <button type="button" data-cmd="italic" title="Italic  Ctrl+I"><em>I</em></button>
      <button type="button" data-cmd="link" title="Link  Ctrl+K">Link</button>
      <span class="sep block-only"></span>
      <button type="button" class="block-only" data-cmd="h2" title="Heading">H2</button>
      <button type="button" class="block-only" data-cmd="h3" title="Sub-heading">H3</button>
      <button type="button" class="block-only" data-cmd="quote" title="Quote">&ldquo;</button>
      <span class="sep"></span>
      <button type="button" data-cmd="clear" title="Plain text">Clear</button>
      ${aiReady() ? '<span class="sep"></span><button type="button" class="ed-float-ai" data-cmd="ask" title="Tell the assistant what to do  Ctrl+J">Ask</button>' : ""}
    </div>

    <div class="ed-float" data-linkbar>
      <input type="url" data-linkinput placeholder="https://\u{2026}  then Enter" />
      <button type="button" data-linkgo>Apply</button>
      <button type="button" data-linkoff title="Remove link">&times;</button>
    </div>

    <div class="ed-menu" data-menu></div>

    <div class="ed-scrim" data-scrim></div>
    <aside class="ed-drawer" data-drawer aria-label="Publish settings">
      <div class="ed-drawer-head">
        <div>
          <p class="ed-legend" style="margin:0">Publish</p>
          <p class="ed-note" data-slugline>${esc(kind)} \u{b7} ${esc(slug || "new")}</p>
        </div>
        <button type="button" class="ed-btn ed-btn-quiet" data-drawer-close>Close</button>
      </div>
      <div class="ed-drawer-body">
        <label class="ed-switch">
          <input type="checkbox" data-live ${f.draft ? "" : "checked"} />
          <span><span class="t">Visible on the site</span>
            <span class="d">Off keeps it as a private draft.</span></span>
        </label>

        ${aiReady() ? '<button type="button" class="ed-btn" style="width:100%;justify-content:center;margin-top:1rem" data-fill>Ask ' + esc(state.model) + ' to fill this in</button>' : ""}
        <p class="ed-note" data-fill-note style="margin-top:.5rem"></p>

        <div class="ed-field" style="margin-top:1.2rem">
          <label class="ed-legend">Lead image</label>
          <select class="ed-select" data-hero>
            <option value="">None</option>
            ${state.images.map((i) => `<option value="${esc(i)}" ${i === f.heroImage ? "selected" : ""}>${esc(i)}</option>`).join("")}
          </select>
          <div class="ed-image-actions">
            <button type="button" class="ed-btn" data-hero-find>Search the web</button>
            <button type="button" class="ed-btn" data-hero-device>From this device</button>
          </div>
          <p class="note">JPEG, PNG or WebP · up to 4 MB after preparation. On a phone this opens your gallery or camera picker.</p>
        </div>
        <div class="ed-field">
          <label for="alt">Alt text · what the image shows</label>
          <input id="alt" class="ed-input" data-alt value="${esc(f.heroImageAlt)}" />
          <p class="note">Read aloud to people who cannot see it.</p>
        </div>
        <div class="ed-field">
          <label for="image-caption">Caption</label>
          <input id="image-caption" class="ed-input" data-caption value="${esc(f.imageCaption)}" placeholder="Optional caption" />
        </div>
        <div class="ed-field">
          <label for="credit">Creator / image credit</label>
          <input id="credit" class="ed-input" data-credit value="${esc(f.imageCredit)}" />
        </div>
        <div class="ed-field">
          <label for="image-source">Source or original URL</label>
          <input id="image-source" class="ed-input" data-source value="${esc(f.imageSource)}" placeholder="https://… or Author's own photograph" />
        </div>
        <div class="ed-field ed-pair">
          <div><label for="image-date">Photo date</label><input id="image-date" type="date" class="ed-input" data-image-date value="${esc(f.imageDate)}" /></div>
          <div><label for="image-license">Rights / licence</label><input id="image-license" class="ed-input" data-license value="${esc(f.imageLicense)}" placeholder="CC BY 4.0 / All rights reserved" /></div>
        </div>
        <p class="ed-image-rights-note">Keep the original source and licence with every image. This makes attribution visible and gives readers a path to verify it.</p>

        ${kind === "article" ? `
        <div class="ed-field ed-pair" style="margin-top:1.4rem">
          <div><label for="desk">Desk</label>
            <select id="desk" class="ed-select" data-desk>${DESKS.map((d) => `<option ${d === f.category ? "selected" : ""}>${d}</option>`).join("")}</select></div>
          <div><label for="region">Region</label>
            <select id="region" class="ed-select" data-region>${REGIONS.map((r) => `<option ${r === f.region ? "selected" : ""}>${r}</option>`).join("")}</select></div>
        </div>
        <div class="ed-field ed-pair">
          <div><label for="type">Kind</label>
            <select id="type" class="ed-select" data-type>${TYPES.map((t) => `<option ${t === f.type ? "selected" : ""}>${t}</option>`).join("")}</select></div>
          <div><label for="date">Date</label>
            <input id="date" type="date" class="ed-input" data-date value="${esc(f.date)}" /></div>
        </div>
        <div class="ed-field">
          <label for="countries">Countries</label>
          <input id="countries" class="ed-input" data-countries value="${esc(f.country.join(", "))}" placeholder="Germany, Poland" />
        </div>` : `
        <div class="ed-field" style="margin-top:1.4rem">
          <label for="date">Date</label>
          <input id="date" type="date" class="ed-input" data-date value="${esc(f.date)}" />
        </div>`}

        <div class="ed-field">
          <label for="tags">Tags</label>
          <input id="tags" class="ed-input" data-tags value="${esc(f.tags.join(", "))}" placeholder="NATO, Deterrence" />
        </div>
        <div class="ed-field">
          <label for="sources">Sources</label>
          <textarea id="sources" rows="3" class="ed-input" data-sources placeholder="NATO | https://nato.int">${esc(f.sources.map((s) => `${s.name} | ${s.url}`).join("\n"))}</textarea>
          <p class="note">One per line, name then link.</p>
        </div>

        ${kind === "article" ? `
        <div class="ed-field">
          <label class="ed-legend">Promotion</label>
          <label class="ed-switch" style="margin-bottom:.5rem"><input type="checkbox" data-featured ${f.featured ? "checked" : ""} />
            <span><span class="t">Lead Journal</span></span></label>
          <label class="ed-switch"><input type="checkbox" data-pick ${f.editorsPick ? "checked" : ""} />
            <span><span class="t">Editor's pick</span></span></label>
        </div>` : ""}
      </div>
      <div class="ed-drawer-foot">
        <p class="ed-note" data-publish-note></p>
        <button type="button" class="ed-btn ed-btn-primary" style="justify-content:center" data-save>${isNew ? "Create" : "Publish"}</button>
      </div>
    </aside>
  `);

  // ---------- handles ----------
  const titleEl = el<HTMLElement>("[data-title]");
  const standEl = el<HTMLElement>("[data-standfirst]");
  const bodyEl = el<HTMLElement>("[data-body]");
  const statusEl = el<HTMLElement>("[data-status]");
  const countEl = el<HTMLElement>("[data-count]");
  const floatEl = el<HTMLElement>("[data-float]");
  const linkbar = el<HTMLElement>("[data-linkbar]");
  const linkInput = el<HTMLInputElement>("[data-linkinput]");
  const menuEl = el<HTMLElement>("[data-menu]");
  const addBtn = el<HTMLButtonElement>("[data-add]");
  const drawer = el<HTMLElement>("[data-drawer]");
  const scrim = el<HTMLElement>("[data-scrim]");

  bodyEl.innerHTML = markdownToHtml(args.localBody ?? args.body);
  if (!bodyEl.firstElementChild) bodyEl.innerHTML = "<p><br></p>";
  ensureTrailingParagraph();

  // Clicking the empty space under the article puts the caret at the end,
  // the way a word processor does.
  const caretToEnd = (event: MouseEvent) => {
    event.preventDefault();
    const p = ensureTrailingParagraph();
    placeCaret(p, true);
  };
  el<HTMLElement>(".ed-page").addEventListener("mousedown", (event) => {
    if (event.target !== event.currentTarget) return;
    caretToEnd(event);
  });
  bodyEl.addEventListener("mousedown", (event) => {
    if (event.target !== bodyEl) return;
    const last = bodyEl.lastElementChild;
    if (last && event.clientY <= last.getBoundingClientRect().bottom) return;
    caretToEnd(event);
  });

  const setStatus = (text: string, tone: "ok" | "error" | "" = "") => {
    statusEl.dataset.state = tone;
    statusEl.textContent = text;
  };

  const recount = () => {
    const words = countWords(canvasText(bodyEl));
    countEl.textContent = `${words} words \u{b7} ${readingMinutes(words)} min`;
  };

  const stash = debounce(() => {
    try {
      localStorage.setItem(draftKey(), htmlToMarkdown(bodyEl));
      setStatus("Saved on this device");
    } catch { /* quota */ }
  }, 800);

  const touched = () => { ensureTrailingParagraph(); recount(); stash(); };

  // ---------- paste as plain text ----------
  for (const surface of [titleEl, standEl, bodyEl]) {
    surface.addEventListener("paste", (event) => {
      event.preventDefault();
      const text = event.clipboardData?.getData("text/plain") ?? "";
      if (!text) return;
      if (surface === bodyEl && /\n\s*\n/.test(text)) {
        // Multi-paragraph paste rebuilds blocks rather than one long line.
        document.execCommand("insertHTML", false, markdownToHtml(text));
      } else {
        document.execCommand("insertText", false, text.replace(/\s+/g, " "));
      }
      touched();
    });
  }

  // Headline and standfirst are single paragraphs.
  for (const oneLine of [titleEl, standEl]) {
    oneLine.addEventListener("keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "j") {
        event.preventDefault();
        openAsk();
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        (oneLine === titleEl ? standEl : bodyEl).focus();
      }
    });
    oneLine.addEventListener("input", touched);
  }

  // ==========================================================
  // Body editing
  // ==========================================================

  /** The block the caret sits in, whether that is in the body or inside a callout. */
  const currentBlock = (): HTMLElement | null => {
    const sel = window.getSelection();
    if (!sel || !sel.anchorNode) return null;
    let node: Node | null = sel.anchorNode;
    while (node) {
      const holder: HTMLElement | null = (node as HTMLElement).parentElement;
      if (!holder) return null;
      if (holder === bodyEl || holder.classList?.contains("ed-callout-body")) {
        return node as HTMLElement;
      }
      node = holder;
    }
    return null;
  };

  /**
   * There must always be a plain paragraph at the end, otherwise a story that
   * finishes on a list, a quote, a heading or a callout leaves the writer with
   * nowhere to type.
   */
  function ensureTrailingParagraph() {
    const last = bodyEl.lastElementChild;
    if (!last || last.tagName !== "P") {
      const p = document.createElement("p");
      p.innerHTML = "<br>";
      bodyEl.append(p);
      return p;
    }
    return last as HTMLElement;
  }

  const replaceBlock = (block: HTMLElement, tag: string, keepText = true) => {
    const next = document.createElement(tag);
    if (keepText) next.innerHTML = block.innerHTML || "<br>";
    else next.innerHTML = "<br>";
    block.replaceWith(next);
    placeCaret(next, true);
    return next;
  };

  function placeCaret(node: HTMLElement, atEnd = false) {
    const range = document.createRange();
    range.selectNodeContents(node);
    range.collapse(!atEnd);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    node.focus?.();
  }

  // ---------- markdown-style input rules ----------
  const INPUT_RULES: [RegExp, (block: HTMLElement) => void][] = [
    [/^#\s$/, (b) => replaceBlock(b, "h2", false)],
    [/^##\s$/, (b) => replaceBlock(b, "h2", false)],
    [/^###\s$/, (b) => replaceBlock(b, "h3", false)],
    [/^>\s$/, (b) => { const q = document.createElement("blockquote"); q.innerHTML = "<p><br></p>"; b.replaceWith(q); placeCaret(q.firstElementChild as HTMLElement); }],
    [/^[-*]\s$/, (b) => makeList(b, "ul")],
    [/^1[.)]\s$/, (b) => makeList(b, "ol")],
    [/^---$/, (b) => insertBlock(b, hrBlock())],
  ];

  function makeList(block: HTMLElement, tag: "ul" | "ol") {
    const list = document.createElement(tag);
    const li = document.createElement("li");
    li.innerHTML = "<br>";
    list.append(li);
    block.replaceWith(list);
    placeCaret(li);
  }

  const hrBlock = () => {
    const hr = document.createElement("hr");
    hr.setAttribute("contenteditable", "false");
    return hr;
  };

  function insertBlock(after: HTMLElement, node: HTMLElement) {
    after.replaceWith(node);
    const p = document.createElement("p");
    p.innerHTML = "<br>";
    node.after(p);
    placeCaret(p);
  }

  bodyEl.addEventListener("input", () => {
    const block = currentBlock();
    // Browsers hand back a <div> after Enter; treat it as an ordinary paragraph.
    if (block && (block.tagName === "P" || block.tagName === "DIV")) {
      const text = block.textContent ?? "";
      for (const [pattern, apply] of INPUT_RULES) {
        if (pattern.test(text)) {
          apply(block);
          touched();
          return;
        }
      }
    }
    clearGhost();
    touched();
    scheduleSuggestion();
  });

  /**
   * Enter is handled by hand so every new block is a <p>. Left to the browser
   * it produces <div>s, which breaks both the markdown shortcuts and the
   * published typography.
   */
  function splitBlock(block: HTMLElement) {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const caret = sel.getRangeAt(0);

    const tailRange = document.createRange();
    tailRange.selectNodeContents(block);
    tailRange.setStart(caret.endContainer, caret.endOffset);
    const tail = tailRange.extractContents();

    const next = document.createElement("p");
    if ((tail.textContent ?? "").trim() || tail.querySelector("*")) next.append(tail);
    else next.innerHTML = "<br>";

    if (!(block.textContent ?? "").trim()) block.innerHTML = "<br>";
    block.after(next);
    placeCaret(next);
  }

  bodyEl.addEventListener("keydown", (event) => {
    // Accept the inline suggestion.
    if (event.key === "Tab" && ghostNode) {
      event.preventDefault();
      acceptGhost();
      return;
    }
    if (event.key === "Escape" && ghostNode) {
      event.preventDefault();
      clearGhost();
      return;
    }
    if (ghostNode) clearGhost();

    if ((event.ctrlKey || event.metaKey) && !event.shiftKey) {
      const key = event.key.toLowerCase();
      if (key === "b") { event.preventDefault(); runCommand("bold"); return; }
      if (key === "i") { event.preventDefault(); runCommand("italic"); return; }
      if (key === "k") { event.preventDefault(); openLinkBar(); return; }
      if (key === "j") { event.preventDefault(); openAsk(); return; }
      if (key === " ") { event.preventDefault(); requestSuggestion(true); return; }
      if (key === "s") { event.preventDefault(); openDrawer(); return; }
    }

    if (event.key === "/" ) {
      const block = currentBlock();
      if (block && !block.textContent?.trim()) {
        // Let the character land, then offer the menu.
        window.setTimeout(() => openMenu(block), 0);
      }
    }

    if (event.key === "Enter" && !event.shiftKey) {
      const block = currentBlock();
      if (!block) return;
      // Lists and quotes behave correctly on their own.
      if (["UL", "OL", "BLOCKQUOTE", "FIGURE", "HR"].includes(block.tagName) || block.dataset.callout) {
        if (block.tagName === "BLOCKQUOTE" && !block.textContent?.trim()) {
          event.preventDefault();
          replaceBlock(block, "p", false);
        }
        return;
      }
      event.preventDefault();
      splitBlock(block);
      touched();
      return;
    }
    if (event.key === "Backspace") {
      const block = currentBlock();
      if (block && block.previousElementSibling?.tagName === "HR" && !block.textContent?.trim()) {
        event.preventDefault();
        block.previousElementSibling.remove();
      }
    }
  });

  // ---------- inline formatting ----------
  function runCommand(cmd: string) {
    const block = currentBlock();
    switch (cmd) {
      case "bold":
      case "italic":
        document.execCommand(cmd);
        break;
      case "h2":
      case "h3": {
        if (!block) break;
        const tag = cmd.toUpperCase();
        replaceBlock(block, block.tagName === tag ? "p" : cmd);
        break;
      }
      case "quote": {
        if (!block) break;
        if (block.tagName === "BLOCKQUOTE") replaceBlock(block, "p");
        else {
          const quote = document.createElement("blockquote");
          const p = document.createElement("p");
          p.innerHTML = block.innerHTML || "<br>";
          quote.append(p);
          block.replaceWith(quote);
          placeCaret(p, true);
        }
        break;
      }
      case "clear":
        document.execCommand("removeFormat");
        document.execCommand("unlink");
        break;
      case "link":
        openLinkBar();
        return;
      case "ask":
        openAsk();
        return;
    }
    hideFloat();
    touched();
  }

  root.querySelectorAll<HTMLButtonElement>("[data-cmd]").forEach((button) =>
    button.addEventListener("mousedown", (event) => {
      event.preventDefault();
      runCommand(button.dataset.cmd!);
    })
  );

  // ---------- selection toolbar ----------
  let savedRange: Range | null = null;

  const showFloat = (bar: HTMLElement, rect: DOMRect) => {
    bar.classList.add("is-open");
    const top = window.scrollY + rect.top - bar.offsetHeight - 8;
    const left = window.scrollX + rect.left + rect.width / 2 - bar.offsetWidth / 2;
    bar.style.top = `${Math.max(window.scrollY + 8, top)}px`;
    bar.style.left = `${Math.max(8, left)}px`;
  };

  const hideFloat = () => {
    floatEl.classList.remove("is-open");
    linkbar.classList.remove("is-open");
  };

  const syncFloatState = () => {
    floatEl.querySelector<HTMLElement>('[data-cmd="bold"]')?.setAttribute(
      "aria-pressed", String(document.queryCommandState("bold"))
    );
    floatEl.querySelector<HTMLElement>('[data-cmd="italic"]')?.setAttribute(
      "aria-pressed", String(document.queryCommandState("italic"))
    );
  };

  document.addEventListener("selectionchange", () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) {
      if (!linkbar.classList.contains("is-open")) hideFloat();
      return;
    }
    const range = sel.getRangeAt(0);
    const node = range.commonAncestorContainer;
    const inBody = bodyEl.contains(node);
    // The headline and standfirst can be rewritten too, but they are single
    // lines: headings, quotes and lists do not apply to them.
    if (!inBody && !titleEl.contains(node) && !standEl.contains(node)) return;
    floatEl.dataset.scope = inBody ? "body" : "line";
    savedRange = range.cloneRange();
    showFloat(floatEl, range.getBoundingClientRect());
    syncFloatState();
  });

  function openLinkBar() {
    const sel = window.getSelection();
    if (sel && sel.rangeCount && !sel.isCollapsed) savedRange = sel.getRangeAt(0).cloneRange();
    if (!savedRange) return;
    floatEl.classList.remove("is-open");
    showFloat(linkbar, savedRange.getBoundingClientRect());
    const anchor = savedRange.startContainer.parentElement?.closest("a");
    linkInput.value = anchor?.getAttribute("href") ?? "";
    linkInput.focus();
    linkInput.select();
  }

  const applyLink = () => {
    const href = linkInput.value.trim();
    if (!savedRange) return;
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(savedRange);
    if (href) document.execCommand("createLink", false, href);
    else document.execCommand("unlink");
    hideFloat();
    touched();
  };

  el<HTMLButtonElement>("[data-linkgo]").addEventListener("mousedown", (e) => { e.preventDefault(); applyLink(); });
  el<HTMLButtonElement>("[data-linkoff]").addEventListener("mousedown", (e) => {
    e.preventDefault();
    linkInput.value = "";
    applyLink();
  });
  linkInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") { event.preventDefault(); applyLink(); }
    if (event.key === "Escape") { hideFloat(); bodyEl.focus(); }
  });

  // ---------- insert menu ----------
  interface MenuItem { name: string; hint: string; run: (block: HTMLElement) => void; }

  const MENU: MenuItem[] = [
    { name: "Heading", hint: "##", run: (b) => replaceBlock(b, "h2", false) },
    { name: "Sub-heading", hint: "###", run: (b) => replaceBlock(b, "h3", false) },
    { name: "Bulleted list", hint: "-", run: (b) => makeList(b, "ul") },
    { name: "Numbered list", hint: "1.", run: (b) => makeList(b, "ol") },
    { name: "Quote", hint: ">", run: (b) => { const q = document.createElement("blockquote"); q.innerHTML = "<p><br></p>"; b.replaceWith(q); placeCaret(q.firstElementChild as HTMLElement); } },
    { name: "Divider", hint: "---", run: (b) => insertBlock(b, hrBlock()) },
    { name: "Image", hint: "", run: (b) => pickImage(b) },
    { name: "Picture from this device", hint: "upload", run: (b) => { void deviceImage(b); } },
    { name: "Photograph from the web", hint: "search", run: (b) => webImage(b) },
    ...(Object.keys(CALLOUTS) as CalloutName[]).map((key) => ({
      name: CALLOUTS[key],
      hint: "box",
      run: (b: HTMLElement) => insertCallout(b, key),
    })),
  ];

  let menuBlock: HTMLElement | null = null;
  let menuIndex = 0;
  let menuFiltered = MENU;

  function openMenu(block: HTMLElement) {
    menuBlock = block;
    menuIndex = 0;
    renderMenu("");
    const rect = block.getBoundingClientRect();
    menuEl.classList.add("is-open");
    menuEl.style.top = `${window.scrollY + rect.bottom + 6}px`;
    menuEl.style.left = `${window.scrollX + rect.left}px`;
  }

  function renderMenu(query: string) {
    menuFiltered = MENU.filter((m) => m.name.toLowerCase().includes(query.toLowerCase()));
    menuEl.innerHTML =
      '<p class="ed-menu-head">Insert</p>' +
      (menuFiltered.length
        ? menuFiltered
            .map((m, i) => `<button type="button" data-mi="${i}" class="${i === menuIndex ? "is-active" : ""}"><span class="name">${esc(m.name)}</span><span class="hint">${esc(m.hint)}</span></button>`)
            .join("")
        : '<p class="ed-menu-head" style="border:0">Nothing matches</p>');
    menuEl.querySelectorAll<HTMLButtonElement>("[data-mi]").forEach((button) =>
      button.addEventListener("mousedown", (event) => {
        event.preventDefault();
        chooseMenu(Number(button.dataset.mi));
      })
    );
  }

  function closeMenu() {
    menuEl.classList.remove("is-open");
    menuBlock = null;
  }

  /** Dismisses a popup on the next click outside it, and only that once. */
  function dismissOnClickAway(close: () => void) {
    const away = (event: MouseEvent) => {
      if (menuEl.contains(event.target as Node)) return;
      document.removeEventListener("mousedown", away, true);
      close();
    };
    window.setTimeout(() => document.addEventListener("mousedown", away, true), 0);
  }

  function chooseMenu(index: number) {
    const item = menuFiltered[index];
    if (!item || !menuBlock) return closeMenu();
    const block = menuBlock;
    block.textContent = "";
    closeMenu();
    item.run(block);
    touched();
  }

  document.addEventListener("keydown", (event) => {
    // Only the slash menu drives itself from the keyboard; the ask box and the
    // pickers share this element and must keep their own keystrokes.
    if (!menuBlock || !menuEl.classList.contains("is-open")) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      menuIndex = Math.min(Math.max(menuIndex + (event.key === "ArrowDown" ? 1 : -1), 0), menuFiltered.length - 1);
      renderMenu((menuBlock?.textContent ?? "").replace(/^\//, ""));
    } else if (event.key === "Enter") {
      event.preventDefault();
      chooseMenu(menuIndex);
    } else if (event.key === "Escape") {
      closeMenu();
    } else {
      window.setTimeout(() => {
        const text = menuBlock?.textContent ?? "";
        if (!text.startsWith("/")) return closeMenu();
        menuIndex = 0;
        renderMenu(text.slice(1));
      }, 0);
    }
  });

  addBtn.addEventListener("mousedown", (event) => {
    event.preventDefault();
    const block = currentBlock();
    if (block) openMenu(block);
  });

  // Show the + handle beside an empty paragraph.
  const positionAdd = () => {
    const block = currentBlock();
    if (!block || block.tagName !== "P" || block.textContent?.trim()) {
      addBtn.classList.remove("is-open");
      return;
    }
    const rect = block.getBoundingClientRect();
    addBtn.classList.add("is-open");
    addBtn.style.top = `${window.scrollY + rect.top}px`;
    addBtn.style.left = `${window.scrollX + rect.left - 42}px`;
  };
  bodyEl.addEventListener("click", positionAdd);
  bodyEl.addEventListener("keyup", positionAdd);
  bodyEl.addEventListener("blur", () => window.setTimeout(() => addBtn.classList.remove("is-open"), 150));

  function insertCallout(block: HTMLElement, name: CalloutName) {
    const aside = document.createElement("aside");
    aside.className = "ed-callout";
    aside.dataset.callout = name;
    aside.setAttribute("contenteditable", "false");
    const label = document.createElement("span");
    label.className = "ed-callout-label";
    label.textContent = CALLOUTS[name];
    const body = document.createElement("div");
    body.className = "ed-callout-body";
    body.setAttribute("contenteditable", "true");
    body.innerHTML = name === "KeyTakeaways" ? "<ul><li><br></li></ul>" : "<p><br></p>";
    aside.append(label, body);
    insertBlock(block, aside);
    placeCaret((body.querySelector("li") ?? body.firstElementChild) as HTMLElement);
  }

  /**
   * A small popup that offers a list of choices and resolves with the index
   * that was picked, or -1 if the writer clicked away.
   */
  function chooseFrom(head: string, rows: string[], anchor: DOMRect | null, width = "17rem") {
    return new Promise<number>((resolve) => {
      menuEl.innerHTML =
        `<p class="ed-menu-head">${esc(head)}</p>` +
        rows.map((row, i) => `<button type="button" class="ed-pick" data-pick="${i}">${row}</button>`).join("");
      menuEl.style.width = width;
      menuEl.classList.add("is-open");
      menuEl.style.top = `${window.scrollY + (anchor ? anchor.bottom + 6 : 90)}px`;
      menuEl.style.left = `${window.scrollX + (anchor ? anchor.left : Math.max(12, (window.innerWidth - 360) / 2))}px`;

      let settled = false;
      const finish = (value: number) => {
        if (settled) return;
        settled = true;
        menuEl.classList.remove("is-open");
        menuEl.style.width = "";
        document.removeEventListener("mousedown", away, true);
        document.removeEventListener("keydown", key, true);
        resolve(value);
      };
      const away = (event: MouseEvent) => {
        if (!menuEl.contains(event.target as Node)) finish(-1);
      };
      const key = (event: KeyboardEvent) => {
        if (event.key === "Escape") { event.preventDefault(); finish(-1); }
      };
      menuEl.querySelectorAll<HTMLButtonElement>("[data-pick]").forEach((button) =>
        button.addEventListener("mousedown", (event) => {
          event.preventDefault();
          finish(Number(button.dataset.pick));
        })
      );
      window.setTimeout(() => {
        document.addEventListener("mousedown", away, true);
        document.addEventListener("keydown", key, true);
      }, 0);
    });
  }

  const figureMetaText = (photo: FiledPhoto): string =>
    [
      photo.credit ? `Credit: ${photo.credit}` : "",
      photo.source ? `Source: ${photo.source}` : "",
      photo.date ? `Photo date: ${photo.date}` : "",
      photo.license ? `Licence: ${photo.license}` : "",
    ]
      .filter(Boolean)
      .join(" · ");

  const updateFigureDetails = (figure: HTMLElement, photo: FiledPhoto) => {
    figure.dataset.credit = photo.credit;
    figure.dataset.source = photo.source;
    figure.dataset.date = photo.date;
    figure.dataset.license = photo.license;
    const image = figure.querySelector<HTMLImageElement>("img");
    if (image) image.alt = photo.alt;
    const caption = figure.querySelector<HTMLElement>("figcaption");
    if (caption) caption.textContent = photo.caption;
    const label = figure.querySelector<HTMLElement>(".ed-figure-meta span");
    if (label) label.textContent = figureMetaText(photo);
    const details = figure.querySelector<HTMLElement>(".ed-figure-meta");
    if (details) details.hidden = !figureMetaText(photo);
  };

  function placeFigure(block: HTMLElement, photo: FiledPhoto) {
    const figure = document.createElement("figure");
    figure.className = "ed-figure";
    figure.dataset.image = "";
    figure.setAttribute("contenteditable", "false");
    figure.innerHTML =
      `<img src="${esc(freshPhotos.get(photo.name) ?? BASE + inArticles(photo.name))}" data-src="${esc(inArticles(photo.name))}" alt="${esc(photo.alt)}" />` +
      `<figcaption contenteditable="true" data-placeholder="Caption">${esc(photo.caption)}</figcaption>` +
      `<div class="ed-figure-meta" contenteditable="false" ${figureMetaText(photo) ? "" : "hidden"}><span>${esc(figureMetaText(photo))}</span><button type="button" class="ed-figure-edit" data-image-edit>Edit image details</button></div>`;
    updateFigureDetails(figure, photo);
    figure.querySelector<HTMLButtonElement>("[data-image-edit]")?.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const current: FiledPhoto = {
        ...photo,
        alt: figure.querySelector<HTMLImageElement>("img")?.alt ?? photo.alt,
        caption: figure.querySelector("figcaption")?.textContent?.trim() ?? photo.caption,
        credit: figure.dataset.credit ?? "",
        source: figure.dataset.source ?? "",
        date: figure.dataset.date ?? "",
        license: figure.dataset.license ?? "",
      };
      const updated = await editImageDetails(current);
      if (updated) {
        updateFigureDetails(figure, updated);
        touched();
      }
    });
    insertBlock(block, figure);
    placeCaret(figure.querySelector("figcaption") as HTMLElement);
    touched();
  }

  // Figures loaded from an existing MDX file get the same metadata editor as
  // newly inserted ones. A delegated handler also keeps the DOM resilient when
  // the assistant replaces a block of the canvas.
  bodyEl.addEventListener("click", async (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-image-edit]");
    if (!button || !bodyEl.contains(button)) return;
    event.preventDefault();
    event.stopPropagation();
    const figure = button.closest<HTMLElement>("figure");
    if (!figure) return;
    const current: FiledPhoto = {
      name: figure.querySelector<HTMLImageElement>("img")?.getAttribute("data-src")?.split("/").pop() ?? "",
      alt: figure.querySelector<HTMLImageElement>("img")?.alt ?? "",
      caption: figure.querySelector("figcaption")?.textContent?.trim() ?? "",
      credit: figure.dataset.credit ?? "",
      source: figure.dataset.source ?? "",
      date: figure.dataset.date ?? "",
      license: figure.dataset.license ?? "",
    };
    const updated = await editImageDetails(current);
    if (updated) {
      updateFigureDetails(figure, updated);
      touched();
    }
  });

  async function webImage(block: HTMLElement) {
    const filed = await findPhoto({
      query: (block.textContent ?? "").replace(/^\//, "").trim() || (titleEl.textContent ?? "").trim(),
      suggest: aiReady()
        ? () =>
            suggestPhotoQuery(state.ai, {
              title: titleEl.textContent ?? "",
              description: standEl.textContent ?? "",
              draft: htmlToMarkdown(bodyEl),
            })
        : undefined,
    });
    if (!filed) return;
    if (!state.images.includes(filed.name)) state.images.push(filed.name);
    const detailed = await editImageDetails(filed);
    if (detailed) placeFigure(block, detailed);
  }

  async function deviceImage(block: HTMLElement) {
    setStatus("Uploading the picture…");
    try {
      const filed = await fileFromDevice();
      if (!filed) return;
      if (!state.images.includes(filed.name)) state.images.push(filed.name);
      const detailed = await editImageDetails(filed);
      if (detailed) placeFigure(block, detailed);
      setStatus("Picture added with its attribution details", "ok");
    } catch (error) {
      setStatus((error as Error).message, "error");
    }
  }

  async function pickImage(block: HTMLElement) {
    if (state.images.length === 0) {
      setStatus("Nothing in the library yet \u{2014} try a photograph from the web.", "error");
      return;
    }
    const index = await chooseFrom(
      "Choose an image",
      state.images.map(
        (name) =>
          `<img src="${esc(BASE + inArticles(name))}" alt="" loading="lazy" /><span class="name">${esc(name)}</span>`
      ),
      block.getBoundingClientRect(),
      "20rem"
    );
    const name = state.images[index];
    if (!name) return;
    const detailed = await editImageDetails({
      name,
      credit: "",
      alt: "",
      source: "",
      caption: "",
      date: "",
      license: "",
    });
    if (detailed) placeFigure(block, detailed);
  }

  // ==========================================================
  // The assistant
  // ==========================================================

  let ghostNode: HTMLElement | null = null;
  let inflight: AbortController | null = null;

  function clearGhost() {
    ghostNode?.remove();
    ghostNode = null;
  }

  function acceptGhost() {
    if (!ghostNode) return;
    const text = ghostNode.textContent ?? "";
    const block = ghostNode.parentElement;
    clearGhost();
    if (block) {
      placeCaret(block, true);
      document.execCommand("insertText", false, text);
    }
    touched();
  }

  async function requestSuggestion(force = false) {
    if (!aiReady()) return;
    // Never chase a suggestion while one is already on screen.
    if (ghostNode && !force) return;
    const block = currentBlock();
    if (!block || block.tagName !== "P") return;
    clearGhost();
    const text = block.textContent ?? "";
    if (!force && text.trim().length < 30) return;

    const before = htmlToMarkdown(bodyEl);
    inflight?.abort();
    inflight = new AbortController();
    setStatus("Thinking\u{2026}");
    try {
      const suggestion = await completeInline(
        state.ai,
        { before, after: "", title: titleEl.textContent ?? "" },
        inflight.signal
      );
      if (!suggestion) { setStatus(""); return; }
      clearGhost();
      ghostNode = document.createElement("span");
      ghostNode.className = "ed-ghost-text";
      ghostNode.setAttribute("contenteditable", "false");
      ghostNode.textContent = suggestion.startsWith(" ") ? suggestion : ` ${suggestion}`;
      block.append(ghostNode);
      setStatus("Tab to accept");
    } catch (error) {
      if ((error as Error).name !== "AbortError") setStatus((error as Error).message, "error");
    }
  }

  const scheduleSuggestion = debounce(() => requestSuggestion(false), 1400);

  function openAsk(
    forceMode?: "chat" | "research" | "sources",
    contextTarget?: HTMLElement
  ) {
    if (!aiReady()) {
      setStatus("The assistant is not available on this desk.", "error");
      return;
    }

    const contextSelection = window.getSelection();
    if (contextTarget && bodyEl.contains(contextTarget)) {
      const caret = document.createRange();
      caret.selectNodeContents(contextTarget);
      caret.collapse(true);
      contextSelection?.removeAllRanges();
      contextSelection?.addRange(caret);
    }

    const sel = window.getSelection();
    const selected = sel && !sel.isCollapsed ? sel.toString().trim() : "";
    const anchorNode = sel?.anchorNode ?? null;
    const inTitle = !!(anchorNode && titleEl.contains(anchorNode));
    const inStand = !!(anchorNode && standEl.contains(anchorNode));
    const inBody = !!(anchorNode && bodyEl.contains(anchorNode));
    const block = inBody && !inTitle && !inStand ? currentBlock() : null;
    const range = selected && sel ? sel.getRangeAt(0).cloneRange() : null;

    type AskJob = "chat" | "research" | "sources";
    let job: AskJob = forceMode ?? "chat";

    const passage = inTitle
      ? (selected || titleEl.textContent || "").trim()
      : inStand
        ? (selected || standEl.textContent || "").trim()
        : selected || "";

    const anchorEl = inTitle
      ? titleEl
      : inStand
        ? standEl
        : block ?? bodyEl;
    const anchorRect = (range ?? anchorEl).getBoundingClientRect();

    const scopeLabel = selected
      ? "Selection"
      : inTitle
        ? "Headline"
        : inStand
          ? "Standfirst"
          : contextTarget && block && !block.textContent?.trim()
            ? "Empty paragraph"
          : "Whole piece";

    const previewText = (passage || htmlToMarkdown(bodyEl) || titleEl.textContent || "")
      .replace(/\s+/g, " ")
      .trim();
    const preview =
      previewText.slice(0, 110) + (previewText.length > 110 ? "\u{2026}" : "");

    const pieceCtx = () => ({
      title: titleEl.textContent ?? "",
      description: standEl.textContent ?? "",
      draft: htmlToMarkdown(bodyEl),
      selection: passage,
    });

    const modeMeta: Record<AskJob, { label: string; placeholder: string; go: string }> = {
      chat: {
        label: "Chat",
        placeholder:
          "Ask anything \u{2014} outline the next section, stress-test the argument, suggest angles\u{2026}",
        go: "Ask",
      },
      research: {
        label: "Research",
        placeholder:
          "What should I look up? e.g. NATO 2% spending compliance 2025, Red Sea insurance clauses\u{2026}",
        go: "Research",
      },
      sources: {
        label: "Sources",
        placeholder:
          "Optional focus \u{2014} leave blank to source the whole piece, or name a topic/document.",
        go: "Find sources",
      },
    };

    let lastApply: ChatApply | null = null;
    let lastSources: SourceSuggestion[] = [];
    let busy = false;
    let prevText = "";

    const close = () => {
      menuEl.classList.remove("is-open", "is-ask");
      menuEl.style.width = "";
      document.removeEventListener("mousedown", away, true);
    };
    const away = (event: MouseEvent) => {
      if (!menuEl.contains(event.target as Node)) close();
    };
    window.setTimeout(() => document.addEventListener("mousedown", away, true), 0);

    menuEl.style.top = `${window.scrollY + Math.min(anchorRect.bottom + 10, window.innerHeight - 40)}px`;
    menuEl.style.left = `${Math.max(12, Math.min(window.scrollX + anchorRect.left, window.innerWidth - 480))}px`;

    const setBusy = (on: boolean, label = "Working\u{2026}") => {
      busy = on;
      const b = maybe<HTMLElement>("[data-ask-busy]");
      const go = maybe<HTMLButtonElement>("[data-ask-go]");
      if (b) {
        b.hidden = !on;
        b.textContent = label;
      }
      if (go) go.disabled = on;
    };

    const showAnswer = (text: string) => {
      const host = maybe<HTMLElement>("[data-ask-result]");
      if (!host) return;
      const html = text
        .split(/\n{2,}/)
        .map((para) => {
          const lines = para.split("\n");
          if (lines.every((l) => /^\s*[-*]\s+/.test(l) || !l.trim())) {
            const items = lines
              .filter((l) => l.trim())
              .map((l) => `<li>${esc(l.replace(/^\s*[-*]\s+/, ""))}</li>`)
              .join("");
            return items ? `<ul>${items}</ul>` : "";
          }
          return `<p>${esc(para).replace(/\n/g, "<br>")}</p>`;
        })
        .join("");
      const sourcesHtml = lastSources.length
        ? `<div class="ed-ask-sources" data-source-list>${lastSources
            .map(
              (s, i) => `<label class="ed-ask-source">
                <input type="checkbox" data-src="${i}" checked />
                <span><span class="name">${esc(s.name)}</span><span class="why">${esc(s.why || s.url)}</span></span>
                <a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">Open</a>
              </label>`
            )
            .join("")}</div>`
        : "";
      host.innerHTML =
        (text.trim() ? `<div class="ed-ask-answer">${html}</div>` : "") + sourcesHtml;

      const applyBtn = maybe<HTMLButtonElement>("[data-ask-apply]");
      const addBtn = maybe<HTMLButtonElement>("[data-ask-add-sources]");
      const canApply = Boolean(
        lastApply?.text.trim() &&
          (lastApply.action === "insert" || Boolean(passage.trim()))
      );
      if (applyBtn) applyBtn.hidden = !canApply;
      if (addBtn) addBtn.hidden = !lastSources.length;
    };

    const mergeSourcesIntoDrawer = (picked: SourceSuggestion[]) => {
      const box = maybe<HTMLTextAreaElement>("[data-sources]");
      if (!box || !picked.length) return 0;
      const existing = new Set(
        box.value
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean)
          .map((l) => {
            const url = l.split("|").pop()?.trim().toLowerCase() ?? "";
            return url.replace(/\/$/, "");
          })
      );
      const lines = [...box.value.split("\n").map((l) => l.trim()).filter(Boolean)];
      let added = 0;
      for (const s of picked) {
        const key = s.url.replace(/\/$/, "").toLowerCase();
        if (existing.has(key)) continue;
        existing.add(key);
        lines.push(`${s.name} | ${s.url}`);
        added += 1;
      }
      box.value = lines.join("\n");
      touched();
      return added;
    };

    const insertMarkdown = (md: string) => {
      const html = markdownToHtml(md);
      const holder = document.createElement("div");
      holder.innerHTML = html;
      const nodes = [...holder.children] as HTMLElement[];
      if (!nodes.length) return;
      const at = block && bodyEl.contains(block) ? block : currentBlock() || bodyEl.lastElementChild;
      if (at && bodyEl.contains(at)) at.after(...nodes);
      else bodyEl.append(...nodes);
      nodes[0]?.scrollIntoView({ block: "center", behavior: "smooth" });
      nodes.forEach((n, i) => {
        n.style.animationDelay = `${i * 60}ms`;
        n.classList.add("ed-arrived");
      });
      window.setTimeout(
        () => nodes.forEach((n) => { n.classList.remove("ed-arrived"); n.style.animationDelay = ""; }),
        1000
      );
      ensureTrailingParagraph();
      touched();
    };

    const applyChatDraft = (proposal: ChatApply) => {
      const text = proposal.text.trim();
      if (!text) return;

      if (proposal.action === "insert") {
        insertMarkdown(text);
        setStatus("Applied to the piece", "ok");
        return;
      }

      if (inTitle || inStand) {
        const target = inTitle ? titleEl : standEl;
        if (range && target.contains(range.commonAncestorContainer)) {
          range.deleteContents();
          range.insertNode(document.createTextNode(text));
          target.normalize();
        } else {
          target.textContent = text;
        }
        target.classList.add("ed-arrived");
        window.setTimeout(() => target.classList.remove("ed-arrived"), 900);
        touched();
        setStatus("Applied to the piece", "ok");
        return;
      }

      if (!range || !bodyEl.contains(range.commonAncestorContainer)) {
        setStatus("Select the passage you want to replace first.", "error");
        return;
      }

      const holder = document.createElement("div");
      holder.innerHTML = inlineToHtml(text.replace(/\s*\n\s*/g, " "));
      const fragment = document.createDocumentFragment();
      while (holder.firstChild) fragment.append(holder.firstChild);
      range.deleteContents();
      range.insertNode(fragment);
      bodyEl.classList.add("ed-arrived");
      window.setTimeout(() => bodyEl.classList.remove("ed-arrived"), 900);
      ensureTrailingParagraph();
      touched();
      setStatus("Applied to the piece", "ok");
    };

    const runChat = async (question: string, withResearch: boolean) => {
      setBusy(true, withResearch ? "Researching\u{2026}" : "Thinking\u{2026}");
      lastApply = null;
      lastSources = [];
      showAnswer("");
      try {
        const ctx = pieceCtx();
        const result = await chatAboutPiece(state.ai, {
          question,
          title: ctx.title,
          description: ctx.description,
          draft: ctx.draft,
          selection: ctx.selection,
          withResearch,
        });
        lastApply = result.apply ?? null;
        lastSources = result.sources ?? [];
        showAnswer(result.answer || "Nothing came back.");
        setStatus(withResearch ? "Research in." : "Answer in.", "ok");
      } catch (error) {
        showAnswer((error as Error).message);
        setStatus((error as Error).message, "error");
      } finally {
        setBusy(false);
      }
    };

    const runSources = async (focus: string) => {
      setBusy(true, "Finding sources\u{2026}");
      lastApply = null;
      lastSources = [];
      showAnswer("");
      try {
        const ctx = pieceCtx();
        lastSources = await suggestSources(state.ai, {
          title: ctx.title,
          description: ctx.description,
          draft: ctx.draft,
          query: focus,
        });
        showAnswer(
          lastSources.length
            ? `${lastSources.length} sources worth filing. Tick the ones you want, then Add sources.`
            : "No solid public sources came back for that. Try a sharper query."
        );
        setStatus(
          lastSources.length ? `${lastSources.length} sources` : "No sources",
          lastSources.length ? "ok" : "error"
        );
      } catch (error) {
        showAnswer((error as Error).message);
        setStatus((error as Error).message, "error");
      } finally {
        setBusy(false);
      }
    };

    const bind = () => {
      const input = el<HTMLTextAreaElement>("[data-ask-input]");

      menuEl.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((btn) => {
        btn.addEventListener("mousedown", (e) => e.preventDefault());
        btn.addEventListener("click", () => {
          if (busy) return;
          prevText = input.value;
          job = btn.dataset.mode as AskJob;
          paint();
        });
      });

      input.addEventListener("input", () => {
        prevText = input.value;
      });

      input.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          close();
          (inTitle ? titleEl : inStand ? standEl : bodyEl).focus();
          return;
        }
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          if (!busy) el<HTMLFormElement>("[data-ask]").requestSubmit();
        }
      });

      maybe<HTMLButtonElement>("[data-ask-apply]")?.addEventListener("click", () => {
        if (!lastApply?.text.trim()) return;
        const proposal = lastApply;
        applyChatDraft(proposal);
        lastApply = null;
        const button = maybe<HTMLButtonElement>("[data-ask-apply]");
        if (button) button.hidden = true;
      });

      maybe<HTMLButtonElement>("[data-ask-add-sources]")?.addEventListener("click", () => {
        const boxes = menuEl.querySelectorAll<HTMLInputElement>("[data-src]");
        const picked: SourceSuggestion[] = [];
        boxes.forEach((box) => {
          if (!box.checked) return;
          const row = lastSources[Number(box.dataset.src)];
          if (row) picked.push(row);
        });
        const n = mergeSourcesIntoDrawer(picked);
        setStatus(
          n ? `Added ${n} source${n === 1 ? "" : "s"} to Publish` : "Those sources are already filed",
          n ? "ok" : "error"
        );
      });

      el<HTMLFormElement>("[data-ask]").addEventListener("submit", async (event) => {
        event.preventDefault();
        if (busy) return;
        const text = input.value.trim();
        if (job === "chat") {
          if (!text) { input.focus(); return; }
          await runChat(text, false);
          return;
        }
        if (job === "research") {
          if (!text) { input.focus(); return; }
          await runChat(text, true);
          return;
        }
        await runSources(text);
      });
    };

    const paint = () => {
      const meta = modeMeta[job];
      menuEl.classList.add("is-ask", "is-open");
      menuEl.innerHTML = `
        <div class="ed-menu-head">
          <span class="ed-ask-kicker">
            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" />
              <circle cx="12" cy="12" r="3.2" />
            </svg>
            Ask
          </span>
          <span class="ed-ask-scope">${esc(scopeLabel)}</span>
        </div>
        <form class="ed-ask" data-ask>
          <div class="ed-ask-modes" data-modes>
            ${(["chat", "research", "sources"] as AskJob[])
              .map(
                (m) =>
                  `<button type="button" class="ed-ask-mode ${job === m ? "is-on" : ""}" data-mode="${m}">${modeMeta[m].label}</button>`
              )
              .join("")}
          </div>
          <div class="ed-ask-field">
            <textarea data-ask-input rows="3" autocomplete="off" spellcheck="true"
              placeholder="${esc(meta.placeholder)}"></textarea>
          </div>
          <p class="ed-ask-target"><strong>${
            job === "sources" ? "Sourcing" : "Context"
          }</strong>${esc(preview || "Untitled piece")}</p>
          <div data-ask-result></div>
          <p class="ed-ask-busy" data-ask-busy hidden>Working\u{2026}</p>
          <div class="ed-ask-row">
            <button type="submit" class="ed-btn ed-btn-primary" data-ask-go>${esc(meta.go)}</button>
            <button type="button" class="ed-btn ed-btn-primary" data-ask-apply hidden>Apply</button>
            <button type="button" class="ed-btn ed-btn-quiet" data-ask-add-sources hidden>Add sources</button>
            <span class="ed-ask-hint"><kbd>Enter</kbd> go \u{b7} <kbd>Esc</kbd> close</span>
          </div>
        </form>`;

      const input = el<HTMLTextAreaElement>("[data-ask-input]");
      if (prevText) input.value = prevText;
      input.focus();
      bind();
    };

    paint();
  }

  bodyEl.addEventListener("contextmenu", (event) => {
    const target = event.target as HTMLElement;
    const block = target.closest<HTMLElement>("p");
    if (!block || !bodyEl.contains(block) || block.textContent?.trim()) return;
    event.preventDefault();
    openAsk("chat", block);
  });

  // ==========================================================
  // Publish drawer
  // ==========================================================

  const openDrawer = () => {
    drawer.classList.add("is-open");
    scrim.classList.add("is-open");
  };
  const closeDrawer = () => {
    drawer.classList.remove("is-open");
    scrim.classList.remove("is-open");
  };

  el<HTMLButtonElement>("[data-publish]").addEventListener("click", openDrawer);
  maybe<HTMLButtonElement>("[data-bar-ask]")?.addEventListener("click", () => openAsk("chat"));
  el<HTMLButtonElement>("[data-drawer-close]").addEventListener("click", closeDrawer);
  scrim.addEventListener("click", closeDrawer);

  const heroSelect = el<HTMLSelectElement>("[data-hero]");
  const coverEl = el<HTMLElement>("[data-cover]");

  /** Files a found picture as the lead, carrying its credit into the frontmatter. */
  async function findCover() {
    const filed = await findPhoto({
      query: (titleEl.textContent ?? "").trim(),
      suggest: aiReady()
        ? () =>
            suggestPhotoQuery(state.ai, {
              title: titleEl.textContent ?? "",
              description: standEl.textContent ?? "",
              draft: htmlToMarkdown(bodyEl),
            })
        : undefined,
    });
    if (!filed) return;
    if (!state.images.includes(filed.name)) state.images.push(filed.name);
    heroSelect.insertAdjacentHTML("beforeend", `<option value="${esc(filed.name)}">${esc(filed.name)}</option>`);
    heroSelect.value = filed.name;
    const alt = maybe<HTMLInputElement>("[data-alt]");
    if (alt && !alt.value.trim()) alt.value = filed.alt;
    const credit = maybe<HTMLInputElement>("[data-credit]");
    if (credit) credit.value = filed.credit;
    const caption = maybe<HTMLInputElement>("[data-caption]");
    if (caption && !caption.value.trim()) caption.value = filed.caption;
    const source = maybe<HTMLInputElement>("[data-source]");
    if (source && !source.value.trim()) source.value = filed.source;
    const photoDate = maybe<HTMLInputElement>("[data-image-date]");
    if (photoDate && !photoDate.value.trim()) photoDate.value = filed.date;
    const license = maybe<HTMLInputElement>("[data-license]");
    if (license && !license.value.trim()) license.value = filed.license;
    paintCover();
    touched();
    setStatus("Picture filed with its credit", "ok");
  }

  async function findCoverOnDevice() {
    try {
      const filed = await fileFromDevice();
      if (!filed) return;
      if (!state.images.includes(filed.name)) state.images.push(filed.name);
      heroSelect.insertAdjacentHTML("beforeend", `<option value="${esc(filed.name)}">${esc(filed.name)}</option>`);
      heroSelect.value = filed.name;
      maybe<HTMLInputElement>("[data-alt]")!.value = filed.alt;
      maybe<HTMLInputElement>("[data-caption]")!.value = filed.caption;
      maybe<HTMLInputElement>("[data-credit]")!.value = filed.credit;
      maybe<HTMLInputElement>("[data-source]")!.value = filed.source;
      maybe<HTMLInputElement>("[data-image-date]")!.value = filed.date;
      maybe<HTMLInputElement>("[data-license]")!.value = filed.license;
      paintCover();
      touched();
      setStatus("Device picture added — complete its attribution details", "ok");
    } catch (error) {
      setStatus((error as Error).message, "error");
    }
  }

  const paintCover = () => {
    const src = heroSelect.value;
    if (src) {
      coverEl.classList.add("has-image");
      coverEl.innerHTML = `<img src="${esc(heroSrc(src))}" alt="" /><button type="button" class="ed-btn ed-cover-swap" data-cover-swap>Change</button>`;
    } else {
      coverEl.innerHTML =
        '<span class="ed-cover-hint">+ Lead image</span>' +
        '<span class="ed-cover-ways">' +
        '<button type="button" class="ed-btn ed-btn-primary" data-cover-find>Search the web</button>' +
        '<button type="button" class="ed-btn" data-cover-device>From this device</button>' +
        '<button type="button" class="ed-btn" data-cover-lib>From the library</button>' +
        "</span>";
      coverEl.classList.remove("has-image");
    }
    coverEl.querySelector("[data-cover-swap]")?.addEventListener("click", (e) => { e.stopPropagation(); openDrawer(); });
    coverEl.querySelector("[data-cover-find]")?.addEventListener("click", (e) => { e.stopPropagation(); findCover(); });
    coverEl.querySelector("[data-cover-device]")?.addEventListener("click", (e) => { e.stopPropagation(); findCoverOnDevice(); });
    coverEl.querySelector("[data-cover-lib]")?.addEventListener("click", (e) => { e.stopPropagation(); openDrawer(); });
  };
  heroSelect.addEventListener("change", paintCover);
  maybe<HTMLButtonElement>("[data-hero-find]")?.addEventListener("click", findCover);
  maybe<HTMLButtonElement>("[data-hero-device]")?.addEventListener("click", findCoverOnDevice);
  paintCover();

  maybe<HTMLButtonElement>("[data-fill]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget as HTMLButtonElement;
    const note = el<HTMLElement>("[data-fill-note]");
    button.disabled = true;
    note.dataset.state = "";
    note.textContent = "Reading the piece\u{2026}";
    try {
      const proposal = await suggestMeta(
        state.ai,
        { title: titleEl.textContent ?? "", body: htmlToMarkdown(bodyEl) },
        { categories: DESKS, regions: REGIONS }
      );
      if (!standEl.textContent?.trim() && proposal.description) standEl.textContent = proposal.description;
      const set = (selector: string, value: string) => {
        const field = maybe<HTMLInputElement>(selector);
        if (field && !field.value.trim() && value) field.value = value;
      };
      set("[data-tags]", proposal.tags.join(", "));
      set("[data-countries]", proposal.country.join(", "));
      set("[data-alt]", proposal.heroImageAlt);
      const desk = maybe<HTMLSelectElement>("[data-desk]");
      if (desk && proposal.category) desk.value = proposal.category;
      const region = maybe<HTMLSelectElement>("[data-region]");
      if (region && proposal.region) region.value = proposal.region;
      note.dataset.state = "ok";
      note.textContent = "Filled in the blanks. Check them.";
    } catch (error) {
      note.dataset.state = "error";
      note.textContent = (error as Error).message;
    } finally {
      button.disabled = false;
    }
  });

  // ---------- restore / discard ----------
  maybe<HTMLButtonElement>("[data-restore]")?.addEventListener("click", () => {
    bodyEl.innerHTML = markdownToHtml(args.localBody!);
    recount();
    setStatus("Restored", "ok");
  });
  maybe<HTMLButtonElement>("[data-drop]")?.addEventListener("click", () => {
    localStorage.removeItem(draftKey());
    bodyEl.innerHTML = markdownToHtml(args.body);
    recount();
    setStatus("Using the published version", "ok");
  });

  // ---------- publish ----------
  const collect = (): ArticleFields => {
    const list = (selector: string) =>
      (maybe<HTMLInputElement>(selector)?.value ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    const sources = (maybe<HTMLTextAreaElement>("[data-sources]")?.value ?? "")
      .split("\n").map((l) => l.trim()).filter(Boolean)
      .map((line) => {
        const pipe = line.indexOf("|");
        return pipe === -1
          ? { name: line, url: "" }
          : { name: line.slice(0, pipe).trim(), url: line.slice(pipe + 1).trim() };
      });

    return {
      title: (titleEl.textContent ?? "").trim(),
      description: (standEl.textContent ?? "").trim(),
      date: maybe<HTMLInputElement>("[data-date]")?.value || today(),
      updated: f.updated,
      author: "Zeynep Doruk",
      category: maybe<HTMLSelectElement>("[data-desk]")?.value ?? f.category,
      region: maybe<HTMLSelectElement>("[data-region]")?.value ?? f.region,
      country: list("[data-countries]"),
      tags: list("[data-tags]"),
      type: maybe<HTMLSelectElement>("[data-type]")?.value ?? f.type,
      featured: maybe<HTMLInputElement>("[data-featured]")?.checked ?? false,
      editorsPick: maybe<HTMLInputElement>("[data-pick]")?.checked ?? false,
      draft: !el<HTMLInputElement>("[data-live]").checked,
      heroImage: heroSelect.value,
      heroImageAlt: (maybe<HTMLInputElement>("[data-alt]")?.value ?? "").trim(),
      imageCaption: (maybe<HTMLInputElement>("[data-caption]")?.value ?? "").trim(),
      imageCredit: (maybe<HTMLInputElement>("[data-credit]")?.value ?? "").trim(),
      imageSource: (maybe<HTMLInputElement>("[data-source]")?.value ?? "").trim(),
      imageDate: (maybe<HTMLInputElement>("[data-image-date]")?.value ?? "").trim(),
      imageLicense: (maybe<HTMLInputElement>("[data-license]")?.value ?? "").trim(),
      sources,
    };
  };

  async function publish() {
    const button = el<HTMLButtonElement>("[data-save]");
    const note = el<HTMLElement>("[data-publish-note]");
    clearGhost();
    const next = collect();
    const markdown = htmlToMarkdown(bodyEl);

    const missing: string[] = [];
    if (!next.title) missing.push("a headline");
    if (!next.description) missing.push("a standfirst");
    if (!markdown.trim()) missing.push("some copy");
    if (!next.draft && !next.heroImage) missing.push("a lead image");
    if (!next.draft && next.heroImage && !next.heroImageAlt) missing.push("alt text for the image");
    if (missing.length) {
      note.dataset.state = "error";
      note.textContent = `Still needs ${missing.join(", ")}.`;
      return;
    }

    const file = serialiseArticle(next, markdown);

    const broken = findBrokenCharacters(file);
    if (broken.length) {
      note.dataset.state = "error";
      note.textContent = `Broken characters (${broken.join(" ")}). Retype them.`;
      return;
    }

    button.disabled = true;
    note.dataset.state = "";
    note.textContent = "Publishing\u{2026}";
    const oldDraftKey = draftKey();
    if (isNew) {
      const nextSlug = slugify(next.title);
      if (!nextSlug) {
        note.dataset.state = "error";
        note.textContent = "The headline needs some Latin letters or digits for the web address.";
        button.disabled = false;
        return;
      }
      slug = nextSlug;
      path = `src/content/articles/${slug}.mdx`;
      el<HTMLElement>("[data-slugline]").textContent = `${kind} \u{b7} ${slug}`;
    }
    try {
      const result = await writeFile(
        path, file,
        `${isNew ? "Create" : "Edit"} ${kind} "${next.title}"`,
        sha || undefined
      );
      sha = result.sha;
      isNew = false;
      localStorage.removeItem(oldDraftKey);
      localStorage.removeItem(draftKey());
      note.dataset.state = "ok";
      note.textContent = next.draft ? "Saved as a draft." : "Live in a couple of minutes.";
      button.textContent = "Publish";
      setStatus("Published", "ok");
    } catch (error) {
      note.dataset.state = "error";
      note.textContent = (error as Error).message;
    } finally {
      button.disabled = false;
    }
  }

  el<HTMLButtonElement>("[data-save]").addEventListener("click", publish);
  el<HTMLButtonElement>("[data-back]").addEventListener("click", () => openStories());

  document.addEventListener("keydown", function onKey(event) {
    if (!document.body.contains(bodyEl)) { document.removeEventListener("keydown", onKey); return; }
    if (event.key === "Escape") closeDrawer();
  });

  recount();
  if (!f.title) titleEl.focus();
  else placeCaret(bodyEl.lastElementChild as HTMLElement, true);
}

// ==========================================================
// Boot
// ==========================================================

// On the publication's own deployment there is no server behind this page, and
// the writer is one build away from the desk. Say so before asking anything.
if (root.dataset.desk !== "true") {
  const desk = `${root.dataset.deskUrl ?? ""}/editor`;
  gate(`
    <p class="ed-legend">Wrong address</p>
    <h2>The desk is not here</h2>
    <p class="ed-note">This address is the published site, which is only files. Writing happens
    where there is a server to hold the keys.</p>
    <a class="ed-btn ed-btn-primary ed-gate-go" href="${esc(desk)}">Go to the desk &rarr;</a>
    <p class="ed-gate-foot">${esc(desk)}</p>
  `);
} else {
  const session = await readSession();
  if (!session.configured) {
    gate(`
      <p class="ed-legend">Not ready</p>
      <h2>The desk is not set up yet</h2>
      <p class="ed-note">This page needs its server half. Add EDITOR_PASSWORD, SESSION_SECRET,
      OPENAI_KEY and GITHUB_TOKEN to the deployment, then reload.</p>
    `);
  } else if (session.signedIn) {
    state.user = session.user;
    state.assistant = session.assistant;
    state.canPublish = session.canPublish;
    state.model = session.model;
    await openStories();
  } else {
    signInView();
  }
}
