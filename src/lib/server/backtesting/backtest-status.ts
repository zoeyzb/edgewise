import "server-only";

import { evaluateBacktestReadiness } from "@/lib/core/backtest-contract";

export async function buildBacktestingStatusResponse() {
  const report = evaluateBacktestReadiness({
    historicalOddsConfigured: false,
    historicalKalshiConfigured: false,
    orderbookReplayAvailable: false,
    walkForwardEngineBuilt: false,
  });

  return {
    status: report.status,
    dataLabel: report.dataLabel,
    blockCode: report.blockCode,
    message: report.message,
    lastRun: report.lastRun,
    profitabilityClaimAllowed: report.profitabilityClaimAllowed,
    requirementsMet: report.requirementsMet,
    requirementsMissing: report.requirementsMissing.slice(0, 10),
    requirementsTotal: report.requirements.length,
    walkForwardSupported: report.walkForwardSupported,
    lookaheadBiasGuard: report.lookaheadBiasGuard,
    survivorshipBiasGuard: report.survivorshipBiasGuard,
    results: null,
    note: "No fake backtests — historical data not configured",
  };
}
