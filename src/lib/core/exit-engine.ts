/**
 * Exit engine — hold, take profit, reduce, exit recommendations.
 */

import type { PositionValueResult } from "@/lib/core/position-value";

export type ExitState =
  | "HOLD"
  | "TAKE_PROFIT"
  | "REDUCE_POSITION"
  | "EXIT_NOW"
  | "WATCH_CLOSELY"
  | "BLOCK_NEW_EXPOSURE";

export interface ExitEngineInput {
  position: PositionValueResult;
  dailyLossNearLimit: boolean;
  exposureTooHigh: boolean;
  correlatedExposureHigh: boolean;
  dailyTargetReached: boolean;
  sessionTargetReached: boolean;
  settlementUncertainty: boolean;
  eventMatchDropped: boolean;
  marketNonOrderable: boolean;
  orderbookStale: boolean;
  scoreFeedUnreliable: boolean;
  liquidityDeteriorating: boolean;
  spreadWidening: boolean;
  originalEdgeWrong: boolean;
  expectedValueCollapsed: boolean;
  priceMovedStronglyInFavor: boolean;
  remainingUpsideSmallerThanRisk: boolean;
  verifiedAddEdgeExists: boolean;
}

export interface ExitRecommendation {
  state: ExitState;
  reason: string;
  urgency: "LOW" | "MEDIUM" | "HIGH";
  allowAverageDown: boolean;
}

export function evaluateExit(input: ExitEngineInput): ExitRecommendation {
  if (input.marketNonOrderable || input.settlementUncertainty || input.eventMatchDropped) {
    return {
      state: "EXIT_NOW",
      reason: "Market or settlement integrity degraded — exit recommended",
      urgency: "HIGH",
      allowAverageDown: false,
    };
  }

  if (input.dailyLossNearLimit || input.exposureTooHigh || input.correlatedExposureHigh) {
    return {
      state: input.exposureTooHigh ? "REDUCE_POSITION" : "BLOCK_NEW_EXPOSURE",
      reason: "Risk budget exceeded — reduce or block new exposure",
      urgency: "HIGH",
      allowAverageDown: false,
    };
  }

  if (input.dailyTargetReached || input.sessionTargetReached) {
    return {
      state: "TAKE_PROFIT",
      reason: "Daily/session target reached — take profit or reduce",
      urgency: "MEDIUM",
      allowAverageDown: false,
    };
  }

  if (input.originalEdgeWrong || input.expectedValueCollapsed) {
    return {
      state: "EXIT_NOW",
      reason: "Original edge was wrong or EV collapsed — cut position",
      urgency: "HIGH",
      allowAverageDown: input.verifiedAddEdgeExists,
    };
  }

  if (input.priceMovedStronglyInFavor && input.remainingUpsideSmallerThanRisk) {
    return {
      state: "TAKE_PROFIT",
      reason: "Price moved in favor — remaining upside smaller than exit risk",
      urgency: "MEDIUM",
      allowAverageDown: false,
    };
  }

  if (
    input.orderbookStale ||
    input.scoreFeedUnreliable ||
    input.liquidityDeteriorating ||
    input.spreadWidening
  ) {
    return {
      state: "WATCH_CLOSELY",
      reason: "Live data or liquidity deteriorating — watch closely",
      urgency: "MEDIUM",
      allowAverageDown: false,
    };
  }

  if (!input.position.holdingStillPositiveEv) {
    return {
      state: "REDUCE_POSITION",
      reason: "Holding no longer has positive EV — reduce",
      urgency: "MEDIUM",
      allowAverageDown: input.verifiedAddEdgeExists,
    };
  }

  return {
    state: "HOLD",
    reason: "Original reason still valid with positive EV",
    urgency: "LOW",
    allowAverageDown: input.verifiedAddEdgeExists,
  };
}
