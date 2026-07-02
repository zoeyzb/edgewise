import "server-only";

import { computeProfitabilityMetrics, buildDailyMoneyPlan, computeMoneyScores, WIN_RATE_EVIDENCE, CASH_TARGETS } from "@/lib/core/profitability";
import { assessExecutionQuality } from "@/lib/core/execution-quality";
import { calculatePositionValue, mergeLiveAndHistorical } from "@/lib/core/position-value";
import { evaluateExit } from "@/lib/core/exit-engine";
import { RISK_CONFIG } from "@/lib/core/risk-config";
import type { ScoredOpportunity } from "@/lib/core/types";
import { getAutoState } from "@/lib/server/auto/auto-store";
import { buildProviderHealthReport, buildPortfolioResponse } from "@/lib/server/providers/provider-health";
import { buildOpportunityScanResponse } from "@/lib/server/opportunities/opportunity-service";
import { getRiskState } from "@/lib/server/risk/risk-store";
import { getAppState } from "@/lib/storage/store";
import { getOddsQuotaState } from "@/lib/core/odds-client";
import {
  getTrackingState,
  getSystemLogs,
  syncLogsFromRiskAndAuto,
} from "./tracking-store";

export async function buildProfitabilityResponse() {
  const [tracking, appState, riskState, health, scan] = await Promise.all([
    getTrackingState(),
    getAppState(),
    getRiskState(),
    buildProviderHealthReport(),
    buildOpportunityScanResponse(),
  ]);

  const bankroll = appState.stakeSettings.bankrollPlaceholder;
  const metrics = computeProfitabilityMetrics(tracking.trades, appState.executionMode);

  const avgEdge =
    scan.items.length > 0
      ? scan.items.reduce((s, o) => s + o.edgeBreakdown.netEdge, 0) / scan.items.length
      : 0;
  const avgProfit =
    scan.items.length > 0
      ? scan.items.reduce((s, o) => s + o.expectedDollarProfit, 0) / scan.items.length
      : 0;

  const falseEdgeRate =
    tracking.edgeReplays.filter((e) => e.outcome === "FALSE_EDGE").length /
    Math.max(1, tracking.edgeReplays.length);

  const moneyScores = computeMoneyScores({
    bankroll,
    verifiedOpportunityCount: scan.items.filter((o) => o.state === "BETTABLE").length,
    totalExpectedDollarValue: metrics.totalExpectedDollarValue,
    avgLiquidity: scan.items.length
      ? scan.items.reduce((s, o) => s + o.fillableNotional, 0) / scan.items.length
      : 0,
    avgEdgeSurvival: scan.items.length
      ? scan.items.reduce((s, o) => s + o.edgeSurvivalConfidence, 0) / scan.items.length
      : 0,
    avgFillProbability: scan.items.length
      ? scan.items.reduce((s, o) => s + o.fillProbability, 0) / scan.items.length
      : 0,
    manualDelayMs: 0,
    autoReady: appState.executionMode === "AUTO",
    keyHealthGreen: health.executionReadiness === "GREEN",
    dataFreshnessScore: scan.dataLabel === "REAL_PROVIDER_DATA" ? 85 : 30,
    apiQuotaRemaining: getOddsQuotaState().remaining ?? 0,
    orderbookFreshnessScore: scan.items.filter((o) => o.orderbookFreshness === "FRESH").length
      ? 80
      : 40,
    highMarginCandidates: scan.items.filter((o) => o.highMarginStatus.includes("HIGH_MARGIN")).length,
    totalsCandidates: scan.items.filter((o) => o.kalshiMarket.toLowerCase().includes("total")).length,
    falseEdgeRate,
    executionQualityScore: 70,
    closingPriceValueTotal: tracking.trades.reduce((s, t) => s + (t.closingPriceValue ?? 0), 0),
    riskBudgetRemaining:
      1 -
      riskState.exposure.dailyRealizedLoss /
        Math.max(1, bankroll * (RISK_CONFIG.maxDailyRealizedLossPercent / 100)),
  });

  const dailyPlan = buildDailyMoneyPlan({
    bankroll,
    cashTarget: 10,
    avgNetEdge: avgEdge,
    avgExpectedProfit: avgProfit,
    opportunitiesPerDay: scan.items.filter((o) => o.state === "BETTABLE").length,
    falseEdgeRate,
    executionMode: appState.executionMode,
    healthGreen: health.executionReadiness === "GREEN",
    dailyLossCap: bankroll * (RISK_CONFIG.maxDailyRealizedLossPercent / 100),
    maxTrades: RISK_CONFIG.maxTradesPerDay,
  });

  return {
    dataLabel: metrics.dataLabel,
    profitabilityStatus: metrics.status,
    winRateEvidence: WIN_RATE_EVIDENCE,
    metrics,
    moneyScores,
    dailyPlan,
    cashTargets: CASH_TARGETS,
    note: "Never claim profitability from theoretical EV alone",
  };
}

export async function buildTrackerResponse() {
  const [tracking, portfolio, autoState] = await Promise.all([
    getTrackingState(),
    buildPortfolioResponse(),
    getAutoState(),
  ]);

  const livePositions = Array.isArray(portfolio.positions) ? portfolio.positions : [];
  const merged = mergeLiveAndHistorical(
    tracking.trades.filter((t) => t.lifecycle === "OPEN"),
    tracking.trades
  );

  const paper = tracking.trades.filter((t) => t.mode === "PAPER");
  const shadow = tracking.trades.filter((t) => t.mode === "SHADOW");
  const live = tracking.trades.filter((t) => t.mode === "LIVE");

  return {
    dataLabel: live.length > 0 || livePositions.length > 0 ? "REAL_PROVIDER_DATA" : tracking.trades.length > 0 ? "TRACKED_RECORDS" : "NO_TRACKED_DATA",
    openPositions: merged.filter((t) => t.lifecycle === "OPEN"),
    closedTrades: merged.filter((t) => t.lifecycle === "CLOSED"),
    paperTrades: paper,
    shadowTrades: shadow,
    liveTrades: live,
    kalshiPositions: livePositions,
    paperLabel: "PAPER — simulated, not real P&L",
    shadowLabel: "SHADOW — hypothetical, not real profit",
    lastSubmittedAuto: autoState.lastSubmitted,
    lastBlockedAuto: autoState.lastBlocked,
    message:
      live.length === 0 && livePositions.length === 0
        ? "No real fills tracked yet — paper/shadow clearly separated"
        : `${live.length} live tracked, ${paper.length} paper, ${shadow.length} shadow`,
  };
}

export async function buildPositionsResponse() {
  const tracker = await buildTrackerResponse();
  const open = tracker.openPositions;

  const positions = open.map((trade) => {
    const value = calculatePositionValue({
      trade,
      currentExecutableExitPrice: trade.currentPrice,
      currentFairProbability: null,
      originalFairProbability: null,
      spreadCost: 0.01 * trade.finalAllowedStake,
      liquidityToExit: 100,
      timeToSettlementHours: null,
      orderbookFresh: true,
      originalReasonStillValid: true,
    });

    const exit = evaluateExit({
      position: value,
      dailyLossNearLimit: false,
      exposureTooHigh: false,
      correlatedExposureHigh: false,
      dailyTargetReached: false,
      sessionTargetReached: false,
      settlementUncertainty: false,
      eventMatchDropped: false,
      marketNonOrderable: false,
      orderbookStale: false,
      scoreFeedUnreliable: false,
      liquidityDeteriorating: value.liquidityToExit < 25,
      spreadWidening: value.spreadCost > trade.finalAllowedStake * 0.05,
      originalEdgeWrong: value.currentEdgeRemaining != null && value.currentEdgeRemaining < 0,
      expectedValueCollapsed: !value.holdingStillPositiveEv,
      priceMovedStronglyInFavor: value.marketMovement === "FAVORABLE",
      remainingUpsideSmallerThanRisk: false,
      verifiedAddEdgeExists: false,
    });

    return { trade, value, exitRecommendation: exit };
  });

  return {
    dataLabel: tracker.dataLabel,
    count: positions.length,
    positions,
  };
}

export async function buildExitResponse() {
  const positions = await buildPositionsResponse();
  return {
    dataLabel: positions.dataLabel,
    recommendations: positions.positions.map((p) => ({
      marketTicker: p.trade.marketTicker,
      exitState: p.exitRecommendation.state,
      reason: p.exitRecommendation.reason,
      urgency: p.exitRecommendation.urgency,
      unrealizedPnl: p.value.unrealizedPnl,
      closingPriceValue: p.value.closingPriceValue,
    })),
  };
}

export async function buildLogsResponse() {
  const [riskState, autoState] = await Promise.all([getRiskState(), getAutoState()]);
  await syncLogsFromRiskAndAuto(riskState.logs, autoState.logs);
  const systemLogs = await getSystemLogs();

  return {
    dataLabel: systemLogs.length > 0 ? "TRACKED_LOGS" : "NO_LOGS_YET",
    items: systemLogs.slice(0, 100),
    message: "Sanitized logs — no secrets",
    categories: ["PROVIDER", "OPPORTUNITY", "VALIDATION", "EXECUTION", "AUTO", "EXIT", "ERROR", "SYSTEM"],
  };
}

export async function buildMissedOpportunitiesResponse() {
  const tracking = await getTrackingState();
  return {
    dataLabel: tracking.missed.length > 0 ? "TRACKED_MISSED" : "NO_MISSED_RECORDED",
    items: tracking.missed.slice(0, 50),
    count: tracking.missed.length,
  };
}

export async function buildEdgeReplayResponse() {
  const tracking = await getTrackingState();
  return {
    dataLabel: tracking.edgeReplays.length > 0 ? "TRACKED_REPLAYS" : "NO_REPLAYS_YET",
    items: tracking.edgeReplays.slice(0, 50),
    count: tracking.edgeReplays.length,
  };
}

export function tradeRecordFromOpportunity(input: {
  opportunity: ScoredOpportunity;
  source: "MANUAL" | "AUTO" | "PAPER" | "SHADOW";
  mode: "LIVE" | "PAPER" | "SHADOW";
  lifecycle: "OPEN" | "SIMULATED";
  placedPrice: number | null;
  fillPrice: number | null;
  contracts: number | null;
  clientOrderId: string | null;
  userRequestedStake: number;
  aiRecommendedStake: number;
  finalAllowedStake: number;
}) {
  const eq = assessExecutionQuality({
    fillableNotional: input.opportunity.fillableNotional,
    spreadFraction: input.opportunity.edgeBreakdown.spread,
    orderbookFresh: input.opportunity.orderbookFreshness === "FRESH",
    fillProbability: input.opportunity.fillProbability,
    partialFillRisk: input.opportunity.edgeBreakdown.partialFillRisk,
    rejectedOrdersRecent: 0,
    liquidityLabel: input.opportunity.liquidity,
  });

  return {
    source: input.source,
    mode: input.mode,
    lifecycle: input.lifecycle,
    opportunityId: input.opportunity.id,
    marketTicker: input.opportunity.kalshiTicker,
    game: input.opportunity.game,
    league: input.opportunity.league,
    side: input.opportunity.side,
    detectedEv: input.opportunity.edgeBreakdown.grossEdge,
    executableEv: input.opportunity.edgeBreakdown.netEdge,
    expectedDollarValue: input.opportunity.expectedDollarProfit,
    userRequestedStake: input.userRequestedStake,
    aiRecommendedStake: input.aiRecommendedStake,
    finalAllowedStake: input.finalAllowedStake,
    placedPrice: input.placedPrice,
    fillPrice: input.fillPrice,
    currentPrice: input.placedPrice,
    closingPrice: null,
    realizedPnl: null,
    unrealizedPnl: null,
    closingPriceValue: null,
    edgeWasReal: eq.grade !== "BLOCKED" ? null : false,
    beatLaterMarket: null,
    blockedCorrectly: null,
    botMissedProfit: null,
    manualDelayHurt: null,
    autoWouldHaveCaptured: input.source === "AUTO" ? true : null,
    contracts: input.contracts,
    clientOrderId: input.clientOrderId,
    blockReason: null,
    dataLabel:
      input.mode === "PAPER"
        ? ("PAPER_SIMULATION" as const)
        : input.mode === "SHADOW"
          ? ("SHADOW_SIMULATION" as const)
          : ("REAL_PROVIDER_DATA" as const),
  };
}
