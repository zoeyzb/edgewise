/**
 * Profitability tracking — evidence-based only, never from theoretical EV alone.
 */

import type { TrackedTradeRecord } from "@/lib/core/storage";

export const PROFITABILITY_STATUSES = [
  "UNPROVEN",
  "WATCH_ONLY",
  "PAPER_PROFITABLE",
  "SHADOW_PROFITABLE",
  "MANUAL_READY",
  "TINY_LIVE_READY",
  "REAL_MONEY_PROVEN",
] as const;

export type ProfitabilityStatus = (typeof PROFITABILITY_STATUSES)[number];

export const WIN_RATE_EVIDENCE = {
  target: "TARGET: HIGHEST_REALISTIC_WIN_RATE",
  claimed: "CLAIMED_WIN_RATE: BASED_ON_TRACKED_RESULTS_ONLY",
  guarantee: "GUARANTEE: NONE",
} as const;

export interface ProfitabilityMetrics {
  status: ProfitabilityStatus;
  dataLabel: "TRACKED_RESULTS" | "INSUFFICIENT_DATA" | "PAPER_ONLY" | "SHADOW_ONLY";
  sampleSize: number;
  closedTrades: number;
  openTrades: number;
  winRate: number | null;
  lossRate: number | null;
  averageWin: number | null;
  averageLoss: number | null;
  maxDrawdown: number | null;
  roi: number | null;
  riskAdjustedReturn: number | null;
  totalRealizedPnl: number;
  totalUnrealizedPnl: number;
  totalExpectedDollarValue: number;
  totalExecutableEvCaptured: number;
  highMarginFalseEdgeRate: number | null;
  totalsFalseEdgeRate: number | null;
  blockedCorrectlyCount: number;
  botMissedProfitCount: number;
  manualDelayHurtCount: number;
  autoWouldHaveCapturedCount: number;
  note: string;
}

export interface MoneyScoresInput {
  bankroll: number;
  verifiedOpportunityCount: number;
  totalExpectedDollarValue: number;
  avgLiquidity: number;
  avgEdgeSurvival: number;
  avgFillProbability: number;
  manualDelayMs: number;
  autoReady: boolean;
  keyHealthGreen: boolean;
  dataFreshnessScore: number;
  apiQuotaRemaining: number;
  orderbookFreshnessScore: number;
  highMarginCandidates: number;
  totalsCandidates: number;
  falseEdgeRate: number;
  executionQualityScore: number;
  closingPriceValueTotal: number;
  riskBudgetRemaining: number;
}

export interface MoneyScores {
  fastMoneyRealismScore: number;
  moneyPressureScore: number;
  moneyPerHourScore: number;
  notes: string[];
}

export interface DailyMoneyPlan {
  cashTarget: number | "custom";
  targetRealistic: boolean;
  targetNote: string;
  realisticTargetRange: { low: number; high: number };
  maxDailyLoss: number;
  maxTrades: number;
  bestSports: string[];
  bestLeagues: string[];
  bestMarketTypes: string[];
  scanPriority: string[];
  expectedOpportunities: number;
  manualVsAutoRecommendation: string;
  stayWatchOnly: boolean;
  shouldPause: boolean;
  pauseReason: string | null;
}

const CASH_TARGETS = [5, 10, 15, 25] as const;

function closedLiveTrades(trades: TrackedTradeRecord[]): TrackedTradeRecord[] {
  return trades.filter(
    (t) => t.lifecycle === "CLOSED" && t.mode === "LIVE" && t.realizedPnl != null
  );
}

function closedPaperTrades(trades: TrackedTradeRecord[]): TrackedTradeRecord[] {
  return trades.filter(
    (t) => t.lifecycle === "CLOSED" && t.mode === "PAPER" && t.realizedPnl != null
  );
}

function closedShadowTrades(trades: TrackedTradeRecord[]): TrackedTradeRecord[] {
  return trades.filter(
    (t) => t.lifecycle === "SIMULATED" && t.mode === "SHADOW"
  );
}

export function computeProfitabilityMetrics(
  trades: TrackedTradeRecord[],
  executionMode: string
): ProfitabilityMetrics {
  const liveClosed = closedLiveTrades(trades);
  const paperClosed = closedPaperTrades(trades);
  const shadowSim = closedShadowTrades(trades);
  const open = trades.filter((t) => t.lifecycle === "OPEN");

  const wins = liveClosed.filter((t) => (t.realizedPnl ?? 0) > 0);
  const losses = liveClosed.filter((t) => (t.realizedPnl ?? 0) < 0);

  const sampleSize = liveClosed.length;
  const winRate = sampleSize >= 5 ? wins.length / sampleSize : null;
  const lossRate = sampleSize >= 5 ? losses.length / sampleSize : null;

  const averageWin =
    wins.length > 0
      ? wins.reduce((s, t) => s + (t.realizedPnl ?? 0), 0) / wins.length
      : null;
  const averageLoss =
    losses.length > 0
      ? losses.reduce((s, t) => s + (t.realizedPnl ?? 0), 0) / losses.length
      : null;

  const totalRealizedPnl = liveClosed.reduce((s, t) => s + (t.realizedPnl ?? 0), 0);
  const totalUnrealizedPnl = open.reduce((s, t) => s + (t.unrealizedPnl ?? 0), 0);
  const totalStake = liveClosed.reduce((s, t) => s + t.finalAllowedStake, 0);
  const roi = totalStake > 0 ? totalRealizedPnl / totalStake : null;

  let running = 0;
  let peak = 0;
  let maxDrawdown = 0;
  for (const t of [...liveClosed].sort((a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt))) {
    running += t.realizedPnl ?? 0;
    peak = Math.max(peak, running);
    maxDrawdown = Math.max(maxDrawdown, peak - running);
  }

  const riskAdjustedReturn =
    roi != null && maxDrawdown > 0 ? roi / (maxDrawdown / Math.max(totalStake, 1)) : roi;

  let status: ProfitabilityStatus = "UNPROVEN";
  if (executionMode === "WATCH") status = "WATCH_ONLY";
  else if (sampleSize >= 10 && totalRealizedPnl > 0 && (winRate ?? 0) >= 0.52) {
    status = "REAL_MONEY_PROVEN";
  } else if (sampleSize >= 3 && totalRealizedPnl > 0) {
    status = "TINY_LIVE_READY";
  } else if (liveClosed.length >= 1) {
    status = "MANUAL_READY";
  } else if (paperClosed.filter((t) => (t.realizedPnl ?? 0) > 0).length >= 3) {
    status = "PAPER_PROFITABLE";
  } else if (shadowSim.length >= 5) {
    status = "SHADOW_PROFITABLE";
  }

  const hmFalse = trades.filter((t) => t.edgeWasReal === false && t.league.includes("margin")).length;
  const hmTotal = trades.filter((t) => t.executableEv != null && t.executableEv > 0.15).length;
  const totalsFalse = trades.filter((t) => t.edgeWasReal === false && t.marketTicker.includes("TOTAL")).length;
  const totalsTotal = trades.filter((t) => t.marketTicker.includes("TOTAL")).length;

  return {
    status,
    dataLabel:
      sampleSize >= 5
        ? "TRACKED_RESULTS"
        : paperClosed.length > 0
          ? "PAPER_ONLY"
          : shadowSim.length > 0
            ? "SHADOW_ONLY"
            : "INSUFFICIENT_DATA",
    sampleSize,
    closedTrades: liveClosed.length,
    openTrades: open.length,
    winRate,
    lossRate,
    averageWin,
    averageLoss,
    maxDrawdown: sampleSize >= 3 ? maxDrawdown : null,
    roi,
    riskAdjustedReturn,
    totalRealizedPnl,
    totalUnrealizedPnl,
    totalExpectedDollarValue: trades.reduce((s, t) => s + (t.expectedDollarValue ?? 0), 0),
    totalExecutableEvCaptured: trades.reduce((s, t) => s + (t.executableEv ?? 0), 0),
    highMarginFalseEdgeRate: hmTotal > 0 ? hmFalse / hmTotal : null,
    totalsFalseEdgeRate: totalsTotal > 0 ? totalsFalse / totalsTotal : null,
    blockedCorrectlyCount: trades.filter((t) => t.blockedCorrectly === true).length,
    botMissedProfitCount: trades.filter((t) => t.botMissedProfit === true).length,
    manualDelayHurtCount: trades.filter((t) => t.manualDelayHurt === true).length,
    autoWouldHaveCapturedCount: trades.filter((t) => t.autoWouldHaveCaptured === true).length,
    note:
      sampleSize < 5
        ? "Insufficient tracked live results — win rate not displayed as claim"
        : "Metrics based on tracked results only — not theoretical EV",
  };
}

export function computeMoneyScores(input: MoneyScoresInput): MoneyScores {
  const notes: string[] = [];
  let fast = 50;
  let pressure = 50;
  let perHour = 0;

  if (input.keyHealthGreen) fast += 10;
  else { fast -= 20; notes.push("Key health not GREEN"); }

  if (input.dataFreshnessScore >= 80) fast += 10;
  if (input.orderbookFreshnessScore >= 80) fast += 10;
  if (input.avgFillProbability >= 0.7) fast += 10;
  if (input.falseEdgeRate > 0.3) { fast -= 25; notes.push("Elevated false-edge rate"); }
  if (input.executionQualityScore < 60) { fast -= 15; notes.push("Weak execution quality"); }

  fast = Math.max(0, Math.min(100, fast));

  pressure = Math.min(
    100,
    Math.round(
      (input.totalExpectedDollarValue / Math.max(input.bankroll, 1)) * 100 +
        input.highMarginCandidates * 2 +
        input.totalsCandidates
    )
  );
  if (input.riskBudgetRemaining < 0.2) {
    pressure += 20;
    notes.push("Risk budget low");
  }

  perHour =
    input.bankroll > 0
      ? Math.round(
          ((input.totalExpectedDollarValue / Math.max(input.bankroll, 1)) * 100 *
            input.avgEdgeSurvival) /
            24
        )
      : 0;

  if (input.autoReady) notes.push("Auto readiness factored in");
  if (input.manualDelayMs > 30_000) notes.push("Manual delay may reduce capture rate");

  return {
    fastMoneyRealismScore: fast,
    moneyPressureScore: Math.min(100, pressure),
    moneyPerHourScore: perHour,
    notes,
  };
}

export function buildDailyMoneyPlan(input: {
  bankroll: number;
  cashTarget: number;
  avgNetEdge: number;
  avgExpectedProfit: number;
  opportunitiesPerDay: number;
  falseEdgeRate: number;
  executionMode: string;
  healthGreen: boolean;
  dailyLossCap: number;
  maxTrades: number;
}): DailyMoneyPlan {
  const edgePerTrade = input.avgExpectedProfit;
  const maxRealisticDaily = edgePerTrade * input.opportunitiesPerDay * (1 - input.falseEdgeRate);
  const targetRealistic = maxRealisticDaily >= input.cashTarget * 0.5;

  return {
    cashTarget: CASH_TARGETS.includes(input.cashTarget as (typeof CASH_TARGETS)[number])
      ? input.cashTarget
      : "custom",
    targetRealistic,
    targetNote: targetRealistic
      ? `Realistic range based on ${input.opportunitiesPerDay} opps/day at current edge`
      : "TARGET_NOT_REALISTIC_WITH_CURRENT_EDGE_AND_BANKROLL",
    realisticTargetRange: {
      low: Math.round(maxRealisticDaily * 0.3 * 100) / 100,
      high: Math.round(maxRealisticDaily * 100) / 100,
    },
    maxDailyLoss: input.dailyLossCap,
    maxTrades: input.maxTrades,
    bestSports: ["basketball_nba", "americanfootball_nfl"],
    bestLeagues: ["NBA", "NFL"],
    bestMarketTypes: ["MONEYLINE", "SPREAD", "TOTAL"],
    scanPriority: ["BETTABLE near settlement", "Fast-decay live", "High-margin verified"],
    expectedOpportunities: input.opportunitiesPerDay,
    manualVsAutoRecommendation:
      input.executionMode === "AUTO"
        ? "Auto active — per-trade validation required"
        : input.healthGreen
          ? "Manual with strict gates recommended until track record proven"
          : "Stay WATCH_ONLY until health GREEN",
    stayWatchOnly: !input.healthGreen || input.falseEdgeRate > 0.35,
    shouldPause: input.falseEdgeRate > 0.4 || !input.healthGreen,
    pauseReason:
      input.falseEdgeRate > 0.4
        ? "False-edge rate too high"
        : !input.healthGreen
          ? "Provider health not GREEN"
          : null,
  };
}

export { CASH_TARGETS };
