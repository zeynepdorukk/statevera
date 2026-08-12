import type { DeskSlug, RegionSlug } from "./site";
import type { JournalLanguage } from "./journal-i18n";

export type SiteLanguage = JournalLanguage;

export const getLanguage = (locale?: string): SiteLanguage => (locale === "tr" ? "tr" : "en");

const splitPathSuffix = (path: string): [string, string] => {
  const index = path.search(/[?#]/);
  return index === -1 ? [path, ""] : [path.slice(0, index), path.slice(index)];
};

export const localizePath = (path: string, language: SiteLanguage): string => {
  if (!path.startsWith("/") || path.startsWith("//")) return path;
  const [pathname, suffix] = splitPathSuffix(path);
  const unprefixed = pathname === "/tr" ? "/" : pathname.replace(/^\/tr(?=\/)/, "");
  if (language === "en") return `${unprefixed}${suffix}`;
  return `${unprefixed === "/" ? "/tr" : `/tr${unprefixed}`}${suffix}`;
};

export const localeAlternates = (path: string) => [
  { language: "en" as const, path: localizePath(path, "en") },
  { language: "tr" as const, path: localizePath(path, "tr") },
];

const deskCopy: Record<SiteLanguage, Record<DeskSlug, { name: string; tagline: string; description: string }>> = {
  en: {
    security: {
      name: "Security",
      tagline: "Deterrence, defence and strategic risk",
      description: "Alliances, nuclear posture, arms control, regional conflict and the military balance.",
    },
    diplomacy: {
      name: "Diplomacy",
      tagline: "The quiet machinery of statecraft",
      description: "Negotiations, summits, back channels and the institutions that manage interstate relations.",
    },
    economy: {
      name: "Economy",
      tagline: "Political economy and the economics of power",
      description: "Sanctions, trade, energy, supply chains and the global financial system as instruments of politics.",
    },
    geopolitics: {
      name: "Geopolitics",
      tagline: "Power, geography and the contest for influence",
      description: "Shifting alliances, strategic geography and great-power competition.",
    },
    politics: {
      name: "Politics",
      tagline: "Power, elections and the politics of states",
      description: "How domestic politics and statecraft shape the international system.",
    },
  },
  tr: {
    security: {
      name: "Güvenlik",
      tagline: "Caydırıcılık, savunma ve stratejik risk",
      description: "İttifaklar, nükleer duruş, silahların kontrolü, bölgesel çatışmalar ve askerî denge.",
    },
    diplomacy: {
      name: "Diplomasi",
      tagline: "Devlet yönetiminin sessiz mekanizması",
      description: "Müzakereler, zirveler, arka kanallar ve devletler arası ilişkileri yöneten kurumlar.",
    },
    economy: {
      name: "Ekonomi",
      tagline: "Siyasi ekonomi ve gücün iktisadı",
      description: "Siyasetin araçları olarak yaptırımlar, ticaret, enerji, tedarik zincirleri ve küresel finans sistemi.",
    },
    geopolitics: {
      name: "Jeopolitik",
      tagline: "Güç, coğrafya ve nüfuz mücadelesi",
      description: "Değişen ittifaklar, stratejik coğrafya ve büyük güç rekabeti.",
    },
    politics: {
      name: "Siyaset",
      tagline: "Güç, seçimler ve devletlerin siyaseti",
      description: "İç siyasetin ve devlet yönetiminin uluslararası sistemi nasıl şekillendirdiği.",
    },
  },
};

const regionCopy: Record<SiteLanguage, Record<RegionSlug, { name: string; short: string; description: string }>> = {
  en: {
    europe: { name: "Europe", short: "Europe", description: "The European Union, NATO's European flank, and the continent's security and economic dilemmas." },
    "middle-east": { name: "Middle East", short: "Middle East", description: "Politics, security, diplomacy and economics across the Middle East." },
    americas: { name: "Americas", short: "Americas", description: "The United States, hemispheric politics, and Washington's role in the international system." },
    "asia-pacific": { name: "Asia-Pacific", short: "Asia-Pacific", description: "Great-power competition, trade corridors and security architecture across the Indo-Pacific." },
    africa: { name: "Africa", short: "Africa", description: "The continent's rising role in energy, diplomacy and global supply chains." },
    eurasia: { name: "Eurasia", short: "Eurasia", description: "Russia and the post-Soviet space: war, sanctions and the remaking of regional order." },
    turkey: { name: "Turkey", short: "Turkey", description: "Ankara's foreign policy between NATO, Moscow, the Gulf and the Eastern Mediterranean." },
    global: { name: "Global", short: "Global", description: "Stories that belong to the international system as a whole." },
  },
  tr: {
    europe: { name: "Avrupa", short: "Avrupa", description: "Avrupa Birliği, NATO'nun Avrupa kanadı ve kıtanın güvenlik ile ekonomi ikilemleri." },
    "middle-east": { name: "Orta Doğu", short: "Orta Doğu", description: "Orta Doğu genelinde siyaset, güvenlik, diplomasi ve ekonomi." },
    americas: { name: "Amerika", short: "Amerika", description: "Amerika Birleşik Devletleri, kıta siyaseti ve Washington'ın uluslararası sistemdeki rolü." },
    "asia-pacific": { name: "Asya-Pasifik", short: "Asya-Pasifik", description: "Hint-Pasifik genelinde büyük güç rekabeti, ticaret koridorları ve güvenlik mimarisi." },
    africa: { name: "Afrika", short: "Afrika", description: "Kıtanın enerji, diplomasi ve küresel tedarik zincirlerinde yükselen rolü." },
    eurasia: { name: "Avrasya", short: "Avrasya", description: "Rusya ve Sovyet sonrası coğrafya: savaş, yaptırımlar ve bölgesel düzenin yeniden kurulması." },
    turkey: { name: "Türkiye", short: "Türkiye", description: "Ankara'nın NATO, Moskova, Körfez ve Doğu Akdeniz arasındaki dış politikası." },
    global: { name: "Küresel", short: "Küresel", description: "Bir bütün olarak uluslararası sisteme ait gelişmeler." },
  },
};

export const deskText = (slug: DeskSlug, language: SiteLanguage) => deskCopy[language][slug];
export const regionText = (slug: RegionSlug, language: SiteLanguage) => regionCopy[language][slug];

export const siteText = {
  en: {
    publicationTagline: "Understanding power beyond the headline.",
    publicationDescription: "Statevera is an independent international affairs publication exploring geopolitics, diplomacy, political economy and the changing international order.",
    publicationType: "Independent international affairs publication",
    authorRole: "Editor & Writer",
    authorBio: "Zeynep Doruk is the founder, editor and sole writer of Statevera. Her work connects international reporting with primary-source research, data-driven tools and original analysis on security, diplomacy, political economy and the changing international order.",
    languageNav: "Language",
    seeAll: "See all",
    home: "Statevera home",
    logoAlt: "STATEVERA logo",
    search: "Search",
    searchStatevera: "Search Statevera",
    openMenu: "Open menu",
    sections: "Sections",
    rssFeed: "RSS feed",
    nav: {
      journal: "The Journal",
      risk: "GLORISK",
      sources: "Sources",
      news: "News",
      allReporting: "All reporting",
      regions: "Regions",
      about: "About",
      live: "LIVE",
      editor: "EDITOR LOGIN",
    },
    footer: {
      editedBy: "Edited and written by",
      founded: "founded",
      email: "Email",
      news: "News",
      journal: "Journal",
      analysis: "Analysis & essays",
      theory: "Theory",
      primarySources: "Primary Sources",
      about: "About",
      regions: "Regions",
      sourcing: "Sourcing",
      rights: "All rights reserved.",
      sourceLead: "News aggregates public RSS feeds from",
      sourceTail: "Statevera reproduces headlines, short summaries and attribution only; every item links to the original publisher, who retains all rights. The Journal and GLORISK are original Statevera projects maintained by",
    },
  },
  tr: {
    publicationTagline: "Manşetin ötesindeki gücü anlamak.",
    publicationDescription: "Statevera; jeopolitik, diplomasi, siyasi ekonomi ve değişen uluslararası düzeni inceleyen bağımsız bir uluslararası ilişkiler yayınıdır.",
    publicationType: "Bağımsız uluslararası ilişkiler yayını",
    authorRole: "Editör ve Yazar",
    authorBio: "Zeynep Doruk, Statevera'nın kurucusu, editörü ve yazarıdır. Çalışmaları; uluslararası haberciliği birincil kaynak araştırmaları, veriye dayalı araçlar ve güvenlik, diplomasi, siyasi ekonomi ile değişen uluslararası düzene ilişkin özgün analizlerle bir araya getirir.",
    languageNav: "Dil",
    seeAll: "Tümünü gör",
    home: "Statevera ana sayfa",
    logoAlt: "STATEVERA logosu",
    search: "Ara",
    searchStatevera: "Statevera'da ara",
    openMenu: "Menüyü aç",
    sections: "Bölümler",
    rssFeed: "RSS akışı",
    nav: {
      journal: "Journal",
      risk: "GLORISK",
      sources: "Kaynaklar",
      news: "Haberler",
      allReporting: "Tüm haberler",
      regions: "Bölgeler",
      about: "Hakkında",
      live: "CANLI",
      editor: "EDİTÖR GİRİŞİ",
    },
    footer: {
      editedBy: "Editör ve yazar",
      founded: "kuruluş",
      email: "E-posta",
      news: "Haberler",
      journal: "Journal",
      analysis: "Analiz ve denemeler",
      theory: "Teori",
      primarySources: "Birincil Kaynaklar",
      about: "Hakkında",
      regions: "Bölgeler",
      sourcing: "Kaynak Kullanımı",
      rights: "Tüm hakları saklıdır.",
      sourceLead: "Haberler, kamuya açık RSS akışlarından derlenir:",
      sourceTail: "Statevera yalnızca başlıkları, kısa özetleri ve kaynak bilgisini yeniden yayımlar; her içerik, tüm hakları elinde tutan özgün yayıncıya bağlanır. Journal ve GLORISK, Statevera'nın özgün projeleridir; sorumlusu",
    },
  },
} as const;

export const navLabel = (url: string, language: SiteLanguage): string => {
  const copy = siteText[language].nav;
  const labels: Record<string, string> = {
    "/journal": copy.journal,
    "/risk": copy.risk,
    "/sources": copy.sources,
    "/wire": copy.news,
    "/wire/all": copy.allReporting,
    "/regions": copy.regions,
    "/about": copy.about,
    "/live": copy.live,
    "/editor": copy.editor,
  };
  if (url === "/wire") return copy.news;
  if (url.startsWith("/wire/")) {
    const slug = url.slice("/wire/".length) as DeskSlug;
    return slug in deskCopy[language] ? deskText(slug, language).name : url;
  }
  return labels[url] ?? url;
};

export const searchText = {
  en: {
    dialog: "Search Statevera",
    placeholder: "Search news, journal, countries, regions…",
    inputLabel: "Search",
    filterResults: "Filter results",
    all: "All",
    news: "News",
    journal: "Journal",
    navigate: "to navigate",
    open: "to open",
    press: "press",
    anywhere: "anywhere to search",
    prompt: "Search news and journal analysis — by headline, country, region or source.",
    noResults: "No results for",
    unavailable: "Search index unavailable.",
    kinds: { Opinion: "Opinion", Analysis: "Analysis", News: "News" },
    categories: {},
    regions: {},
  },
  tr: {
    dialog: "Statevera'da ara",
    placeholder: "Haber, Journal, ülke veya bölge ara…",
    inputLabel: "Ara",
    filterResults: "Sonuçları filtrele",
    all: "Tümü",
    news: "Haberler",
    journal: "Journal",
    navigate: "gezin",
    open: "aç",
    press: "aramak için",
    anywhere: "tuşuna bas",
    prompt: "Başlık, ülke, bölge veya kaynağa göre haber ve Journal analizi ara.",
    noResults: "Sonuç bulunamadı:",
    unavailable: "Arama dizinine ulaşılamıyor.",
    kinds: { Opinion: "Görüş", Analysis: "Analiz", News: "Haber" },
    categories: {
      Politics: "Siyaset",
      Diplomacy: "Diplomasi",
      Security: "Güvenlik",
      Economy: "Ekonomi",
      Geopolitics: "Jeopolitik",
      Theory: "Teori",
      Opinion: "Görüş",
    },
    regions: {
      Europe: "Avrupa",
      "Middle East": "Orta Doğu",
      Americas: "Amerika",
      "Asia-Pacific": "Asya-Pasifik",
      Africa: "Afrika",
      Eurasia: "Avrasya",
      Turkey: "Türkiye",
      Global: "Küresel",
    },
  },
} as const;
