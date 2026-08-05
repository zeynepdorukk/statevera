// ============================================================
// STATEVERA WIRE — source registry & classification vocabulary
// ------------------------------------------------------------
// Free, key-less, public RSS feeds from established outlets and
// institutions. Statevera stores only headline, summary, source
// and link; every item drives traffic back to the publisher.
//
// `category` / `region` are priors. A feed WITHOUT a `category`
// is a general news desk: its items must earn their place by
// matching the international-affairs vocabulary below.
// ============================================================

/**
 * @typedef {object} WireSource
 * @property {string} id
 * @property {string} publisher
 * @property {string} url        RSS/Atom endpoint
 * @property {string} home       publisher section homepage
 * @property {string} [category] on-topic feeds only: skips the relevance gate
 * @property {string} [region]
 * @property {number} weight     1 = wire copy, 3 = considered analysis
 * @property {number} take       max items kept from this feed
 */

/** @type {WireSource[]} */
export const sources = [
  // ---- General international desks -------------------------
  { id: "guardian-world", publisher: "The Guardian", url: "https://www.theguardian.com/world/rss", home: "https://www.theguardian.com/world", region: "Global", weight: 2, take: 14 },
  { id: "bbc-world", publisher: "BBC News", url: "https://feeds.bbci.co.uk/news/world/rss.xml", home: "https://www.bbc.com/news/world", region: "Global", weight: 2, take: 12 },
  { id: "aljazeera", publisher: "Al Jazeera", url: "https://www.aljazeera.com/xml/rss/all.xml", home: "https://www.aljazeera.com", region: "Global", weight: 2, take: 12 },
  { id: "dw", publisher: "Deutsche Welle", url: "https://rss.dw.com/rdf/rss-en-all", home: "https://www.dw.com/en", region: "Europe", weight: 2, take: 10 },
  { id: "france24", publisher: "France 24", url: "https://www.france24.com/en/rss", home: "https://www.france24.com/en", region: "Global", weight: 2, take: 8 },
  { id: "npr-world", publisher: "NPR", url: "https://feeds.npr.org/1004/rss.xml", home: "https://www.npr.org/sections/world", region: "Global", weight: 2, take: 6 },

  // ---- Regional desks --------------------------------------
  { id: "guardian-europe", publisher: "The Guardian", url: "https://www.theguardian.com/world/europe-news/rss", home: "https://www.theguardian.com/world/europe-news", region: "Europe", weight: 2, take: 10 },
  { id: "bbc-europe", publisher: "BBC News", url: "https://feeds.bbci.co.uk/news/world/europe/rss.xml", home: "https://www.bbc.com/news/world/europe", region: "Europe", weight: 2, take: 8 },
  { id: "guardian-mideast", publisher: "The Guardian", url: "https://www.theguardian.com/world/middleeast/rss", home: "https://www.theguardian.com/world/middleeast", region: "Middle East", weight: 2, take: 10 },
  { id: "bbc-mideast", publisher: "BBC News", url: "https://feeds.bbci.co.uk/news/world/middle_east/rss.xml", home: "https://www.bbc.com/news/world/middle_east", region: "Middle East", weight: 2, take: 8 },
  { id: "guardian-asia", publisher: "The Guardian", url: "https://www.theguardian.com/world/asia-pacific/rss", home: "https://www.theguardian.com/world/asia-pacific", region: "Asia-Pacific", weight: 2, take: 10 },
  { id: "diplomat", publisher: "The Diplomat", url: "https://thediplomat.com/feed/", home: "https://thediplomat.com", region: "Asia-Pacific", category: "Geopolitics", weight: 3, take: 10 },
  { id: "guardian-africa", publisher: "The Guardian", url: "https://www.theguardian.com/world/africa/rss", home: "https://www.theguardian.com/world/africa", region: "Africa", weight: 2, take: 8 },
  { id: "bbc-africa", publisher: "BBC News", url: "https://feeds.bbci.co.uk/news/world/africa/rss.xml", home: "https://www.bbc.com/news/world/africa", region: "Africa", weight: 2, take: 6 },
  { id: "guardian-us", publisher: "The Guardian", url: "https://www.theguardian.com/us-news/rss", home: "https://www.theguardian.com/us-news", region: "Americas", weight: 2, take: 8 },
  { id: "anadolu-politics", publisher: "Anadolu Agency", url: "https://www.aa.com.tr/en/rss/default?cat=politics", home: "https://www.aa.com.tr/en", region: "Turkey", category: "Politics", weight: 2, take: 10 },

  // ---- Political economy -----------------------------------
  { id: "guardian-economics", publisher: "The Guardian", url: "https://www.theguardian.com/business/economics/rss", home: "https://www.theguardian.com/business/economics", category: "Economy", region: "Global", weight: 2, take: 8 },
  { id: "bbc-business", publisher: "BBC News", url: "https://feeds.bbci.co.uk/news/business/rss.xml", home: "https://www.bbc.com/news/business", category: "Economy", region: "Global", weight: 2, take: 8 },

  // ---- Institutions ----------------------------------------
  { id: "un-news", publisher: "UN News", url: "https://news.un.org/feed/subscribe/en/news/all/rss.xml", home: "https://news.un.org/en", category: "Diplomacy", region: "Global", weight: 2, take: 10 },

  // ---- Analysis & commentary -------------------------------
  { id: "war-on-the-rocks", publisher: "War on the Rocks", url: "https://warontherocks.com/feed/", home: "https://warontherocks.com", category: "Security", region: "Global", weight: 3, take: 8 },
  { id: "responsible-statecraft", publisher: "Responsible Statecraft", url: "https://responsiblestatecraft.org/feed/", home: "https://responsiblestatecraft.org", category: "Diplomacy", region: "Global", weight: 3, take: 8 },
  { id: "atlantic-council", publisher: "Atlantic Council", url: "https://www.atlanticcouncil.org/feed/", home: "https://www.atlanticcouncil.org", category: "Geopolitics", region: "Global", weight: 3, take: 8 },
  { id: "politico-eu", publisher: "POLITICO Europe", url: "https://www.politico.eu/feed/", home: "https://www.politico.eu", category: "Politics", region: "Europe", weight: 2, take: 8 },
];

// ------------------------------------------------------------
// Classification vocabulary
// ------------------------------------------------------------
// Terms match on word boundaries. A trailing "*" makes the term a
// prefix ("sanction*" covers sanction/sanctions/sanctioned).
// Prefixes are kept conservative on purpose: "mediat*" would also
// match "medication", so such stems are spelled out instead.

export const categoryRules = [
  {
    category: "Security",
    terms: [
      "nato", "military", "defence", "defense", "missile*", "nuclear", "warhead*",
      "troops", "army", "navy", "naval", "air force", "airstrike*", "air strike*",
      "drone*", "ceasefire", "cease-fire", "offensive", "deterrence", "deterrent",
      "rearm*", "weapon*", "arms control", "arms deal", "insurgen*", "militant*",
      "war", "warfare", "wartime", "conscript*", "battalion*", "brigade*", "frigate*",
      "submarine*", "artillery", "bombard*", "combat", "peacekeep*", "paramilitary",
      "ballistic", "cyberattack*", "espionage", "airspace", "warship*",
    ],
  },
  {
    category: "Economy",
    terms: [
      "sanction*", "tariff*", "trade", "trading", "export*", "import*", "inflation",
      "central bank", "interest rate*", "gdp", "recession", "imf", "world bank",
      "supply chain*", "oil price*", "energy price*", "gas price*", "opec", "currenc*",
      "bond market", "sovereign debt", "budget", "subsid*", "semiconductor*",
      "chipmaker*", "commodit*", "shipping", "freight", "pipeline*", "embargo*",
      "economic", "economy", "exchange rate*", "investment", "lng", "trade deal",
    ],
  },
  {
    category: "Diplomacy",
    terms: [
      "diplomat", "diplomats", "diplomatic", "diplomacy", "summit", "talks",
      "negotiation*", "negotiator*", "negotiate", "negotiating", "negotiated",
      "treaty", "accord*", "united nations", "security council", "envoy*",
      "ambassador*", "foreign minister*", "foreign secretary", "peace deal",
      "peace plan", "mediation", "mediator*", "mediate", "mediated", "delegation*",
      "bilateral", "multilateral", "communique", "embassy", "consulate", "state visit",
      "normalisation", "normalization", "ratif*", "memorandum", "extradit*",
    ],
  },
  {
    category: "Geopolitics",
    terms: [
      "geopolitic*", "sphere of influence", "great power*", "balance of power",
      "alliance*", "hegemon*", "strategic", "chokepoint*", "strait", "corridor*",
      "belt and road", "indo-pacific", "multipolar", "influence operation*", "proxy",
      "sovereignty", "territorial", "border dispute*", "annex*", "realign*",
    ],
  },
  {
    category: "Politics",
    terms: [
      "election*", "parliament*", "president", "presidential", "prime minister",
      "chancellor", "coalition", "referendum", "ballot", "cabinet", "protest*", "coup",
      "impeach*", "ruling party", "legislat*", "senate", "congress", "opposition leader",
      "government", "minister*", "lawmaker*", "constitution*", "autocra*", "democra*",
      "primary", "foreign policy",
    ],
  },
  {
    category: "Culture",
    terms: [
      "museum*", "heritage", "soft power", "diaspora", "religious", "memorial",
      "artefact*", "artifact*", "language policy", "cultural",
    ],
  },
];

/** Region terms. Scored, not first-match — see the classifier. */
export const regionRules = [
  {
    region: "Turkey",
    terms: [
      "turkey", "türkiye", "turkish", "ankara", "istanbul", "erdogan", "erdoğan",
      "bosphorus", "bosporus", "anatolia",
    ],
  },
  {
    region: "Middle East",
    terms: [
      "israel*", "palestin*", "gaza", "west bank", "iran", "iranian", "tehran", "saudi",
      "riyadh", "qatar*", "doha", "uae", "emirates", "dubai", "abu dhabi", "iraq*",
      "baghdad", "syria*", "damascus", "lebanon", "lebanese", "beirut", "yemen*",
      "houthi*", "jordan", "kuwait*", "bahrain*", "oman", "omani", "hormuz", "red sea",
      "middle east", "gulf states", "hezbollah", "hamas", "egypt*", "cairo",
    ],
  },
  {
    region: "Eurasia",
    terms: [
      "russia*", "moscow", "kremlin", "putin", "ukrain*", "kyiv", "kiev", "zelensky*",
      "belarus*", "minsk", "kazakh*", "uzbek*", "armenia*", "azerbaijan*", "baku",
      "yerevan", "tbilisi", "caucasus", "central asia", "crimea*", "donbas", "donetsk",
    ],
  },
  {
    region: "Asia-Pacific",
    terms: [
      "china", "chinese", "beijing", "shanghai", "taiwan*", "taipei", "japan*", "tokyo",
      "korea*", "seoul", "pyongyang", "india", "indian", "delhi", "pakistan*",
      "islamabad", "kashmir", "philippine*", "manila", "vietnam*", "hanoi",
      "indonesia*", "jakarta", "thailand", "malaysia*", "singapore", "australia*",
      "canberra", "new zealand", "myanmar", "bangladesh*", "south china sea",
      "indo-pacific", "asean", "hong kong", "mekong", "nepal", "sri lanka", "afghan*",
      "kabul",
    ],
  },
  {
    region: "Africa",
    terms: [
      "africa", "african", "nigeria*", "abuja", "lagos", "kenya*", "nairobi",
      "ethiopia*", "addis ababa", "south africa*", "pretoria", "johannesburg", "sudan*",
      "khartoum", "sahel", "mali", "niger", "burkina faso", "congo", "kinshasa",
      "somalia*", "mogadishu", "libya*", "tripoli", "tunisia*", "algeria*", "morocc*",
      "rabat", "ghana", "senegal", "zimbabwe", "uganda", "rwanda", "mozambique",
      "african union",
    ],
  },
  {
    region: "Americas",
    terms: [
      "united states", "washington", "white house", "pentagon", "trump", "biden",
      "canada", "canadian", "ottawa", "mexico", "mexican", "brazil*", "brasilia",
      "argentina", "buenos aires", "venezuela*", "caracas", "colombia*", "bogota",
      "chile", "peru", "cuba", "havana", "haiti", "latin america", "state department",
      "american", "michigan", "california", "texas",
    ],
  },
  {
    region: "Europe",
    terms: [
      "europe", "european", "european union", "brussels", "germany", "german", "berlin",
      "france", "french", "paris", "italy", "italian", "rome", "spain", "spanish",
      "madrid", "poland", "polish", "warsaw", "netherlands", "dutch", "the hague",
      "belgium", "sweden", "swedish", "stockholm", "finland", "finnish", "helsinki",
      "norway", "oslo", "denmark", "danish", "copenhagen", "britain", "british",
      "london", "westminster", "ireland", "irish", "dublin", "portugal", "lisbon",
      "greece", "greek", "athens", "austria", "vienna", "hungary", "budapest", "czech",
      "prague", "slovak*", "romania*", "bucharest", "bulgaria*", "baltic", "estonia*",
      "latvia*", "lithuania*", "balkan*", "serbia*", "kosovo", "croatia*",
      "switzerland", "swiss", "geneva", "bern",
    ],
  },
];

/**
 * Hard exclusions. A general news desk carries plenty of material that is
 * simply not international affairs; these terms disqualify an item outright,
 * whatever else it matched.
 */
export const excludeTerms = [
  "murder trial", "homicide", "manslaughter", "jury", "prosecutor", "toxicologist",
  "sentenced to", "paedophile", "pedophile", "rape", "stabbing", "shoplift*",
  "celebrit*", "kardashian", "influencer", "reality tv", "box office", "grammy",
  "oscars", "eurovision", "netflix", "album", "tour dates", "red carpet",
  "football", "soccer", "premier league", "olympic*", "world cup", "tennis",
  "cricket", "formula one", "nba", "nfl", "golf", "rugby", "athlete*",
  "recipe", "horoscope", "weather forecast", "heatwave warning", "lottery",
  "crossword", "obituar*", "royal family", "wedding", "divorce",
];

/** Compile a term list into one word-boundary regex. */
export function compileTerms(terms) {
  const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = terms.map((term) => {
    const prefix = term.endsWith("*");
    const body = escape(prefix ? term.slice(0, -1) : term);
    return prefix ? `${body}[a-z]*` : body;
  });
  return new RegExp(`(?<![a-z])(?:${parts.join("|")})(?![a-z])`, "gi");
}
