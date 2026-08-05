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
  authorName: "Zeynep Doruk",
  authorHandle: "Z. Doruk",
  authorRole: "Editor & Writer",
  authorPhoto: "/images/authors/zeynep-doruk.svg",
  authorBio:
    "Zeynep Doruk is the editor and sole writer of Statevera. She covers international security, diplomacy and political economy, with reporting interests spanning Europe, the Middle East and the Eastern Mediterranean. Her work focuses on the intersection of strategy, economics and statecraft.",

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
    {
      label: "News",
      url: "/news",
      subs: [
        { label: "Politics", url: "/news/politics" },
        { label: "Geopolitics", url: "/news/geopolitics" },
        { label: "Economy", url: "/news/economy" },
        { label: "Culture", url: "/news/culture" },
        { label: "Security", url: "/news/security" },
        { label: "Diplomacy", url: "/news/diplomacy" },
        { label: "Opinion", url: "/news/opinion" },
      ],
    },
    {
      label: "Concepts",
      url: "/concepts",
      subs: [
        { label: "Theory", url: "/concepts/theory" },
        { label: "Explainers", url: "/explainers" },
      ],
    },
    { label: "Risk Analysis", url: "/risk" },
    { label: "Regions", url: "/regions" },
    { label: "Briefings", url: "/briefings" },
    { label: "About", url: "/about" },
  ],
} as const;

export type CategorySlug =
  | "latest"
  | "news"
  | "politics"
  | "geopolitics"
  | "economy"
  | "culture"
  | "security"
  | "diplomacy"
  | "theory"
  | "opinion"
  | "explainers";

// Categories that live under the "News" hub
export const newsSections = [
  "politics",
  "geopolitics",
  "economy",
  "culture",
  "security",
  "diplomacy",
  "opinion",
] as const;

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
  news: {
    name: "News",
    tagline: "The international system, day by day",
    description:
      "Reporting on the politics, security, diplomacy, economics and culture of international relations — from summit rooms to chokepoints, from elections to sanctions.",
    url: "/news",
  },
  politics: {
    name: "Politics",
    tagline: "Power, elections and the politics of states",
    description:
      "How domestic politics and statecraft shape the international system — elections, coalitions, institutions and the decisions of governments.",
    url: "/news/politics",
  },
  geopolitics: {
    name: "Geopolitics",
    tagline: "Power, geography and the contest for influence",
    description:
      "How shifting alliances, strategic geography and great-power competition are reshaping the international order.",
    url: "/news/geopolitics",
  },
  economy: {
    name: "Economy",
    tagline: "Political economy and the economics of power",
    description:
      "Sanctions, trade, energy, supply chains and the global financial system as instruments of politics.",
    url: "/news/economy",
  },
  culture: {
    name: "Culture",
    tagline: "Ideas, identity and soft power",
    description:
      "How culture, language, media and public memory shape foreign policy and international relations.",
    url: "/news/culture",
  },
  security: {
    name: "Security",
    tagline: "Deterrence, defence and strategic risk",
    description:
      "NATO, nuclear posture, arms control, regional conflicts and the military balance — reported and analysed.",
    url: "/news/security",
  },
  diplomacy: {
    name: "Diplomacy",
    tagline: "The quiet machinery of statecraft",
    description:
      "Negotiations, summits, back channels and the institutions that manage — and fail to manage — interstate relations.",
    url: "/news/diplomacy",
  },
  theory: {
    name: "Theory",
    tagline: "The concepts that explain the system",
    description:
      "Academic summaries and theoretical essays on international relations and economics — realism, liberalism, constructivism, balance of power, game theory, trade theory and more.",
    url: "/concepts/theory",
  },
  opinion: {
    name: "Opinion",
    tagline: "Arguments, signed",
    description:
      "Explicitly argued pieces on the decisions facing governments, alliances and the international system.",
    url: "/news/opinion",
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
