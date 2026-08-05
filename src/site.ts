// ============================================================
// PUBLICATION CONFIGURATION
// ------------------------------------------------------------
// The publication's entire identity is defined here.
// To rebrand the site, edit this file and public/images/branding.
// ============================================================

export const site = {
  // Identity -------------------------------------------------
  publicationName: "STATEVERA",
  publicationNameDisplay: "Statevera",
  publicationTagline: "Politics, power and the forces shaping the international system.",
  publicationDescription:
    "Independent analysis of global politics, security and economics.",
  publicationType: "Independent international affairs publication",

  // Author / editor ------------------------------------------
  authorName: "Daniel Marchetti",
  authorHandle: "D. Marchetti",
  authorRole: "Editor",
  authorPhoto: "/images/authors/marchetti.jpg",
  authorBio:
    "Daniel Marchetti is the editor of Statevera. He has covered international security, diplomacy and political economy for more than a decade, reporting from Brussels, Ankara, Washington and the Gulf. His work focuses on the intersection of strategy, economics and statecraft.",

  // Links ----------------------------------------------------
  socialLinks: {
    x: "https://x.com/stateverainews",
    linkedin: "https://www.linkedin.com/company/statevera",
    rss: "/rss.xml",
    email: "editor@statevera.example",
  },

  // Technical ------------------------------------------------
  siteUrl: "https://zeynepdorukk.github.io/statevera",
  defaultOgImage: "/images/branding/og-image.jpg",
  locale: "en",
  language: "en-US",
} as const;

export const nav = {
  primary: [
    { label: "Latest", url: "/latest" },
    { label: "World", url: "/world" },
    { label: "Geopolitics", url: "/geopolitics" },
    { label: "Security", url: "/security" },
    { label: "Diplomacy", url: "/diplomacy" },
    { label: "Economy", url: "/economy" },
    { label: "Regions", url: "/regions" },
    { label: "Analysis", url: "/analysis" },
    { label: "Opinion", url: "/opinion" },
  ],
} as const;

export type CategorySlug =
  | "latest"
  | "world"
  | "geopolitics"
  | "security"
  | "diplomacy"
  | "economy"
  | "analysis"
  | "opinion"
  | "explainers";

export const categories: Record<
  CategorySlug,
  { name: string; tagline: string; description: string; url: string }
> = {
  latest: {
    name: "Latest",
    tagline: "Everything, as it happens",
    description:
      "The full recent stream — analysis, news, explainers and briefings — in reverse chronological order.",
    url: "/latest",
  },
  world: {
    name: "World",
    tagline: "The international system, day by day",
    description:
      "Latest developments across regions and institutions — from the G20 to the Security Council, from trade corridors to summit rooms.",
    url: "/world",
  },
  geopolitics: {
    name: "Geopolitics",
    tagline: "Power, geography and the contest for influence",
    description:
      "How shifting alliances, strategic geography and great-power competition are reshaping the international order.",
    url: "/geopolitics",
  },
  security: {
    name: "Security",
    tagline: "Deterrence, defence and strategic risk",
    description:
      "NATO, nuclear posture, arms control, regional conflicts and the military balance — reported and analysed.",
    url: "/security",
  },
  diplomacy: {
    name: "Diplomacy",
    tagline: "The quiet machinery of statecraft",
    description:
      "Negotiations, summits, back channels and the institutions that manage — and fail to manage — interstate relations.",
    url: "/diplomacy",
  },
  economy: {
    name: "Economy",
    tagline: "Political economy and the economics of power",
    description:
      "Sanctions, trade, energy, supply chains and the global financial system as instruments of politics.",
    url: "/economy",
  },
  analysis: {
    name: "Analysis",
    tagline: "Long-form reading on the forces shaping the world",
    description:
      "In-depth analysis pieces from the editor's desk: structured arguments, clear stakes, full sourcing.",
    url: "/analysis",
  },
  opinion: {
    name: "Opinion",
    tagline: "Arguments, signed",
    description:
      "Explicitly argued pieces on the decisions facing governments, alliances and the international system.",
    url: "/opinion",
  },
  explainers: {
    name: "Explainers",
    tagline: "The ideas that run the world, explained",
    description:
      "Evergreen guides to the concepts, institutions and chokepoints of international relations.",
    url: "/explainers",
  },
};

export type RegionSlug =
  | "europe"
  | "middle-east"
  | "americas"
  | "asia-pacific"
  | "africa"
  | "eurasia"
  | "turkey";

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
    description:
      "Politics, security, diplomacy and economics across the Middle East.",
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
    description:
      "The continent's rising role in energy, diplomacy and global supply chains.",
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
};

// Region slug used in article frontmatter must map to the config
export const regionName = (slug: string): string =>
  (regions as Record<string, { name: string }>)[slug]?.name ?? slug;

export const regionSlugOf = (name: string): string => {
  const entry = Object.entries(regions).find(([, r]) => r.name === name);
  return entry ? entry[0] : name.toLowerCase().replace(/ /g, "-");
};

export const sampleContentNote =
  "This is demonstration content for the editorial prototype. Article titles and details are fictional and should be replaced with real reporting.";
