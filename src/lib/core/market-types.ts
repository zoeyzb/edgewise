/**
 * Market type detection and strategy-scope classification.
 * Unsupported types may appear as WATCH or UNCONFIRMED — never BETTABLE.
 */

import { MATCH_BLOCK_CODES, ODDS_API_CONTRACT } from "@/lib/core/contracts";
import type {
  DetectedMarketType,
  MarketTypeLevel,
  StrategyScopeVerdict,
} from "@/lib/core/types";

const MONEYLINE_PATTERNS = [
  /\bwinner\b/i,
  /\bwin\b/i,
  /\bmoneyline\b/i,
  /\bto beat\b/i,
  /\bvs\.?\b/i,
  /\b@\b/,
];

const SPREAD_PATTERNS = [
  /\bspread\b/i,
  /\bcover\b/i,
  /\bhandicap\b/i,
  /[+-]\d+\.?\d*\s*(points?|pts?)?/i,
];

const TOTAL_PATTERNS = [
  /\btotal\b/i,
  /\bover\/under\b/i,
  /\bo\/u\b/i,
  /\bover\b/i,
  /\bunder\b/i,
  /\bcombined score\b/i,
];

const EXCLUDED_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\bprop\b/i, reason: "player prop" },
  { pattern: /\bplayer\b/i, reason: "player market" },
  { pattern: /\bfirst scorer\b/i, reason: "player prop" },
  { pattern: /\banytime\b/i, reason: "player prop" },
  { pattern: /\bmvp\b/i, reason: "award market" },
  { pattern: /\baward\b/i, reason: "award market" },
  { pattern: /\boutright\b/i, reason: "outright/future" },
  { pattern: /\bchampion\b/i, reason: "future/outright" },
  { pattern: /\bseries winner\b/i, reason: "series market" },
  { pattern: /\bmake playoffs\b/i, reason: "future" },
  { pattern: /\bparlay\b/i, reason: "parlay" },
  { pattern: /\bfirst half\b/i, reason: "partial game scope" },
  { pattern: /\b1st half\b/i, reason: "partial game scope" },
  { pattern: /\bsecond half\b/i, reason: "partial game scope" },
  { pattern: /\b1st quarter\b/i, reason: "partial period scope" },
  { pattern: /\bfirst quarter\b/i, reason: "partial period scope" },
  { pattern: /\bteam total\b/i, reason: "team total vs game total" },
];

const PARTIAL_SCOPE_PATTERNS = [
  /\bfirst half\b/i,
  /\b1st half\b/i,
  /\bsecond half\b/i,
  /\bquarter\b/i,
  /\bperiod\b/i,
  /\binning\b/i,
];

export function isAllowedOddsSportKey(sportKey: string): boolean {
  return (ODDS_API_CONTRACT.allowedSportKeys as readonly string[]).includes(sportKey);
}

export function detectKalshiMarketType(input: {
  title: string;
  ticker?: string;
  eventTicker?: string;
}): DetectedMarketType {
  const title = input.title.trim();
  const ticker = (input.ticker ?? "").toLowerCase();

  for (const { pattern, reason } of EXCLUDED_PATTERNS) {
    if (pattern.test(title) || pattern.test(ticker)) {
      return {
        kind: "EXCLUDED",
        category: reason.includes("prop")
          ? "PLAYER_PROP"
          : reason.includes("future") || reason.includes("outright")
            ? "FUTURE"
            : reason.includes("award")
              ? "AWARD"
              : reason.includes("parlay")
                ? "PARLAY"
                : reason.includes("partial") || reason.includes("period")
                  ? "PARTIAL_SCOPE"
                  : "VAGUE",
        level: "LEVEL_4_BLOCKED",
        exclusionReason: reason,
      };
    }
  }

  if (MONEYLINE_PATTERNS.some((p) => p.test(title))) {
    return { kind: "MONEYLINE", category: "WINNER", level: "LEVEL_1_DIRECT_COMPARABLE" };
  }

  if (TOTAL_PATTERNS.some((p) => p.test(title))) {
    const isPartial = PARTIAL_SCOPE_PATTERNS.some((p) => p.test(title));
    return {
      kind: "TOTAL",
      category: isPartial ? "PARTIAL_TOTAL" : "GAME_TOTAL",
      level: isPartial ? "LEVEL_4_BLOCKED" : "LEVEL_2_MODEL_ASSISTED",
      exclusionReason: isPartial ? "partial game total scope" : undefined,
    };
  }

  if (SPREAD_PATTERNS.some((p) => p.test(title))) {
    const isPartial = PARTIAL_SCOPE_PATTERNS.some((p) => p.test(title));
    return {
      kind: "SPREAD",
      category: isPartial ? "PARTIAL_SPREAD" : "GAME_SPREAD",
      level: isPartial ? "LEVEL_4_BLOCKED" : "LEVEL_2_MODEL_ASSISTED",
      exclusionReason: isPartial ? "partial game spread scope" : undefined,
    };
  }

  return {
    kind: "UNCLEAR",
    category: "VAGUE",
    level: "LEVEL_3_WATCH_ONLY",
    exclusionReason: "market type not deterministically classified",
  };
}

export function detectOddsMarketType(marketKey: string): DetectedMarketType {
  const key = marketKey.toLowerCase();

  if (key === ODDS_API_CONTRACT.marketKeys.moneyline) {
    return { kind: "MONEYLINE", category: "WINNER", level: "LEVEL_1_DIRECT_COMPARABLE" };
  }
  if (key === ODDS_API_CONTRACT.marketKeys.spreads) {
    return { kind: "SPREAD", category: "GAME_SPREAD", level: "LEVEL_2_MODEL_ASSISTED" };
  }
  if (key === ODDS_API_CONTRACT.marketKeys.totals) {
    return { kind: "TOTAL", category: "GAME_TOTAL", level: "LEVEL_2_MODEL_ASSISTED" };
  }

  if (
    (ODDS_API_CONTRACT.marketKeys.unconfirmed as readonly string[]).includes(key) ||
    key.includes("outright") ||
    key.includes("prop")
  ) {
    return {
      kind: "EXCLUDED",
      category: key.includes("prop") ? "PLAYER_PROP" : "FUTURE",
      level: "LEVEL_4_BLOCKED",
      exclusionReason: `unsupported odds market key: ${key}`,
    };
  }

  return {
    kind: "UNCLEAR",
    category: "VAGUE",
    level: "LEVEL_3_WATCH_ONLY",
    exclusionReason: `unrecognized odds market key: ${key}`,
  };
}

export function classifyCombinedMarketLevel(
  kalshiType: DetectedMarketType,
  oddsType: DetectedMarketType
): MarketTypeLevel {
  const levels: MarketTypeLevel[] = [kalshiType.level, oddsType.level];
  if (levels.includes("LEVEL_4_BLOCKED")) return "LEVEL_4_BLOCKED";
  if (levels.includes("LEVEL_3_WATCH_ONLY")) return "LEVEL_3_WATCH_ONLY";
  if (levels.includes("LEVEL_2_MODEL_ASSISTED")) return "LEVEL_2_MODEL_ASSISTED";
  return "LEVEL_1_DIRECT_COMPARABLE";
}

export function evaluateStrategyScope(input: {
  sportKey: string;
  kalshiType: DetectedMarketType;
  isLive?: boolean;
}): StrategyScopeVerdict {
  if (!isAllowedOddsSportKey(input.sportKey)) {
    return {
      inScope: false,
      blockCode: MATCH_BLOCK_CODES.STRATEGY_SCOPE_EXCLUDED,
      reason: `sport key ${input.sportKey} outside Edgewise sports scope`,
    };
  }

  if (input.kalshiType.level === "LEVEL_4_BLOCKED" || input.kalshiType.kind === "EXCLUDED") {
    return {
      inScope: false,
      blockCode: MATCH_BLOCK_CODES.MARKET_TYPE_BLOCKED,
      reason: input.kalshiType.exclusionReason ?? "excluded market type",
    };
  }

  if (input.isLive && input.kalshiType.level === "LEVEL_3_WATCH_ONLY") {
    return {
      inScope: false,
      blockCode: MATCH_BLOCK_CODES.STRATEGY_SCOPE_EXCLUDED,
      reason: "live trading requires deterministic market type",
    };
  }

  return { inScope: true };
}

export function maxDecisionForMarketLevel(
  level: MarketTypeLevel,
  settlementExact: boolean
): "BETTABLE" | "WATCH" | "BLOCKED" | "UNCONFIRMED" {
  switch (level) {
    case "LEVEL_1_DIRECT_COMPARABLE":
      return settlementExact ? "BETTABLE" : "UNCONFIRMED";
    case "LEVEL_2_MODEL_ASSISTED":
      return settlementExact ? "BETTABLE" : "WATCH";
    case "LEVEL_3_WATCH_ONLY":
      return "WATCH";
    case "LEVEL_4_BLOCKED":
      return "BLOCKED";
    default:
      return "UNCONFIRMED";
  }
}
