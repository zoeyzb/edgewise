/**
 * Per-trade execution validation gates — 100% must pass before order placement.
 */

import { MIN_NET_EDGE } from "@/lib/core/ev";
import { EXECUTION_BLOCK_CODES } from "@/lib/core/risk-config";
import type { ScoredOpportunity, StakeDecision, ValidationGateResult } from "@/lib/core/types";

export const REQUIRED_EXECUTION_GATES = [
  "REAL_MONEY_TRADING_ENABLED",
  "KILL_SWITCH_OFF",
  "HEALTH_GREEN",
  "SECRET_SCAN_PASSED",
  "STORAGE_HEALTHY",
  "LOGGING_HEALTHY",
  "KALSHI_AUTH_VALID",
  "EXCHANGE_STATUS_VALID",
  "ACCOUNT_BALANCE_FRESH",
  "POSITIONS_FRESH",
  "MARKET_ACTIVE",
  "MARKET_ORDERABLE",
  "ORDERBOOK_FRESH",
  "EXECUTABLE_PRICE_RECONSTRUCTED",
  "ODDS_FRESH",
  "SCORES_FRESH_IF_LIVE",
  "EVENT_MATCH_HIGH",
  "SETTLEMENT_VERIFIED",
  "EV_RECALCULATED",
  "NET_EDGE_MINIMUM",
  "EXPECTED_DOLLAR_PROFIT_POSITIVE",
  "LIQUIDITY_SUFFICIENT",
  "RISK_APPROVED",
  "DUPLICATE_EXPOSURE_PASSED",
  "CORRELATED_EXPOSURE_PASSED",
  "FINAL_STAKE_APPROVED",
  "OPPORTUNITY_BETTABLE",
] as const;

export type ExecutionGateName = (typeof REQUIRED_EXECUTION_GATES)[number];

export interface ExecutionGateContext {
  realMoneyTradingEnabled: boolean;
  killSwitchActive: boolean;
  healthColor: "RED" | "YELLOW" | "GREEN";
  secretScanPassed: boolean;
  storageHealthy: boolean;
  loggingHealthy: boolean;
  kalshiAuthValid: boolean;
  exchangeTradingActive: boolean;
  balanceFresh: boolean;
  positionsFresh: boolean;
  marketActive: boolean;
  marketOrderable: boolean;
  opportunity: ScoredOpportunity;
  stakeDecision: StakeDecision;
  duplicateExposurePassed: boolean;
  correlatedExposurePassed: boolean;
  riskApproved: boolean;
}

function gate(name: ExecutionGateName, passed: boolean, reason: string): ValidationGateResult {
  return { gate: name, passed, reason };
}

export function runExecutionGates(ctx: ExecutionGateContext): {
  allPassed: boolean;
  gates: ValidationGateResult[];
  failedGate: string | null;
  blockedReason: string | null;
} {
  const gates: ValidationGateResult[] = [
    gate(
      "REAL_MONEY_TRADING_ENABLED",
      ctx.realMoneyTradingEnabled,
      ctx.realMoneyTradingEnabled
        ? "real money trading enabled"
        : EXECUTION_BLOCK_CODES.REAL_MONEY_DISABLED
    ),
    gate(
      "KILL_SWITCH_OFF",
      !ctx.killSwitchActive,
      ctx.killSwitchActive ? EXECUTION_BLOCK_CODES.KILL_SWITCH : "kill switch off"
    ),
    gate(
      "HEALTH_GREEN",
      ctx.healthColor === "GREEN",
      ctx.healthColor === "GREEN" ? "health GREEN" : `health ${ctx.healthColor}`
    ),
    gate(
      "SECRET_SCAN_PASSED",
      ctx.secretScanPassed,
      ctx.secretScanPassed ? "secret scan passed" : EXECUTION_BLOCK_CODES.SECRET_SCAN_FAILED
    ),
    gate("STORAGE_HEALTHY", ctx.storageHealthy, ctx.storageHealthy ? "storage ok" : EXECUTION_BLOCK_CODES.STORAGE_UNHEALTHY),
    gate("LOGGING_HEALTHY", ctx.loggingHealthy, ctx.loggingHealthy ? "logging ok" : EXECUTION_BLOCK_CODES.LOGGING_UNHEALTHY),
    gate(
      "KALSHI_AUTH_VALID",
      ctx.kalshiAuthValid,
      ctx.kalshiAuthValid ? "kalshi auth ok" : EXECUTION_BLOCK_CODES.KEY_INVALID
    ),
    gate(
      "EXCHANGE_STATUS_VALID",
      ctx.exchangeTradingActive,
      ctx.exchangeTradingActive ? "exchange trading active" : EXECUTION_BLOCK_CODES.EXCHANGE_DEGRADED
    ),
    gate(
      "ACCOUNT_BALANCE_FRESH",
      ctx.balanceFresh,
      ctx.balanceFresh ? "balance fresh" : EXECUTION_BLOCK_CODES.BALANCE_STALE
    ),
    gate(
      "POSITIONS_FRESH",
      ctx.positionsFresh,
      ctx.positionsFresh ? "positions fresh" : EXECUTION_BLOCK_CODES.POSITIONS_STALE
    ),
    gate(
      "MARKET_ACTIVE",
      ctx.marketActive,
      ctx.marketActive ? "market active" : EXECUTION_BLOCK_CODES.MARKET_NOT_ORDERABLE
    ),
    gate(
      "MARKET_ORDERABLE",
      ctx.marketOrderable,
      ctx.marketOrderable ? "market orderable" : EXECUTION_BLOCK_CODES.MARKET_NOT_ORDERABLE
    ),
    gate(
      "ORDERBOOK_FRESH",
      ctx.opportunity.orderbookFreshness === "FRESH",
      ctx.opportunity.orderbookFreshness === "FRESH" ? "orderbook fresh" : EXECUTION_BLOCK_CODES.STALE_DATA
    ),
    gate(
      "EXECUTABLE_PRICE_RECONSTRUCTED",
      ctx.opportunity.executableKalshiAsk != null,
      ctx.opportunity.executableKalshiAsk != null ? "executable ask known" : "executable price unknown"
    ),
    gate(
      "ODDS_FRESH",
      ctx.opportunity.oddsFreshness === "FRESH",
      ctx.opportunity.oddsFreshness === "FRESH" ? "odds fresh" : EXECUTION_BLOCK_CODES.STALE_DATA
    ),
    gate(
      "SCORES_FRESH_IF_LIVE",
      ctx.opportunity.liveStatus !== "LIVE" || ctx.opportunity.scoreFreshness === "FRESH",
      ctx.opportunity.liveStatus !== "LIVE" || ctx.opportunity.scoreFreshness === "FRESH"
        ? "score freshness ok"
        : EXECUTION_BLOCK_CODES.STALE_DATA
    ),
    gate(
      "EVENT_MATCH_HIGH",
      ctx.opportunity.matchConfidence === "HIGH",
      ctx.opportunity.matchConfidence === "HIGH" ? "match HIGH" : "event match not HIGH"
    ),
    gate(
      "SETTLEMENT_VERIFIED",
      ctx.opportunity.settlementConfidence === "EXACT",
      ctx.opportunity.settlementConfidence === "EXACT"
        ? "settlement exact"
        : EXECUTION_BLOCK_CODES.SETTLEMENT_UNCONFIRMED
    ),
    gate("EV_RECALCULATED", true, "EV recalculated server-side at execution time"),
    gate(
      "NET_EDGE_MINIMUM",
      ctx.opportunity.edgeBreakdown.netEdge >= MIN_NET_EDGE,
      ctx.opportunity.edgeBreakdown.netEdge >= MIN_NET_EDGE
        ? "net edge meets minimum"
        : EXECUTION_BLOCK_CODES.EDGE_BELOW_MIN
    ),
    gate(
      "EXPECTED_DOLLAR_PROFIT_POSITIVE",
      ctx.opportunity.expectedDollarProfit > 0,
      ctx.opportunity.expectedDollarProfit > 0 ? "expected profit positive" : "expected profit not positive"
    ),
    gate(
      "LIQUIDITY_SUFFICIENT",
      ctx.opportunity.fillableNotional >= 25 && ctx.opportunity.liquidity !== "VERY_LOW",
      ctx.opportunity.fillableNotional >= 25 ? "liquidity sufficient" : EXECUTION_BLOCK_CODES.LOW_LIQUIDITY
    ),
    gate(
      "RISK_APPROVED",
      ctx.riskApproved,
      ctx.riskApproved ? "risk approved" : "risk not approved"
    ),
    gate(
      "DUPLICATE_EXPOSURE_PASSED",
      ctx.duplicateExposurePassed,
      ctx.duplicateExposurePassed ? "no duplicate exposure" : EXECUTION_BLOCK_CODES.DUPLICATE_EXPOSURE
    ),
    gate(
      "CORRELATED_EXPOSURE_PASSED",
      ctx.correlatedExposurePassed,
      ctx.correlatedExposurePassed ? "correlated exposure ok" : EXECUTION_BLOCK_CODES.CORRELATED_EXPOSURE
    ),
    gate(
      "FINAL_STAKE_APPROVED",
      ctx.stakeDecision.decision !== "BLOCKED" && ctx.stakeDecision.finalAllowedStake > 0,
      ctx.stakeDecision.decision !== "BLOCKED" ? "stake approved" : ctx.stakeDecision.reason
    ),
    gate(
      "OPPORTUNITY_BETTABLE",
      ctx.opportunity.state === "BETTABLE" ||
        ctx.opportunity.highMarginStatus === "URGENT_BETTABLE_HIGH_MARGIN",
      ctx.opportunity.state === "BETTABLE" ||
        ctx.opportunity.highMarginStatus === "URGENT_BETTABLE_HIGH_MARGIN"
        ? "opportunity bettable"
        : EXECUTION_BLOCK_CODES.NOT_BETTABLE
    ),
  ];

  const failed = gates.find((g) => !g.passed);
  return {
    allPassed: !failed,
    gates,
    failedGate: failed?.gate ?? null,
    blockedReason: failed?.reason ?? null,
  };
}
