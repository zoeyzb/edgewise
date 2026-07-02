/**
 * Auto trading core — levels, limits, per-trade validation, pause rules.
 * Auto is selectable and active; each trade is validated individually.
 */

import { MIN_NET_EDGE } from "@/lib/core/ev";
import { EXECUTION_BLOCK_CODES } from "@/lib/core/risk-config";
import type {
  AutoLevel,
  ScoredOpportunity,
  StakeDecision,
  ValidationGateResult,
} from "@/lib/core/types";

export const AUTO_RUNTIME_STATES = [
  "OFF",
  "AUTO_SELECTED",
  "PAPER_AUTO",
  "SHADOW_AUTO",
  "TINY_LIVE_AUTO",
  "STANDARD_AUTO",
  "AUTO_PAUSED",
  "AUTO_EMERGENCY_STOP",
] as const;

export type AutoRuntimeState = (typeof AUTO_RUNTIME_STATES)[number];

export const AUTO_TRADE_STATUSES = [
  "AUTO_WAITING_FOR_VALID_TRADE",
  "AUTO_TRADE_READY",
  "AUTO_TRADE_SUBMITTED",
  "AUTO_TRADE_BLOCKED_PER_TRADE",
] as const;

export type AutoTradeStatus = (typeof AUTO_TRADE_STATUSES)[number];

export interface AutoRiskLimits {
  maxStakePercent: number;
  minStakePercent?: number;
  maxDailyLossPercent: number;
  maxDailyExposurePercent: number;
  maxOpenTrades: number;
  maxTradesPerDay: number;
  cooldownAfterLossMs: number;
  cooldownAfterRejectedMs: number;
  cooldownAfterFailedMs: number;
  minEdgeQualityScore: number;
  minMoneyConfidenceScore: number;
  minProfitPriorityScore: number;
}

export const AUTO_RISK_LIMITS: Record<"TINY_LIVE_AUTO" | "STANDARD_AUTO", AutoRiskLimits> = {
  TINY_LIVE_AUTO: {
    maxStakePercent: 0.25,
    maxDailyLossPercent: 1,
    maxDailyExposurePercent: 2,
    maxOpenTrades: 1,
    maxTradesPerDay: 3,
    cooldownAfterLossMs: 30 * 60 * 1000,
    cooldownAfterRejectedMs: 15 * 60 * 1000,
    cooldownAfterFailedMs: 15 * 60 * 1000,
    minEdgeQualityScore: 70,
    minMoneyConfidenceScore: 65,
    minProfitPriorityScore: 55,
  },
  STANDARD_AUTO: {
    maxStakePercent: 1,
    minStakePercent: 0.5,
    maxDailyLossPercent: 2,
    maxDailyExposurePercent: 6,
    maxOpenTrades: 3,
    maxTradesPerDay: 10,
    cooldownAfterLossMs: 15 * 60 * 1000,
    cooldownAfterRejectedMs: 10 * 60 * 1000,
    cooldownAfterFailedMs: 10 * 60 * 1000,
    minEdgeQualityScore: 65,
    minMoneyConfidenceScore: 60,
    minProfitPriorityScore: 50,
  },
};

export const PAPER_AUTO_LIMITS: AutoRiskLimits = {
  maxStakePercent: 0.5,
  maxDailyLossPercent: 3,
  maxDailyExposurePercent: 10,
  maxOpenTrades: 5,
  maxTradesPerDay: 25,
  cooldownAfterLossMs: 5 * 60 * 1000,
  cooldownAfterRejectedMs: 2 * 60 * 1000,
  cooldownAfterFailedMs: 2 * 60 * 1000,
  minEdgeQualityScore: 55,
  minMoneyConfidenceScore: 50,
  minProfitPriorityScore: 40,
};

export const SHADOW_AUTO_LIMITS: AutoRiskLimits = {
  ...PAPER_AUTO_LIMITS,
  maxTradesPerDay: 50,
};

export function isLiveAutoLevel(level: AutoLevel): boolean {
  return level === "TINY_LIVE_AUTO" || level === "STANDARD_AUTO";
}

export function resolveAutoRuntimeState(input: {
  executionMode: string;
  autoLevel: AutoLevel;
  paused: boolean;
  emergencyStop: boolean;
}): AutoRuntimeState {
  if (input.emergencyStop) return "AUTO_EMERGENCY_STOP";
  if (input.paused) return "AUTO_PAUSED";
  if (input.executionMode !== "AUTO") return "OFF";
  if (input.autoLevel === "PAPER_AUTO") return "PAPER_AUTO";
  if (input.autoLevel === "SHADOW_AUTO") return "SHADOW_AUTO";
  if (input.autoLevel === "TINY_LIVE_AUTO") return "TINY_LIVE_AUTO";
  if (input.autoLevel === "STANDARD_AUTO") return "STANDARD_AUTO";
  return "AUTO_SELECTED";
}

export function getAutoLimits(level: AutoLevel): AutoRiskLimits {
  if (level === "TINY_LIVE_AUTO") return AUTO_RISK_LIMITS.TINY_LIVE_AUTO;
  if (level === "STANDARD_AUTO") return AUTO_RISK_LIMITS.STANDARD_AUTO;
  if (level === "SHADOW_AUTO") return SHADOW_AUTO_LIMITS;
  return PAPER_AUTO_LIMITS;
}

function autoGate(name: string, passed: boolean, reason: string): ValidationGateResult {
  return { gate: name, passed, reason };
}

export interface AutoExposureSnapshot {
  autoTradesToday: number;
  openAutoTrades: number;
  dailyRealizedLoss: number;
  totalOpenExposure: number;
  consecutiveAutoLosses: number;
  rejectedOrdersRecent: number;
}

export interface AutoPauseContext {
  pausedByUser: boolean;
  emergencyStop: boolean;
  dailyLossHit: boolean;
  consecutiveLosses: number;
  healthColor: "RED" | "YELLOW" | "GREEN";
  storageHealthy: boolean;
  loggingHealthy: boolean;
  secretScanPassed: boolean;
  rejectedOrdersRecent: number;
  orderbookStaleCount: number;
  oddsStaleCount: number;
  settlementDropCount: number;
  falseEdgeRate: number;
}

export function evaluateAutoPauseConditions(ctx: AutoPauseContext): {
  shouldPause: boolean;
  reason: string | null;
} {
  if (ctx.emergencyStop) {
    return { shouldPause: true, reason: "Emergency stop triggered by user" };
  }
  if (ctx.pausedByUser) {
    return { shouldPause: true, reason: "Paused by user" };
  }
  if (ctx.dailyLossHit) {
    return { shouldPause: true, reason: "Auto daily loss limit hit" };
  }
  if (ctx.consecutiveLosses >= 2) {
    return { shouldPause: true, reason: "Two consecutive Auto losses — auto paused" };
  }
  if (ctx.healthColor !== "GREEN") {
    return { shouldPause: true, reason: `Provider health degraded (${ctx.healthColor})` };
  }
  if (!ctx.storageHealthy) {
    return { shouldPause: true, reason: EXECUTION_BLOCK_CODES.STORAGE_UNHEALTHY };
  }
  if (!ctx.loggingHealthy) {
    return { shouldPause: true, reason: EXECUTION_BLOCK_CODES.LOGGING_UNHEALTHY };
  }
  if (!ctx.secretScanPassed) {
    return { shouldPause: true, reason: EXECUTION_BLOCK_CODES.SECRET_SCAN_FAILED };
  }
  if (ctx.rejectedOrdersRecent >= 3) {
    return { shouldPause: true, reason: "Rejected orders increased — auto paused" };
  }
  if (ctx.orderbookStaleCount >= 3) {
    return { shouldPause: true, reason: "Orderbook freshness failures — auto paused" };
  }
  if (ctx.oddsStaleCount >= 3) {
    return { shouldPause: true, reason: "Odds freshness failures — auto paused" };
  }
  if (ctx.settlementDropCount >= 2) {
    return { shouldPause: true, reason: "Settlement confidence dropped — auto paused" };
  }
  if (ctx.falseEdgeRate >= 0.4) {
    return { shouldPause: true, reason: "False-edge rate elevated — auto paused" };
  }
  return { shouldPause: false, reason: null };
}

export function assessAutoExposureLimits(input: {
  bankroll: number;
  exposure: AutoExposureSnapshot;
  limits: AutoRiskLimits;
  proposedStake: number;
}): { approved: boolean; reason: string | null } {
  const { bankroll, exposure, limits, proposedStake } = input;
  if (bankroll <= 0) return { approved: false, reason: "bankroll unknown" };

  const maxDailyLoss = bankroll * (limits.maxDailyLossPercent / 100);
  if (exposure.dailyRealizedLoss >= maxDailyLoss) {
    return { approved: false, reason: "Auto daily realized loss limit hit" };
  }

  const maxExposure = bankroll * (limits.maxDailyExposurePercent / 100);
  if (exposure.totalOpenExposure + proposedStake > maxExposure) {
    return { approved: false, reason: "Auto max daily exposure exceeded" };
  }

  if (exposure.openAutoTrades >= limits.maxOpenTrades) {
    return { approved: false, reason: "Max open Auto trades reached" };
  }

  if (exposure.autoTradesToday >= limits.maxTradesPerDay) {
    return { approved: false, reason: "Max Auto trades per day reached" };
  }

  return { approved: true, reason: null };
}

export function checkAutoCooldowns(
  cooldown: { lastLossAt: string | null; lastRejectedOrderAt: string | null; lastFailedExecutionAt: string | null },
  limits: AutoRiskLimits,
  nowMs = Date.now()
): { blocked: boolean; reason: string | null } {
  const checks = [
    { at: cooldown.lastLossAt, ms: limits.cooldownAfterLossMs, label: "loss" },
    { at: cooldown.lastRejectedOrderAt, ms: limits.cooldownAfterRejectedMs, label: "rejected order" },
    { at: cooldown.lastFailedExecutionAt, ms: limits.cooldownAfterFailedMs, label: "failed execution" },
  ];

  for (const c of checks) {
    if (!c.at) continue;
    const elapsed = nowMs - Date.parse(c.at);
    if (elapsed < c.ms) {
      return { blocked: true, reason: `Auto cooldown after ${c.label}` };
    }
  }
  return { blocked: false, reason: null };
}

export function capAutoStake(input: {
  stakeDecision: StakeDecision;
  bankroll: number;
  userMaxStake: number;
  limits: AutoRiskLimits;
}): StakeDecision {
  const maxByLevel = input.bankroll * (input.limits.maxStakePercent / 100);
  const minByLevel =
    input.limits.minStakePercent != null
      ? input.bankroll * (input.limits.minStakePercent / 100)
      : 0;

  let finalAllowed = Math.min(
    input.stakeDecision.finalAllowedStake,
    maxByLevel,
    input.userMaxStake
  );

  if (finalAllowed >= input.bankroll) {
    return {
      ...input.stakeDecision,
      finalAllowedStake: 0,
      maxLoss: 0,
      decision: "BLOCKED",
      reason: "BLOCKED — 100_PERCENT_BANKROLL_STAKE_NOT_ALLOWED",
    };
  }

  if (finalAllowed < minByLevel && finalAllowed > 0 && minByLevel > 0) {
    finalAllowed = Math.min(finalAllowed, maxByLevel);
  }

  const reduced = finalAllowed < input.stakeDecision.finalAllowedStake;
  return {
    ...input.stakeDecision,
    finalAllowedStake: Math.round(finalAllowed * 100) / 100,
    maxLoss: Math.round(finalAllowed * 100) / 100,
    decision: finalAllowed <= 0 ? "BLOCKED" : reduced ? "REDUCED" : input.stakeDecision.decision,
    reason: reduced
      ? "Auto stake reduced to respect Auto level limits"
      : input.stakeDecision.reason,
  };
}

export interface AutoTradeValidationInput {
  autoSelected: boolean;
  autoLevel: AutoLevel;
  keysValid: boolean;
  secretScanPassed: boolean;
  healthColor: "RED" | "YELLOW" | "GREEN";
  storageHealthy: boolean;
  loggingHealthy: boolean;
  exchangeActive: boolean;
  balanceFresh: boolean;
  positionsFresh: boolean;
  opportunity: ScoredOpportunity;
  stakeDecision: StakeDecision;
  autoExposureApproved: boolean;
  riskApproved: boolean;
  duplicatePassed: boolean;
  correlatedPassed: boolean;
  cooldownBlocked: boolean;
  cooldownReason: string | null;
}

export function validateAutoTradeCandidate(
  input: AutoTradeValidationInput
): {
  status: AutoTradeStatus;
  allPassed: boolean;
  gates: ValidationGateResult[];
  failedGate: string | null;
  blockedReason: string | null;
} {
  const limits = getAutoLimits(input.autoLevel);
  const o = input.opportunity;

  const gates: ValidationGateResult[] = [
    autoGate("AUTO_SELECTED", input.autoSelected, input.autoSelected ? "Auto selected" : "Auto not selected"),
    autoGate(
      "AUTO_LEVEL_SELECTED",
      true,
      `Auto level ${input.autoLevel}`
    ),
    autoGate("KEYS_VALID", input.keysValid, input.keysValid ? "keys valid" : EXECUTION_BLOCK_CODES.KEY_INVALID),
    autoGate(
      "SECRET_SCAN_PASSED",
      input.secretScanPassed,
      input.secretScanPassed ? "secret scan passed" : EXECUTION_BLOCK_CODES.SECRET_SCAN_FAILED
    ),
    autoGate(
      "ACCOUNT_FRESH",
      input.balanceFresh,
      input.balanceFresh ? "account fresh" : EXECUTION_BLOCK_CODES.BALANCE_STALE
    ),
    autoGate(
      "POSITIONS_FRESH",
      input.positionsFresh,
      input.positionsFresh ? "positions fresh" : EXECUTION_BLOCK_CODES.POSITIONS_STALE
    ),
    autoGate(
      "EXCHANGE_ACTIVE",
      input.exchangeActive,
      input.exchangeActive ? "exchange active" : EXECUTION_BLOCK_CODES.EXCHANGE_DEGRADED
    ),
    autoGate(
      "MARKET_ORDERABLE",
      o.executableKalshiAsk != null,
      o.executableKalshiAsk != null ? "market orderable" : EXECUTION_BLOCK_CODES.MARKET_NOT_ORDERABLE
    ),
    autoGate(
      "ODDS_FRESH",
      o.oddsFreshness === "FRESH",
      o.oddsFreshness === "FRESH" ? "odds fresh" : EXECUTION_BLOCK_CODES.STALE_DATA
    ),
    autoGate(
      "SCORE_FRESH_IF_LIVE",
      o.liveStatus !== "LIVE" || o.scoreFreshness === "FRESH",
      o.liveStatus !== "LIVE" || o.scoreFreshness === "FRESH" ? "score ok" : EXECUTION_BLOCK_CODES.STALE_DATA
    ),
    autoGate(
      "ORDERBOOK_FRESH",
      o.orderbookFreshness === "FRESH",
      o.orderbookFreshness === "FRESH" ? "orderbook fresh" : EXECUTION_BLOCK_CODES.STALE_DATA
    ),
    autoGate(
      "MARKET_MATCH_HIGH",
      o.matchConfidence === "HIGH",
      o.matchConfidence === "HIGH" ? "match HIGH" : "event match not HIGH"
    ),
    autoGate(
      "SETTLEMENT_VERIFIED",
      o.settlementConfidence === "EXACT",
      o.settlementConfidence === "EXACT" ? "settlement verified" : EXECUTION_BLOCK_CODES.SETTLEMENT_UNCONFIRMED
    ),
    autoGate(
      "EXECUTABLE_ASK_KNOWN",
      o.executableKalshiAsk != null,
      o.executableKalshiAsk != null ? "executable ask known (no midpoint)" : "executable ask unknown"
    ),
    autoGate(
      "LIQUIDITY_SUFFICIENT",
      o.fillableNotional >= 25 && o.liquidity !== "VERY_LOW",
      o.fillableNotional >= 25 ? "liquidity sufficient" : EXECUTION_BLOCK_CODES.LOW_LIQUIDITY
    ),
    autoGate(
      "NET_EDGE_MINIMUM",
      o.edgeBreakdown.netEdge >= MIN_NET_EDGE,
      o.edgeBreakdown.netEdge >= MIN_NET_EDGE ? "net edge ≥ 4%" : EXECUTION_BLOCK_CODES.EDGE_BELOW_MIN
    ),
    autoGate(
      "EXPECTED_DOLLAR_PROFIT_POSITIVE",
      o.expectedDollarProfit > 0,
      o.expectedDollarProfit > 0 ? "expected profit positive" : "expected profit not positive"
    ),
    autoGate(
      "EDGE_QUALITY_SCORE",
      o.edgeQualityScore >= limits.minEdgeQualityScore,
      o.edgeQualityScore >= limits.minEdgeQualityScore
        ? `EQS ${o.edgeQualityScore} ≥ ${limits.minEdgeQualityScore}`
        : `Edge Quality Score too low (${o.edgeQualityScore})`
    ),
    autoGate(
      "MONEY_CONFIDENCE_SCORE",
      o.moneyConfidenceScore >= limits.minMoneyConfidenceScore,
      o.moneyConfidenceScore >= limits.minMoneyConfidenceScore
        ? `MCS ${o.moneyConfidenceScore} ≥ ${limits.minMoneyConfidenceScore}`
        : `Money Confidence Score too low (${o.moneyConfidenceScore})`
    ),
    autoGate(
      "PROFIT_PRIORITY_SCORE",
      o.profitPriorityScore >= limits.minProfitPriorityScore,
      o.profitPriorityScore >= limits.minProfitPriorityScore
        ? `PPS ${o.profitPriorityScore} ≥ ${limits.minProfitPriorityScore}`
        : `Profit Priority Score too low (${o.profitPriorityScore})`
    ),
    autoGate(
      "STAKE_APPROVED",
      input.stakeDecision.decision !== "BLOCKED" && input.stakeDecision.finalAllowedStake > 0,
      input.stakeDecision.decision !== "BLOCKED" ? "stake approved" : input.stakeDecision.reason
    ),
    autoGate(
      "AUTO_EXPOSURE_APPROVED",
      input.autoExposureApproved,
      input.autoExposureApproved ? "Auto exposure approved" : "Auto exposure limit exceeded"
    ),
    autoGate(
      "RISK_APPROVED",
      input.riskApproved,
      input.riskApproved ? "risk approved" : "risk not approved"
    ),
    autoGate(
      "DUPLICATE_CHECK_PASSED",
      input.duplicatePassed,
      input.duplicatePassed ? "no duplicate exposure" : EXECUTION_BLOCK_CODES.DUPLICATE_EXPOSURE
    ),
    autoGate(
      "CORRELATED_EXPOSURE_PASSED",
      input.correlatedPassed,
      input.correlatedPassed ? "correlated exposure ok" : EXECUTION_BLOCK_CODES.CORRELATED_EXPOSURE
    ),
    autoGate(
      "COOLDOWN_CLEAR",
      !input.cooldownBlocked,
      input.cooldownBlocked ? (input.cooldownReason ?? EXECUTION_BLOCK_CODES.COOLDOWN_ACTIVE) : "cooldown clear"
    ),
    autoGate(
      "HEALTH_GREEN",
      input.healthColor === "GREEN",
      input.healthColor === "GREEN" ? "health GREEN" : `health ${input.healthColor}`
    ),
    autoGate(
      "STORAGE_HEALTHY",
      input.storageHealthy,
      input.storageHealthy ? "storage ok" : EXECUTION_BLOCK_CODES.STORAGE_UNHEALTHY
    ),
    autoGate(
      "LOGGING_HEALTHY",
      input.loggingHealthy,
      input.loggingHealthy ? "logging ok" : EXECUTION_BLOCK_CODES.LOGGING_UNHEALTHY
    ),
    autoGate(
      "OPPORTUNITY_BETTABLE",
      o.state === "BETTABLE" || o.highMarginStatus === "URGENT_BETTABLE_HIGH_MARGIN",
      o.state === "BETTABLE" || o.highMarginStatus === "URGENT_BETTABLE_HIGH_MARGIN"
        ? "opportunity bettable"
        : EXECUTION_BLOCK_CODES.NOT_BETTABLE
    ),
  ];

  const failed = gates.find((g) => !g.passed);
  const allPassed = !failed;

  return {
    status: allPassed ? "AUTO_TRADE_READY" : "AUTO_TRADE_BLOCKED_PER_TRADE",
    allPassed,
    gates,
    failedGate: failed?.gate ?? null,
    blockedReason: failed?.reason ?? null,
  };
}

export interface AutoDecisionLog {
  id: string;
  at: string;
  autoLevel: AutoLevel;
  tradeStatus: AutoTradeStatus;
  opportunityId: string | null;
  market: string | null;
  reason: string;
  failedGate: string | null;
  stakeDecision?: StakeDecision;
  simulationLabel?: "PAPER_SIMULATION" | "SHADOW_WOULD_HAVE_TRADED";
}
