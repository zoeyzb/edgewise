import "server-only";

import type { KalshiMarketSummary } from "@/lib/core/contracts";
import { seriesTickerFromMarket } from "@/lib/server/opportunities/sport-mapping";

export type KalshiMarketCategory = "sports" | "non_sports" | "unknown";

export type KalshiSportLabel =
  | "soccer"
  | "tennis"
  | "baseball"
  | "basketball"
  | "football"
  | "golf"
  | "mma"
  | "esports"
  | "cricket"
  | "unknown";

const ESPORTS_TITLE_PATTERN =
  /\besports\b|\be-sports\b|\bvalorant\b|\bleague of legends\b|\blol\b|\bdota\b|\bcs2\b|\bcsgo\b|\bcounter-strike\b|\boverwatch\b/i;

const SERIES_SPORT: Array<{ pattern: RegExp; label: KalshiSportLabel }> = [
  { pattern: /\bKXNBAGAME\b|\bKXNBA\b|\bKXWNBA\b|\bKXNCAAMB\b|\bKXNCAAMBGAME\b/, label: "basketball" },
  { pattern: /\bKXNFLGAME\b|\bKXNFL\b|\bKXNCAAFGAME\b|\bKXNCAAF\b|\bKXSB\b/, label: "football" },
  { pattern: /\bKXMLBGAME\b|\bKXMLB\b/, label: "baseball" },
  { pattern: /\bKXEPL\b|\bKXMLS\b|\bKXUCL\b|\bKXSOCCER\b|\bKXMLSGAME\b|\bKXFIFA\b/, label: "soccer" },
  { pattern: /\bKXATP\b|\bKXWTA\b|\bKXTENNIS\b|\bKXWIMB\b/, label: "tennis" },
  { pattern: /\bKXGOLF\b|\bKXPGA\b|\bKXLIVG\b/, label: "golf" },
  { pattern: /\bKXMMA\b|\bKXBOXING\b|\bKXUFC\b/, label: "mma" },
  { pattern: /\bKXCRICKET\b|\bKXIPL\b/, label: "cricket" },
];

const TITLE_SPORT: Array<{ pattern: RegExp; label: KalshiSportLabel }> = [
  { pattern: /\bnba\b|\bbasketball\b|\bwnba\b|\bncaab\b/, label: "basketball" },
  { pattern: /\bnfl\b|\bfootball\b|\bncaaf\b|\bsuper bowl\b/, label: "football" },
  { pattern: /\bmlb\b|\bbaseball\b|\bworld series\b/, label: "baseball" },
  { pattern: /\bsoccer\b|\bmls\b|\bepl\b|\bpremier league\b|\bchampions league\b|\bworld cup\b|\bfifa\b/, label: "soccer" },
  { pattern: /\btennis\b|\bwimbledon\b|\batp\b|\bwta\b/, label: "tennis" },
  { pattern: /\bgolf\b|\bpga\b|\bliv golf\b/, label: "golf" },
  { pattern: /\bufc\b|\bmma\b|\bboxing\b/, label: "mma" },
  { pattern: /\bcricket\b|\bipl\b/, label: "cricket" },
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
  "KXBTC",
  "KXETH",
  "KXCRYPTO",
  "KXSTOCK",
  "KXSPX",
  "KXNASDAQ",
];

export interface KalshiMarketClassification {
  category: KalshiMarketCategory;
  rejectReason: string | null;
  matchedHint: string | null;
}

function marketText(market: KalshiMarketSummary): string {
  return [
    market.title ?? "",
    market.subtitle ?? "",
    market.primary_participant_key ?? "",
  ]
    .join(" ")
    .toLowerCase();
}

function marketProbe(market: KalshiMarketSummary): string {
  const series = seriesTickerFromMarket(market);
  return `${series} ${market.event_ticker ?? ""} ${market.ticker} ${market.series_ticker ?? ""}`.toUpperCase();
}

export function classifyKalshiSportLabel(market: KalshiMarketSummary): KalshiSportLabel {
  const probe = marketProbe(market);
  const text = marketText(market);

  for (const { pattern, label } of SERIES_SPORT) {
    if (pattern.test(probe)) return label;
  }

  for (const { pattern, label } of TITLE_SPORT) {
    if (pattern.test(text)) return label;
  }

  if (ESPORTS_TITLE_PATTERN.test(text)) return "esports";

  return "unknown";
}

export function classifyKalshiMarketCategory(market: KalshiMarketSummary): KalshiMarketClassification {
  const probe = marketProbe(market);
  const text = marketText(market);

  for (const prefix of NON_SPORTS_PREFIXES) {
    if (probe.includes(prefix)) {
      return {
        category: "non_sports",
        rejectReason: `non_sports_series_prefix:${prefix}`,
        matchedHint: null,
      };
    }
  }

  const sportLabel = classifyKalshiSportLabel(market);
  if (sportLabel !== "unknown") {
    return { category: "sports", rejectReason: null, matchedHint: sportLabel };
  }

  if (/\bvs\.?\b|\bv\.?\b|@/.test(text)) {
    return { category: "sports", rejectReason: null, matchedHint: "matchup_pattern" };
  }

  if (/\bwin\b|\bwinner\b|\bbeat\b|\bscore\b|\btotal\b|\bspread\b/.test(text)) {
    return { category: "sports", rejectReason: null, matchedHint: "sports_market_language" };
  }

  return {
    category: "unknown",
    rejectReason: "no_sports_keyword_or_series_match",
    matchedHint: null,
  };
}
