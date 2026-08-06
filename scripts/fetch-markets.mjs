import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const OUT = resolve(ROOT, "src/data/markets.json");
const TIMEOUT_MS = 10000;

const indices = [
  { id: "spx", label: "SPX", symbol: "^GSPC", decimals: 2 },
  { id: "ixic", label: "IXIC", symbol: "^IXIC", decimals: 2 },
  { id: "dji", label: "DJI", symbol: "^DJI", decimals: 2 },
  { id: "stoxx", label: "STOXX", symbol: "^STOXX50E", decimals: 2 },
  { id: "ftse", label: "FTSE", symbol: "^FTSE", decimals: 2 },
  { id: "n225", label: "N225", symbol: "^N225", decimals: 2 },
  { id: "bist", label: "BIST100", symbol: "XU100.IS", decimals: 2 },
  { id: "hsi", label: "HANG SENG", symbol: "^HSI", decimals: 2 },
  { id: "kospi", label: "KOSPI", symbol: "^KS11", decimals: 2 },
  { id: "shanghai", label: "SHANGHAI", symbol: "000001.SS", decimals: 2 },
  { id: "brent", label: "BRENT", symbol: "BZ=F", decimals: 2 },
  { id: "gold", label: "GOLD", symbol: "GC=F", decimals: 2 },
  { id: "wti", label: "WTI", symbol: "CL=F", decimals: 2 },
  { id: "copper", label: "COPPER", symbol: "HG=F", decimals: 2 },
  { id: "usdtry", label: "USD/TRY", symbol: "USDTRY=X", decimals: 2 },
  { id: "eurusd", label: "EUR/USD", symbol: "EURUSD=X", decimals: 4 },
  { id: "usdjpy", label: "USD/JPY", symbol: "JPY=X", decimals: 2 },
  { id: "us10y", label: "US 10Y", symbol: "^TNX", decimals: 2 },
];

const previous = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : { quotes: [] };
const previousById = new Map((previous.quotes ?? []).map((quote) => [quote.id, quote]));

async function fetchQuote(index) {
  const endpoint = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(index.symbol)}?interval=1d&range=1d`;
  const response = await fetch(endpoint, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { "User-Agent": "Mozilla/5.0 (compatible; StateveraMarkets/1.0)" },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const result = (await response.json()).chart?.result?.[0];
  const meta = result?.meta;
  const price = Number(meta?.regularMarketPrice);
  const previousClose = Number(meta?.chartPreviousClose ?? meta?.previousClose);
  if (!Number.isFinite(price) || !Number.isFinite(previousClose) || previousClose === 0) {
    throw new Error("quote unavailable");
  }

  const change = price - previousClose;
  return {
    ...index,
    price,
    change,
    percent: (change / previousClose) * 100,
    updatedAt: new Date(Number(meta.regularMarketTime) * 1000).toISOString(),
  };
}

const results = await Promise.allSettled(indices.map(fetchQuote));
const quotes = results.map((result, index) => {
  if (result.status === "fulfilled") return result.value;
  const old = previousById.get(indices[index].id);
  console.log(`  ${indices[index].label}: ${result.reason?.message ?? "unavailable"}`);
  return old;
}).filter(Boolean);

if (quotes.length === 0) {
  console.log("No market quotes available; keeping the previous snapshot.");
  process.exit(0);
}

const payload = {
  updatedAt: quotes.map((quote) => quote.updatedAt).sort().at(-1),
  quotes,
};

if (JSON.stringify(payload) === JSON.stringify(previous)) {
  console.log("No market changes.");
} else {
  writeFileSync(OUT, JSON.stringify(payload, null, 2) + "\n", "utf8");
  console.log(`Wrote ${quotes.length} market quotes.`);
}
