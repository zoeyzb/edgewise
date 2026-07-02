/**
 * Settlement scope parsing and cross-provider verification.
 * Never guess settlement — ambiguous mappings are blocked.
 */

import { MATCH_BLOCK_CODES, UNCONFIRMED_MARKER } from "@/lib/core/contracts";
import type {
  DetectedMarketType,
  SettlementScope,
  SettlementVerification,
} from "@/lib/core/types";

const REGULATION_ONLY = /\bregulation\b|\breg\.?\s*time\b|\bno overtime\b/i;
const OVERTIME_INCLUDED = /\bovertime\b|\bincluding ot\b|\bincl\.?\s*ot\b|\bwith ot\b/i;
const SERIES = /\bseries\b|\bbest of\b|\bto advance\b/i;
const FIRST_HALF = /\bfirst half\b|\b1st half\b|\b1h\b/i;
const FULL_GAME = /\bfull game\b|\bgame total\b|\bfinal score\b|\bwinner\b/i;
const TEAM_TOTAL = /\bteam total\b|\bhome total\b|\baway total\b/i;

export function parseKalshiSettlementScope(title: string): SettlementScope {
  const text = title.trim();

  let period: SettlementScope["period"] = "FULL_GAME";
  if (FIRST_HALF.test(text)) period = "FIRST_HALF";
  else if (/\bfirst quarter\b|\b1st quarter\b|\b1q\b/i.test(text)) period = "FIRST_QUARTER";
  else if (/\bsecond half\b|\b2nd half\b/i.test(text)) period = "SECOND_HALF";
  else if (SERIES.test(text)) period = "SERIES";
  else if (!FULL_GAME.test(text) && TEAM_TOTAL.test(text)) period = "TEAM_SEGMENT";

  let overtimeRule: SettlementScope["overtimeRule"] = "UNSPECIFIED";
  if (REGULATION_ONLY.test(text)) overtimeRule = "REGULATION_ONLY";
  else if (OVERTIME_INCLUDED.test(text)) overtimeRule = "OVERTIME_INCLUDED";

  let metric: SettlementScope["metric"] = "WINNER";
  if (TEAM_TOTAL.test(text)) metric = "TEAM_TOTAL";
  else if (/\btotal\b|\bo\/u\b|\bover\/under\b/i.test(text)) metric = "GAME_TOTAL";
  else if (/\bspread\b|[+-]\d+\.?\d*/i.test(text)) metric = "SPREAD";

  const confidence =
    period === "FULL_GAME" && overtimeRule === "UNSPECIFIED" && metric === "WINNER"
      ? ("HIGH" as const)
      : period !== "FULL_GAME" || SERIES.test(text)
        ? ("LOW" as const)
        : ("MEDIUM" as const);

  return {
    period,
    overtimeRule,
    metric,
    source: "kalshi_title_heuristic",
    confidence,
    rawHint: text.slice(0, 120),
    verified: false,
    unconfirmedNote:
      confidence !== "HIGH"
        ? "Kalshi settlement rules API not verified — title heuristics only"
        : undefined,
  };
}

export function parseOddsSettlementScope(input: {
  marketKey: string;
  point?: number | null;
  description?: string;
}): SettlementScope {
  const key = input.marketKey.toLowerCase();
  let metric: SettlementScope["metric"] = "WINNER";
  if (key === "spreads") metric = "SPREAD";
  if (key === "totals") metric = "GAME_TOTAL";

  return {
    period: "FULL_GAME",
    overtimeRule: "OVERTIME_INCLUDED",
    metric,
    line: input.point ?? null,
    source: "odds_api_market_key",
    confidence: key === "h2h" ? "HIGH" : "MEDIUM",
    rawHint: input.description ?? key,
    verified: key === "h2h",
    unconfirmedNote:
      key !== "h2h"
        ? "Odds API spread/total settlement rules assumed full-game incl. OT — verify per book"
        : undefined,
  };
}

function periodsCompatible(a: SettlementScope["period"], b: SettlementScope["period"]): boolean {
  if (a === b) return true;
  if (a === "FULL_GAME" && b === "FULL_GAME") return true;
  return false;
}

function overtimeCompatible(
  a: SettlementScope["overtimeRule"],
  b: SettlementScope["overtimeRule"]
): boolean {
  if (a === b) return true;
  if (a === "UNSPECIFIED" || b === "UNSPECIFIED") return false;
  return false;
}

function metricsCompatible(
  a: SettlementScope["metric"],
  b: SettlementScope["metric"],
  kalshiType: DetectedMarketType,
  oddsMarketKey: string
): boolean {
  if (a === b) return true;

  if (a === "WINNER" && b === "WINNER" && kalshiType.kind === "MONEYLINE") return true;

  if (
    a === "SPREAD" &&
    b === "SPREAD" &&
    kalshiType.kind === "SPREAD" &&
    oddsMarketKey === "spreads"
  ) {
    return true;
  }

  if (
    a === "GAME_TOTAL" &&
    b === "GAME_TOTAL" &&
    kalshiType.kind === "TOTAL" &&
    oddsMarketKey === "totals"
  ) {
    return true;
  }

  if (a === "TEAM_TOTAL" || b === "TEAM_TOTAL") return false;
  if (a === "WINNER" && (b === "SPREAD" || b === "GAME_TOTAL")) return false;
  if (b === "WINNER" && (a === "SPREAD" || a === "GAME_TOTAL")) return false;
  if (a === "SPREAD" && b === "GAME_TOTAL") return false;
  if (a === "GAME_TOTAL" && b === "SPREAD") return false;

  return false;
}

export function verifySettlementCompatibility(input: {
  kalshiScope: SettlementScope;
  oddsScope: SettlementScope;
  kalshiType: DetectedMarketType;
  oddsMarketKey: string;
  kalshiLine?: number | null;
  oddsLine?: number | null;
}): SettlementVerification {
  const reasons: string[] = [];
  let exact = true;

  if (!periodsCompatible(input.kalshiScope.period, input.oddsScope.period)) {
    exact = false;
    reasons.push(
      `period mismatch: kalshi=${input.kalshiScope.period} odds=${input.oddsScope.period}`
    );
  }

  if (!overtimeCompatible(input.kalshiScope.overtimeRule, input.oddsScope.overtimeRule)) {
    exact = false;
    reasons.push(
      `overtime rule mismatch: kalshi=${input.kalshiScope.overtimeRule} odds=${input.oddsScope.overtimeRule}`
    );
  }

  if (
    !metricsCompatible(
      input.kalshiScope.metric,
      input.oddsScope.metric,
      input.kalshiType,
      input.oddsMarketKey
    )
  ) {
    exact = false;
    reasons.push(
      `metric mismatch: kalshi=${input.kalshiScope.metric} odds=${input.oddsScope.metric}`
    );
  }

  if (
    input.kalshiScope.metric === "SPREAD" ||
    input.kalshiScope.metric === "GAME_TOTAL"
  ) {
    const kLine = input.kalshiLine ?? input.kalshiScope.line;
    const oLine = input.oddsLine ?? input.oddsScope.line;
    if (kLine == null || oLine == null) {
      exact = false;
      reasons.push("spread/total line missing on one or both sides");
    } else if (Math.abs(kLine - oLine) > 0.001) {
      exact = false;
      reasons.push(`line mismatch: kalshi=${kLine} odds=${oLine}`);
    }
  }

  if (input.kalshiScope.period === "SERIES" || input.oddsScope.period === "SERIES") {
    exact = false;
    reasons.push("series settlement cannot match single-game reference");
  }

  if (
    input.kalshiScope.confidence === "LOW" ||
    input.oddsScope.confidence === "LOW" ||
    !input.kalshiScope.verified ||
    !input.oddsScope.verified
  ) {
    if (input.kalshiType.level === "LEVEL_1_DIRECT_COMPARABLE" && input.kalshiScope.confidence === "HIGH") {
      // moneyline full game with high kalshi confidence may proceed with odds assumption
    } else {
      exact = false;
      reasons.push(UNCONFIRMED_MARKER);
    }
  }

  const status = exact ? "EXACT_MATCH" : reasons.length > 0 ? "MISMATCH" : "UNCONFIRMED";

  return {
    status,
    exact,
    kalshiScope: input.kalshiScope,
    oddsScope: input.oddsScope,
    supportedMarketType: input.kalshiType.kind,
    scope: input.kalshiScope.period,
    overtimeHandling: input.kalshiScope.overtimeRule,
    blockCode: exact ? null : MATCH_BLOCK_CODES.SETTLEMENT_MISMATCH,
    reason: exact ? "settlement scopes align" : reasons.join("; "),
    blocked: !exact,
  };
}

export function settlementAllowsBettability(verification: SettlementVerification): boolean {
  return verification.exact && verification.status === "EXACT_MATCH";
}
