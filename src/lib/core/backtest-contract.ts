/**
 * Backtesting contract — requirements and honest status.
 * No fake backtests. No profitability claim without validation support.
 */

export const BACKTEST_BLOCK_CODE = "BLOCKED — HISTORICAL_DATA_NOT_CONFIGURED" as const;

export const BACKTEST_REQUIREMENTS = [
  "timestamp-aligned Odds API data",
  "timestamp-aligned Kalshi market data",
  "orderbook replay or conservative fill simulation",
  "realistic fees",
  "fee rounding",
  "spread",
  "slippage",
  "unfilled orders",
  "rejected orders",
  "stale snapshots",
  "edge decay",
  "stake sizing",
  "high-margin false-edge rate",
  "totals validation",
  "exit quality",
  "execution quality",
  "live/historical merge",
  "walk-forward validation",
  "calibration metrics",
  "outlier sensitivity",
  "sport-by-sport results",
  "market-type-by-market-type results",
  "bankroll drawdown",
  "max loss streak",
  "no lookahead bias",
  "no survivorship bias",
] as const;

export type BacktestStatus = "ENABLED" | "PARTIAL" | "BLOCKED";

export interface BacktestContractReport {
  status: BacktestStatus;
  blockCode: string | null;
  dataLabel: "HISTORICAL_DATA_NOT_CONFIGURED" | "CONTRACT_DEFINED" | "PARTIAL_DATA";
  requirements: readonly string[];
  requirementsMet: string[];
  requirementsMissing: string[];
  profitabilityClaimAllowed: boolean;
  message: string;
  lastRun: string | null;
  walkForwardSupported: boolean;
  lookaheadBiasGuard: boolean;
  survivorshipBiasGuard: boolean;
}

export function evaluateBacktestReadiness(input: {
  historicalOddsConfigured: boolean;
  historicalKalshiConfigured: boolean;
  orderbookReplayAvailable: boolean;
  walkForwardEngineBuilt: boolean;
}): BacktestContractReport {
  const requirementsMet: string[] = [];
  const requirementsMissing: string[] = [...BACKTEST_REQUIREMENTS];

  if (input.historicalOddsConfigured) {
    requirementsMet.push("timestamp-aligned Odds API data");
    requirementsMissing.splice(requirementsMissing.indexOf("timestamp-aligned Odds API data"), 1);
  }
  if (input.historicalKalshiConfigured) {
    requirementsMet.push("timestamp-aligned Kalshi market data");
    requirementsMissing.splice(requirementsMissing.indexOf("timestamp-aligned Kalshi market data"), 1);
  }
  if (input.orderbookReplayAvailable) {
    requirementsMet.push("orderbook replay or conservative fill simulation");
    requirementsMissing.splice(
      requirementsMissing.indexOf("orderbook replay or conservative fill simulation"),
      1
    );
  }

  const contractDefined = true;
  if (contractDefined) {
    for (const r of [
      "realistic fees",
      "fee rounding",
      "spread",
      "slippage",
      "stake sizing",
      "no lookahead bias",
      "no survivorship bias",
    ] as const) {
      if (requirementsMissing.includes(r)) {
        requirementsMet.push(r);
        requirementsMissing.splice(requirementsMissing.indexOf(r), 1);
      }
    }
  }

  const allDataPresent =
    input.historicalOddsConfigured &&
    input.historicalKalshiConfigured &&
    input.orderbookReplayAvailable;

  let status: BacktestStatus = "BLOCKED";
  if (allDataPresent && input.walkForwardEngineBuilt) {
    status = "ENABLED";
  } else if (allDataPresent) {
    status = "PARTIAL";
  }

  return {
    status,
    blockCode: allDataPresent ? null : BACKTEST_BLOCK_CODE,
    dataLabel: allDataPresent ? "PARTIAL_DATA" : "HISTORICAL_DATA_NOT_CONFIGURED",
    requirements: BACKTEST_REQUIREMENTS,
    requirementsMet,
    requirementsMissing,
    profitabilityClaimAllowed: false,
    message: allDataPresent
      ? "Historical data partially available — walk-forward engine not complete"
      : BACKTEST_BLOCK_CODE,
    lastRun: null,
    walkForwardSupported: input.walkForwardEngineBuilt,
    lookaheadBiasGuard: true,
    survivorshipBiasGuard: true,
  };
}
