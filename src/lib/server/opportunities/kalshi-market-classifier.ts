import "server-only";

import type { KalshiMarketSummary } from "@/lib/core/contracts";
import { seriesTickerFromMarket } from "@/lib/server/opportunities/sport-mapping";

export type KalshiMarketCategory = "sports" | "non_sports" | "unknown";

export const KALSHI_SPORTS_KEYWORDS = [
  "soccer",
  "tennis",
  "baseball",
  "basketball",
  "football",
  "golf",
  "mma",
  "esports",
  "cricket",
  "wimbledon",
  "world cup",
  "nba",
  "nfl",
  "mlb",
  "nhl",
  "ufc",
  "hockey",
  "ncaa",
  "mls",
  "epl",
  "atp",
  "wta",
  "boxing",
  "super bowl",
  "world series",
  "premier league",
  "champions league",
  "college football",
  "college basketball",
] as const;

const NON_SPORTS_PREFIXES = [
  "KXHIGH",
  "KXLOW",
  "KXRAIN",
  "KXINFL",
  "KXPRES",
  "KXCONG",
  "KXSEN",
  "KXFED",
  "KXGDP",
  "KXCPI",
  "KXUNEMP",
  "KXBTC",
  "KXETH",
  "KXCRYPTO",
  "KXSTOCK",
  "KXSPX",
  "KXNASDAQ",
];

const SPORTS_SERIES_HINTS = [
  "KXNBAGAME",
  "KXNBA",
  "KXNFLGAME",
  "KXNFL",
  "KXNCAAFGAME",
  "KXNCAAF",
  "KXMLBGAME",
  "KXMLB",
  "KXNHLGAME",
  "KXNHL",
  "KXNCAAMBGAME",
  "KXNCAAMB",
  "KXWNBA",
  "KXEPL",
  "KXMLS",
  "KXUCL",
  "KXMMA",
  "KXBOXING",
  "KXATP",
  "KXWTA",
  "KXGOLF",
  "KXESPORTS",
  "KXCRICKET",
  "KXSOCCER",
  "KXTENNIS",
];

export interface KalshiMarketClassification {
  category: KalshiMarketCategory;
  rejectReason: string | null;
  matchedHint: string | null;
}

export function classifyKalshiMarketCategory(market: KalshiMarketSummary): KalshiMarketClassification {
  const title = (market.title ?? "").toLowerCase();
  const series = seriesTickerFromMarket(market);
  const probe = `${series} ${market.event_ticker ?? ""} ${market.ticker} ${market.series_ticker ?? ""}`.toUpperCase();

  for (const prefix of NON_SPORTS_PREFIXES) {
    if (probe.includes(prefix)) {
      return {
        category: "non_sports",
        rejectReason: `non_sports_series_prefix:${prefix}`,
        matchedHint: null,
      };
    }
  }

  for (const hint of SPORTS_SERIES_HINTS) {
    if (probe.includes(hint)) {
      return { category: "sports", rejectReason: null, matchedHint: `series:${hint}` };
    }
  }

  for (const word of KALSHI_SPORTS_KEYWORDS) {
    if (title.includes(word) || probe.toLowerCase().includes(word)) {
      return { category: "sports", rejectReason: null, matchedHint: `keyword:${word}` };
    }
  }

  if (/\bvs\.?\b|\bv\.?\b|@/.test(title)) {
    return { category: "sports", rejectReason: null, matchedHint: "matchup_pattern" };
  }

  if (/\bwin\b|\bwinner\b|\bbeat\b|\bscore\b|\btotal\b|\bspread\b/.test(title)) {
    return { category: "sports", rejectReason: null, matchedHint: "sports_market_language" };
  }

  return {
    category: "unknown",
    rejectReason: "no_sports_keyword_or_series_match",
    matchedHint: null,
  };
}
