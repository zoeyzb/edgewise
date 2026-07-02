/**
 * Execution quality and thin-book / market-maker trap detection.
 */

export type ThinBookWarning =
  | "MARKET_MAKER_TRAP_OR_THIN_BOOK"
  | "PARTIAL_FILL_RISK"
  | "SPREAD_WIDENING"
  | "STALE_BOOK_SIDE"
  | "NONE";

export interface ExecutionQualityInput {
  fillableNotional: number;
  spreadFraction: number;
  orderbookFresh: boolean;
  fillProbability: number;
  partialFillRisk: number;
  rejectedOrdersRecent: number;
  liquidityLabel: string;
  askMovedImmediately?: boolean;
  bookDisappeared?: boolean;
}

export interface ExecutionQualityResult {
  score: number;
  grade: "HIGH" | "MEDIUM" | "LOW" | "BLOCKED";
  warnings: ThinBookWarning[];
  recommendation: "FULL_SIZE" | "REDUCE_SIZE" | "DOWNGRADE" | "BLOCK";
  reason: string;
}

export function assessExecutionQuality(input: ExecutionQualityInput): ExecutionQualityResult {
  const warnings: ThinBookWarning[] = [];
  let score = 100;

  if (input.fillableNotional < 25 || input.liquidityLabel === "VERY_LOW") {
    warnings.push("MARKET_MAKER_TRAP_OR_THIN_BOOK");
    score -= 35;
  }
  if (input.fillableNotional < 50) {
    warnings.push("PARTIAL_FILL_RISK");
    score -= 15;
  }
  if (input.spreadFraction > 0.03) {
    warnings.push("SPREAD_WIDENING");
    score -= 20;
  }
  if (!input.orderbookFresh) {
    warnings.push("STALE_BOOK_SIDE");
    score -= 25;
  }
  if (input.partialFillRisk > 0.3) {
    warnings.push("PARTIAL_FILL_RISK");
    score -= 10;
  }
  if (input.rejectedOrdersRecent >= 2) {
    score -= 15;
  }
  if (input.bookDisappeared) {
    warnings.push("MARKET_MAKER_TRAP_OR_THIN_BOOK");
    score -= 30;
  }
  if (input.askMovedImmediately) {
    warnings.push("MARKET_MAKER_TRAP_OR_THIN_BOOK");
    score -= 20;
  }

  score = Math.max(0, Math.min(100, score));

  let grade: ExecutionQualityResult["grade"] = "HIGH";
  if (score < 40) grade = "BLOCKED";
  else if (score < 60) grade = "LOW";
  else if (score < 80) grade = "MEDIUM";

  let recommendation: ExecutionQualityResult["recommendation"] = "FULL_SIZE";
  let reason = "Execution quality acceptable";

  if (warnings.includes("MARKET_MAKER_TRAP_OR_THIN_BOOK")) {
    recommendation = grade === "BLOCKED" ? "BLOCK" : "REDUCE_SIZE";
    reason = "MARKET_MAKER_TRAP_OR_THIN_BOOK — reduce size, downgrade, or block";
  } else if (grade === "LOW") {
    recommendation = "DOWNGRADE";
    reason = "Thin liquidity or spread — downgrade size";
  } else if (grade === "BLOCKED") {
    recommendation = "BLOCK";
    reason = "Execution quality too weak to trade";
  }

  return { score, grade, warnings: warnings.length ? warnings : ["NONE"], recommendation, reason };
}

export function computeFalseEdgeRate(input: {
  highMarginFalse: number;
  highMarginTotal: number;
  totalsFalse: number;
  totalsTotal: number;
}): { highMarginRate: number | null; totalsRate: number | null } {
  return {
    highMarginRate:
      input.highMarginTotal > 0 ? input.highMarginFalse / input.highMarginTotal : null,
    totalsRate: input.totalsTotal > 0 ? input.totalsFalse / input.totalsTotal : null,
  };
}
