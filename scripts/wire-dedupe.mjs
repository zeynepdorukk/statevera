// ============================================================
// STATEVERA WIRE — same-story detection
// ------------------------------------------------------------
// Two outlets covering one event almost never share a headline,
// so matching URLs or exact titles is not enough. Every item is
// reduced to a fingerprint — stemmed content words, proper-noun
// entities and adjacent word pairs — and items whose fingerprints
// agree inside a time window are treated as ONE story. Only the
// strongest copy of each story reaches the site.
//
// Used by scripts/fetch-wire.mjs (to filter) and
// scripts/check-content.mjs (to prove the snapshot stayed clean).
// ============================================================

/** Stories reported further apart than this are different events. */
export const SAME_STORY_HOURS = 36;

const STOPWORDS = new Set(
  `a an and are as at be been being but by for from had has have he her hers him his how
   in into is it its of off on onto or our ours out over she that the their theirs them
   then there these they this those to too under until up upon was were what when where
   which while who whom why will with within would you your yours i me my we us not no
   nor so than too very can could may might must shall should do does did done just also
   about after against all any because before between both during each few more most other
   some such only own same s t don now new news say says said report reports reported
   according amid amid update updates live latest video watch photos analysis`
    .split(/\s+/)
    .filter(Boolean)
);

/** Crude but predictable stemmer: only folds the endings that split one story in two. */
export function stemWord(word) {
  if (word.length > 5 && word.endsWith("ies")) return word.slice(0, -3) + "y";
  if (word.length > 5 && /(?:ses|shes|ches|xes)$/.test(word)) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss") && !word.endsWith("us")) {
    return word.slice(0, -1);
  }
  if (word.length > 6 && word.endsWith("ing")) return word.slice(0, -3);
  if (word.length > 5 && word.endsWith("ed")) return word.slice(0, -2);
  return word;
}

export function contentTokens(text) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(" ")
    .filter((w) => w.length > 2 && !STOPWORDS.has(w))
    .map(stemWord);
}

/**
 * Names and numbers carry the identity of an event ("Rafah", "Zelensky", "27").
 * Headline case means the first word is always capitalised, so the stopword
 * filter does the work of ignoring it.
 */
export function entityTokens(title) {
  const out = new Set();
  for (const [, word] of String(title ?? "").matchAll(/\b(\p{Lu}[\p{L}'\u2019-]{2,})/gu)) {
    const token = stemWord(word.toLowerCase());
    if (!STOPWORDS.has(token)) out.add(token);
  }
  for (const [num] of String(title ?? "").matchAll(/\b\d{2,}\b/g)) out.add(num);
  return out;
}

const urlKeyOf = (url) => String(url ?? "").replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase();

function fingerprint(item) {
  const title = contentTokens(item.title);
  const summary = contentTokens(item.summary).slice(0, 28);

  const weights = new Map();
  for (const t of title) weights.set(t, 1);
  for (const t of summary) if (!weights.has(t)) weights.set(t, 0.45);

  const bigrams = new Set();
  for (let i = 1; i < title.length; i++) bigrams.add(`${title[i - 1]} ${title[i]}`);

  const entities = entityTokens(item.title);

  return {
    item,
    weights,
    bigrams,
    entities,
    // Names from the summary too: some headlines describe an event without naming anyone.
    context: new Set([...entities, ...entityTokens(item.summary)]),
    exact: title.join(" "),
    urlKey: urlKeyOf(item.url),
    time: Date.parse(item.publishedAt) || 0,
    norm: 0,
    joinReason: "",
  };
}

/**
 * Inverse document frequency over the batch itself. Without it a busy topic
 * ("gaza", "tariff") would make every story about that topic look like the
 * same story; with it, only the words that single an event out carry weight.
 */
function buildIdf(prints) {
  const df = new Map();
  for (const p of prints) for (const token of p.weights.keys()) df.set(token, (df.get(token) ?? 0) + 1);
  const idf = new Map();
  for (const [token, count] of df) idf.set(token, Math.log((prints.length + 1) / (count + 0.5)));
  for (const p of prints) {
    let sum = 0;
    for (const [token, w] of p.weights) {
      const k = w * (idf.get(token) ?? 1);
      sum += k * k;
    }
    p.norm = Math.sqrt(sum);
  }
  return idf;
}

function cosine(a, b, idf) {
  if (!a.norm || !b.norm) return 0;
  const [small, large] = a.weights.size <= b.weights.size ? [a, b] : [b, a];
  let dot = 0;
  for (const [token, wa] of small.weights) {
    const wb = large.weights.get(token);
    if (wb === undefined) continue;
    const k = idf.get(token) ?? 1;
    dot += wa * wb * k * k;
  }
  return dot / (a.norm * b.norm);
}

const sharedCount = (a, b) => {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let n = 0;
  for (const v of small) if (large.has(v)) n++;
  return n;
};

/** Overlap measured against the smaller set, so a short headline still matches a long one. */
const containment = (a, b) => (a.size && b.size ? sharedCount(a, b) / Math.min(a.size, b.size) : 0);

/**
 * @returns {{same: boolean, why: string}}
 */
export function sameStory(a, b, idf) {
  if (a.urlKey && a.urlKey === b.urlKey) return { same: true, why: "same link" };
  if (a.exact && a.exact === b.exact) return { same: true, why: "same headline" };

  const hours = Math.abs(a.time - b.time) / 3600000;
  if (hours > SAME_STORY_HOURS) return { same: false, why: "" };

  const cos = cosine(a, b, idf);
  const ent = containment(a.entities, b.entities);
  const names = sharedCount(a.entities, b.entities);
  const big = containment(a.bigrams, b.bigrams);
  const ctx = containment(a.context, b.context);
  const ctxSize = Math.min(a.context.size, b.context.size);
  const detail = `cos ${cos.toFixed(2)} names ${names}/${ent.toFixed(2)} pairs ${big.toFixed(2)} ctx ${ctx.toFixed(2)}`;

  // Rewritten headline, same words.
  if (cos >= 0.58) return { same: true, why: `wording (${detail})` };
  // Strong wording overlap plus a shared cast.
  if (cos >= 0.45 && ent >= 0.6) return { same: true, why: `wording+actors (${detail})` };
  // Same event told from a different angle: one outlet reports it, another reacts to it.
  if (cos >= 0.38 && (ent >= 0.5 || (ctxSize >= 3 && ctx >= 0.6))) {
    return { same: true, why: `event (${detail})` };
  }
  // Every name in the shorter headline appears in the other one.
  if (cos >= 0.34 && ent >= 0.9 && names >= 1) return { same: true, why: `actors (${detail})` };
  // Headlines worded quite differently, but the reporting is about the same cast.
  if (cos >= 0.24 && ctxSize >= 3 && ctx >= 0.85) return { same: true, why: `subject (${detail})` };

  return { same: false, why: detail };
}

/** Which copy of a story deserves the slot: analysis over wire copy, illustrated over bare. */
function quality(item) {
  return (
    (item.weight ?? 1) * 2 +
    (item.image ? 1.5 : 0) +
    (item.summary ? 0.6 : 0) +
    Math.min(String(item.title ?? "").length, 140) / 500
  );
}

/**
 * Groups a batch into stories. An item is compared against every member of a
 * candidate cluster, and when it matches more than one cluster those clusters
 * are merged: without that, whichever copy happened to arrive first could split
 * one event into two entries that both reach the site.
 */
export function clusterStories(items) {
  const prints = items.map(fingerprint);
  const idf = buildIdf(prints);

  const clusters = [];
  const parent = [];
  const find = (i) => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]];
    return i;
  };

  const byToken = new Map();
  const byUrl = new Map();

  const rank = (p) => {
    const scored = [...p.weights].map((entry) => [entry[0], entry[1] * (idf.get(entry[0]) ?? 1)]);
    scored.sort((x, y) => y[1] - x[1]);
    return scored.slice(0, 10).map(([t]) => t);
  };

  for (const print of prints) {
    const keys = rank(print);
    const candidates = new Set();
    const viaUrl = byUrl.get(print.urlKey);
    if (viaUrl !== undefined) candidates.add(find(viaUrl));
    for (const key of keys) for (const index of byToken.get(key) ?? []) candidates.add(find(index));

    const matched = [];
    let why = "";
    for (const index of [...candidates].sort((x, y) => x - y)) {
      for (const member of clusters[index].members) {
        const verdict = sameStory(member, print, idf);
        if (verdict.same) {
          matched.push(index);
          why ||= verdict.why;
          break;
        }
      }
    }

    let home;
    if (matched.length) {
      home = matched[0];
      for (const other of matched.slice(1)) {
        parent[other] = home;
        clusters[home].members.push(...clusters[other].members);
        clusters[other].members = [];
      }
      print.joinReason = why;
      clusters[home].members.push(print);
    } else {
      home = clusters.length;
      parent.push(home);
      clusters.push({ members: [print] });
    }

    if (print.urlKey && !byUrl.has(print.urlKey)) byUrl.set(print.urlKey, home);
    for (const key of keys) {
      let bucket = byToken.get(key);
      if (!bucket) byToken.set(key, (bucket = new Set()));
      bucket.add(home);
    }
  }

  return clusters
    .filter((cluster) => cluster.members.length)
    .map((cluster) => {
      const fallback = cluster.members.find((p) => p.joinReason)?.joinReason || "same story";
      const ordered = [...cluster.members].sort(
        (a, b) => quality(b.item) - quality(a.item) || b.time - a.time
      );
      const [kept, ...rest] = ordered;
      return {
        kept: kept.item,
        duplicates: rest.map((p) => ({ item: p.item, reason: p.joinReason || fallback })),
      };
    });
}

/**
 * @returns {{items: any[], clusters: ReturnType<typeof clusterStories>, removed: number}}
 */
export function dedupeStories(items) {
  const clusters = clusterStories(items);
  const kept = clusters.map((c) => c.kept).sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  return { items: kept, clusters, removed: items.length - kept.length };
}
