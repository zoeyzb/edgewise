import "server-only";

import { ODDS_API_CONTRACT } from "@/lib/core/contracts";
import type { KalshiMarketSummary } from "@/lib/core/contracts";
import { isAllowedOddsSportKey } from "@/lib/core/market-types";

const SERIES_PREFIX_TO_SPORT: Array<{ prefix: string; sportKey: string }> = [
  { prefix: "KXNBAGAME", sportKey: "basketball_nba" },
  { prefix: "KXNBA", sportKey: "basketball_nba" },
  { prefix: "KXNFLGAME", sportKey: "americanfootball_nfl" },
  { prefix: "KXNFL", sportKey: "americanfootball_nfl" },
  { prefix: "KXNCAAFGAME", sportKey: "americanfootball_ncaaf" },
  { prefix: "KXNCAAF", sportKey: "americanfootball_ncaaf" },
  { prefix: "KXMLBGAME", sportKey: "baseball_mlb" },
  { prefix: "KXMLB", sportKey: "baseball_mlb" },
  { prefix: "KXNHLGAME", sportKey: "icehockey_nhl" },
  { prefix: "KXNHL", sportKey: "icehockey_nhl" },
  { prefix: "KXNCAAMBGAME", sportKey: "basketball_ncaab" },
  { prefix: "KXNCAAMB", sportKey: "basketball_ncaab" },
  { prefix: "KXWNBA", sportKey: "basketball_wnba" },
  { prefix: "KXEPL", sportKey: "soccer_epl" },
  { prefix: "KXMLS", sportKey: "soccer_usa_mls" },
  { prefix: "KXUCL", sportKey: "soccer_uefa_champs_league" },
  { prefix: "KXMMA", sportKey: "mma_mixed_martial_arts" },
  { prefix: "KXBOXING", sportKey: "boxing_boxing" },
  { prefix: "KXATP", sportKey: "tennis_atp" },
  { prefix: "KXWTA", sportKey: "tennis_wta" },
];

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
];

export function seriesTickerFromMarket(market: KalshiMarketSummary): string {
  if (market.series_ticker) return market.series_ticker.toUpperCase();
  const probe = `${market.event_ticker ?? ""} ${market.ticker}`.toUpperCase();
  const dash = probe.indexOf("-");
  if (dash > 0) return probe.slice(0, dash).trim();
  return probe.trim();
}

export function isLikelyNonSportsMarket(market: KalshiMarketSummary): boolean {
  const probe = `${market.event_ticker ?? ""} ${market.ticker} ${market.series_ticker ?? ""}`.toUpperCase();
  return NON_SPORTS_PREFIXES.some((p) => probe.includes(p));
}

export function inferOddsSportKeyFromKalshiMarket(
  market: KalshiMarketSummary
): string | null {
  if (isLikelyNonSportsMarket(market)) return null;

  const series = seriesTickerFromMarket(market);
  const probe = `${series} ${market.event_ticker ?? ""} ${market.ticker}`.toUpperCase();
  for (const { prefix, sportKey } of SERIES_PREFIX_TO_SPORT) {
    if (probe.includes(prefix)) return sportKey;
  }

  const title = (market.title ?? "").toLowerCase();
  if (/\bnba\b/.test(title)) return "basketball_nba";
  if (/\bnfl\b/.test(title)) return "americanfootball_nfl";
  if (/\bmlb\b/.test(title)) return "baseball_mlb";
  if (/\bnhl\b/.test(title)) return "icehockey_nhl";
  if (/\bncaaf\b/.test(title)) return "americanfootball_ncaaf";
  if (/\bncaab\b/.test(title)) return "basketball_ncaab";
  if (/\bwnba\b/.test(title)) return "basketball_wnba";
  if (/\bmls\b/.test(title)) return "soccer_usa_mls";
  if (/\bepl\b|\bpremier league\b/.test(title)) return "soccer_epl";
  if (/\buat\b|\bchampions league\b/.test(title)) return "soccer_uefa_champs_league";
  if (/\bufc\b|\bmma\b/.test(title)) return "mma_mixed_martial_arts";

  if (/\bvs\.?\b|\bv\.?\b|@/.test(title)) {
    return null;
  }

  return null;
}

export function oddsSportSupported(sportKey: string): boolean {
  return isAllowedOddsSportKey(sportKey);
}

export function listSupportedOddsSportKeys(): readonly string[] {
  return ODDS_API_CONTRACT.allowedSportKeys;
}

export function parseTeamsFromKalshiTitle(title: string): { teamA: string; teamB: string } | null {
  const vsMatch = title.match(/(.+?)\s+(?:vs\.?|v\.|@)\s+(.+)/i);
  if (vsMatch) {
    return { teamA: vsMatch[1]!.trim(), teamB: vsMatch[2]!.trim() };
  }
  const winMatch = title.match(/will\s+(.+?)\s+win/i);
  if (winMatch) {
    return { teamA: winMatch[1]!.trim(), teamB: "" };
  }
  const beatMatch = title.match(/will\s+(.+?)\s+beat\s+(.+?)(?:\?|$)/i);
  if (beatMatch) {
    return { teamA: beatMatch[1]!.trim(), teamB: beatMatch[2]!.trim() };
  }
  return null;
}
