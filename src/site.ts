// ============================================================
// PUBLICATION CONFIGURATION
// ------------------------------------------------------------
// Statevera is organised around three pillars, each with its own
// colour from the masthead: the Wire (red), the Journal (gold)
// and Risk (ink). Everything the site knows about itself is here.
// ============================================================

export const site = {
  // Identity -------------------------------------------------
  publicationName: "STATEVERA",
  publicationNameDisplay: "Statevera",
  publicationTagline: "Understanding power beyond the headline.",
  publicationDescription:
    "Statevera is an independent international affairs publication exploring geopolitics, diplomacy, political economy and the changing international order.",
  publicationType: "Independent international affairs publication",
  founded: "2026",

  // Author / editor ------------------------------------------
  authorName: "Zeynep Doruk",
  authorHandle: "Z. Doruk",
  authorRole: "Editor & Writer",
  /** Empty until there is a real portrait; the byline drops the avatar when it is. */
  authorPhoto: "",
  authorBio:
    "Zeynep Doruk is the editor and sole writer of Statevera. She covers international security, diplomacy and political economy, with reporting interests spanning Europe, the Middle East and the Eastern Mediterranean. Her work focuses on the intersection of strategy, economics and statecraft.",

  // Links ----------------------------------------------------
  // Empty means "no account yet": the footer and About page leave the link out
  // rather than publishing an address that 404s.
  socialLinks: {
    x: "",
    linkedin: "",
    rss: "/rss.xml",
    email: "",
  },

  // Technical ------------------------------------------------
  siteUrl: "https://zeynepdorukk.github.io/statevera",
  /** The editorial desk. It needs a server, so it is not on GitHub Pages. */
  deskUrl: "https://statevera.netlify.app",
  defaultOgImage: "/images/branding/og-image.jpg",
  locale: "en",
  language: "en-US",
} as const;

// ------------------------------------------------------------
// The three pillars
// ------------------------------------------------------------

export type PillarId = "wire" | "journal" | "risk";

export interface Pillar {
  id: PillarId;
  name: string;
  url: string;
  tagline: string;
  description: string;
  /** CSS custom-property suffix: --pillar-wire, --pillar-journal, --pillar-risk */
  tone: PillarId;
}

export const pillars: Record<PillarId, Pillar> = {
  wire: {
    id: "wire",
    name: "News",
    url: "/wire",
    tagline: "World reporting, as it lands",
    description:
      "International affairs reporting gathered from established newsrooms and institutions. Headlines, summaries and attribution only — every item opens at the publisher.",
    tone: "wire",
  },
  journal: {
    id: "journal",
    name: "Journal",
    url: "/journal",
    tagline: "Signed analysis and reference",
    description:
      "Original analysis and essays written for Statevera by Zeynep Doruk.",
    tone: "journal",
  },
  risk: {
    id: "risk",
    name: "GLORISK",
    url: "/risk",
    tagline: "Geopolitical risk, scored",
    description:
      "Glorisk: an interactive tool for country risk scoring, shock scenarios and strategic exposure, built by the editor.",
    tone: "risk",
  },
};

export const pillarList: Pillar[] = [pillars.wire, pillars.journal, pillars.risk];

// ------------------------------------------------------------
// Navigation
// ------------------------------------------------------------

export type NavItem = {
  label: string;
  url: string;
  subs?: { label: string; url: string }[];
};

export const nav: { primary: NavItem[] } = {
  primary: [
    { label: "The Journal", url: "/journal" },
    { label: "GLORISK", url: "/risk" },
    { label: "Sources", url: "/sources" },
    {
      label: "News",
      url: "/wire",
      subs: [
        { label: "All reporting", url: "/wire" },
        { label: "Security", url: "/wire/security" },
        { label: "Diplomacy", url: "/wire/diplomacy" },
        { label: "Economy", url: "/wire/economy" },
        { label: "Geopolitics", url: "/wire/geopolitics" },
        { label: "Politics", url: "/wire/politics" },
      ],
    },
    { label: "Regions", url: "/regions" },
    { label: "About", url: "/about" },
    { label: "LIVE", url: "/live" },
    { label: "EDITOR LOGIN", url: "https://statevera.netlify.app/editor/" },
  ],
};

// ------------------------------------------------------------
// Desks (categories)
// ------------------------------------------------------------

export type DeskSlug =
  | "security"
  | "diplomacy"
  | "economy"
  | "geopolitics"
  | "politics";

export interface Desk {
  slug: DeskSlug;
  /** Matches the `category` value used by both the wire and the journal. */
  name: string;
  tagline: string;
  description: string;
}

export const desks: Record<DeskSlug, Desk> = {
  security: {
    slug: "security",
    name: "Security",
    tagline: "Deterrence, defence and strategic risk",
    description:
      "Alliances, nuclear posture, arms control, regional conflict and the military balance.",
  },
  diplomacy: {
    slug: "diplomacy",
    name: "Diplomacy",
    tagline: "The quiet machinery of statecraft",
    description:
      "Negotiations, summits, back channels and the institutions that manage interstate relations.",
  },
  economy: {
    slug: "economy",
    name: "Economy",
    tagline: "Political economy and the economics of power",
    description:
      "Sanctions, trade, energy, supply chains and the global financial system as instruments of politics.",
  },
  geopolitics: {
    slug: "geopolitics",
    name: "Geopolitics",
    tagline: "Power, geography and the contest for influence",
    description:
      "Shifting alliances, strategic geography and great-power competition.",
  },
  politics: {
    slug: "politics",
    name: "Politics",
    tagline: "Power, elections and the politics of states",
    description:
      "How domestic politics and statecraft shape the international system.",
  },
};

export const deskList: Desk[] = Object.values(desks);

/** Categories the journal uses that are not wire desks. */
export const journalSections = {
  theory: {
    slug: "theory",
    name: "Theory",
    tagline: "The concepts that explain the system",
    description:
      "Academic summaries and theoretical essays on international relations and economics.",
    url: "/journal/theory",
  },
} as const;

// ------------------------------------------------------------
// Regions
// ------------------------------------------------------------

export type RegionSlug =
  | "europe"
  | "middle-east"
  | "americas"
  | "asia-pacific"
  | "africa"
  | "eurasia"
  | "turkey"
  | "global";

export const regions: Record<
  RegionSlug,
  { name: string; short: string; description: string; url: string }
> = {
  europe: {
    name: "Europe",
    short: "Europe",
    description:
      "The European Union, NATO's European flank, and the continent's security and economic dilemmas.",
    url: "/regions/europe",
  },
  "middle-east": {
    name: "Middle East",
    short: "Middle East",
    description: "Politics, security, diplomacy and economics across the Middle East.",
    url: "/regions/middle-east",
  },
  americas: {
    name: "Americas",
    short: "Americas",
    description:
      "The United States, hemispheric politics, and Washington's role in the international system.",
    url: "/regions/americas",
  },
  "asia-pacific": {
    name: "Asia-Pacific",
    short: "Asia-Pacific",
    description:
      "Great-power competition, trade corridors and security architecture across the Indo-Pacific.",
    url: "/regions/asia-pacific",
  },
  africa: {
    name: "Africa",
    short: "Africa",
    description: "The continent's rising role in energy, diplomacy and global supply chains.",
    url: "/regions/africa",
  },
  eurasia: {
    name: "Eurasia",
    short: "Eurasia",
    description:
      "Russia and the post-Soviet space: war, sanctions and the remaking of regional order.",
    url: "/regions/eurasia",
  },
  turkey: {
    name: "Turkey",
    short: "Turkey",
    description:
      "Ankara's foreign policy between NATO, Moscow, the Gulf and the Eastern Mediterranean.",
    url: "/regions/turkey",
  },
  global: {
    name: "Global",
    short: "Global",
    description: "Stories that belong to the international system as a whole.",
    url: "/regions/global",
  },
};

export const regionName = (slug: string): string =>
  (regions as Record<string, { name: string }>)[slug]?.name ?? slug;

export const regionSlugOf = (name: string): string => {
  const entry = Object.entries(regions).find(([, r]) => r.name === name);
  return entry ? entry[0] : name.toLowerCase().replace(/ /g, "-");
};

/** Category name -> desk slug, for linking wire and journal items to a desk. */
export const deskSlugOf = (category: string): DeskSlug | null => {
  const entry = deskList.find((d) => d.name === category);
  return entry ? entry.slug : null;
};
