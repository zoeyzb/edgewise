/**
 * Opportunity profit engine — scores, ranks, explains candidates.
 */

import { computeEdgeSurvival } from "@/lib/core/edge-decay";
import { computeEdgeQualityScore } from "@/lib/core/edge-quality";
import {
  BLOCK_BELOW_MIN,
  classifyExpectedValueBucket,
  computeEdgeBreakdown,
  computeExpectedDollarValue,
  grossEdgeFromFairAndAsk,
} from "@/lib/core/ev";
import { verifyHighMarginEdge } from "@/lib/core/high-margin";
import { assessLiquidity } from "@/lib/core/liquidity";
import { computeMoneyConfidenceScore } from "@/lib/core/money-confidence";
import { matchMarket } from "@/lib/core/matcher";
import {
  metricsFromExecutableOrderbook,
  pickExecutableAsk,
  spreadAsFraction,
} from "@/lib/core/orderbook";
import { computeNoVigFairProbability, extractH2hBooks, NO_VIG_UNAVAILABLE } from "@/lib/core/probability";
import { computeProfitPriorityScore } from "@/lib/core/profit-priority";
import { computeOpportunityStake, confidenceLabel } from "@/lib/core/staking";
import type { KalshiExecutableOrderbook } from "@/lib/core/contracts";
import type {
  EventMatchCandidate,
  OpportunityDecisionState,
  ScoredOpportunity,
  StakeSettings,
} from "@/lib/core/types";

const DEFAULT_SLIPPAGE = 0.005;
const STALE_BUFFER = 0.01;
const DEFAULT_STAKE = 50;

export interface BuildOpportunityInput {
  id: string;
  sportKey: string;
  league: string;
  kalshiMarketTicker: string;
  kalshiMarketTitle: string;
  kalshiEventTicker: string;
  kalshiEventTitle?: string;
  kalshiMarketStatus?: string;
  orderbook: KalshiExecutableOrderbook & { blockedReason?: string | null };
  oddsEvent: Record<string, unknown>;
  targetTeamName: string;
  opponentTeamName: string;
  side: "YES" | "NO";
  isLive?: boolean;
  currentScore?: string | null;
  clockPeriod?: string | null;
  scoreFresh?: boolean;
  oddsFresh?: boolean;
  requestedStake?: number;
  oddsMarketKey?: string;
  bankroll?: number;
  stakeSettings?: StakeSettings;
}

export function buildScoredOpportunity(input: BuildOpportunityInput): ScoredOpportunity {
  const obMetrics = metricsFromExecutableOrderbook(input.orderbook);
  const executableAsk = pickExecutableAsk(input.side, obMetrics);
  const orderbookFresh = obMetrics.freshnessState === "FRESH";

  const homeTeam =
    typeof input.oddsEvent.home_team === "string" ? input.oddsEvent.home_team : input.targetTeamName;
  const awayTeam =
    typeof input.oddsEvent.away_team === "string" ? input.oddsEvent.away_team : input.opponentTeamName;
  const commenceTime =
    typeof input.oddsEvent.commence_time === "string" ? input.oddsEvent.commence_time : null;
  const oddsEventId = typeof input.oddsEvent.id === "string" ? input.oddsEvent.id : "";

  const kalshiEvent: EventMatchCandidate = {
    eventTicker: input.kalshiEventTicker,
    sportKey: input.sportKey,
    league: input.league,
    startTimeIso: commenceTime,
    homeTeam,
    awayTeam,
  };

  const oddsEvent: EventMatchCandidate = {
    eventTicker: oddsEventId,
    oddsEventId,
    sportKey: input.sportKey,
    league: input.league,
    startTimeIso: commenceTime,
    homeTeam,
    awayTeam,
  };

  const matchResult = matchMarket({
    sportKey: input.sportKey,
    kalshiEventTicker: input.kalshiEventTicker,
    kalshiMarketTicker: input.kalshiMarketTicker,
    kalshiMarketTitle: input.kalshiMarketTitle,
    oddsMarketKey: input.oddsMarketKey ?? "h2h",
    kalshiEvent,
    oddsEvent,
    isLive: input.isLive ?? false,
    orderbookSource: obMetrics.source,
    wsFreshness: obMetrics.freshnessState,
    scoreFeedFresh: input.scoreFresh ?? !input.isLive,
    oddsFeedFresh: input.oddsFresh ?? true,
    clockKnown: input.clockPeriod != null || !input.isLive,
    strategyDependsOnClock: false,
  });

  const bookmakers = Array.isArray(input.oddsEvent.bookmakers) ? input.oddsEvent.bookmakers : [];
  const books = extractH2hBooks(bookmakers, input.targetTeamName, input.opponentTeamName);
  const noVig = computeNoVigFairProbability({
    books,
    targetTeamName: input.targetTeamName,
    opponentName: input.opponentTeamName,
  });

  const stake = input.requestedStake ?? DEFAULT_STAKE;
  const bankroll = input.bankroll ?? 1000;
  const fairProb =
    noVig.available && noVig.fairProbability != null
      ? input.side === "YES"
        ? noVig.fairProbability
        : 1 - noVig.fairProbability
      : null;

  const grossEdge =
    fairProb != null && executableAsk != null
      ? grossEdgeFromFairAndAsk(fairProb, executableAsk)
      : 0;

  const liquidity = assessLiquidity({
    orderbook: obMetrics,
    side: input.side,
    requestedStake: stake,
  });

  const spreadFrac = spreadAsFraction(obMetrics);
  const staleBuffer =
    !orderbookFresh || input.oddsFresh === false ? STALE_BUFFER : 0;

  const edgeBreakdown = computeEdgeBreakdown({
    grossEdge,
    spreadFraction: spreadFrac / 2,
    slippageFraction: DEFAULT_SLIPPAGE,
    staleDataBuffer: staleBuffer,
    partialFillPenalty: liquidity.partialFillRisk * 0.02,
    stakeDollars: stake,
    executableAsk: executableAsk ?? 0.5,
    fairProbability: fairProb ?? 0.5,
    confidencePenalty: noVig.confidencePenalty,
  });

  const edgeSurvival = computeEdgeSurvival({
    orderbookFresh,
    oddsFresh: input.oddsFresh ?? true,
    spreadFraction: spreadFrac,
    netEdge: edgeBreakdown.netEdge,
    bookmakerCount: noVig.bookmakerCount,
    disagreement: noVig.disagreement,
    isLive: input.isLive ?? false,
  });

  const executionConfidence = liquidity.fillProbability * (matchResult.eventMatch.confidence === "HIGH" ? 1 : 0.7);
  const expectedDollarProfit = computeExpectedDollarValue({
    netEdge: Math.max(0, edgeBreakdown.netEdge),
    fillableNotional: liquidity.fillableNotional,
    executionConfidence,
    edgeSurvivalConfidence: edgeSurvival.confidence,
  });

  const minutesToStart = commenceTime
    ? Math.max(1, (Date.parse(commenceTime) - Date.now()) / 60000)
    : 60;
  const expectedProfitPerMinute = expectedDollarProfit / Math.max(1, minutesToStart);
  const expectedProfitPerSecond = expectedProfitPerMinute / 60;

  const edgeQualityScore = computeEdgeQualityScore({
    matchConfidence: matchResult.eventMatch.confidence,
    settlementExact: matchResult.settlement.exact,
    oddsFresh: input.oddsFresh ?? true,
    orderbookFresh,
    scoreFresh: input.scoreFresh ?? !input.isLive,
    bookmakerCount: noVig.bookmakerCount,
    disagreement: noVig.disagreement,
    liquidityScore: liquidity.liquidityScore,
    spreadFraction: spreadFrac,
    slippageFraction: DEFAULT_SLIPPAGE,
    netEdge: edgeBreakdown.netEdge,
    edgeSurvivalConfidence: edgeSurvival.confidence,
  });

  const valueBucket = classifyExpectedValueBucket(expectedDollarProfit);

  const moneyConfidenceScore = computeMoneyConfidenceScore({
    edgeQualityScore,
    expectedDollarValue: expectedDollarProfit,
    liquidityScore: liquidity.liquidityScore,
    fillProbability: liquidity.fillProbability,
    closingPriceValuePotential: edgeSurvival.survives30s ? 0.8 : 0.4,
    falseEdgeRisk: edgeBreakdown.netEdge > 0.3 ? 0.4 : 0.15,
    marketTypeReliability: matchResult.marketTypeLevel === "LEVEL_1_DIRECT_COMPARABLE" ? 1 : 0.5,
    sportReliability: 0.85,
    dataFreshness: orderbookFresh && (input.oddsFresh ?? true) ? 1 : 0.4,
  });

  const profitPriorityScore = computeProfitPriorityScore({
    expectedDollarProfit,
    expectedProfitPerMinute,
    netEdge: edgeBreakdown.netEdge,
    urgency: input.isLive ? 1 : 0.5,
    liquidityScore: liquidity.liquidityScore,
    fillProbability: liquidity.fillProbability,
    riskAdjustedReturn: edgeBreakdown.netEdge * liquidity.fillProbability,
    valueBucket,
  });

  const highMargin = verifyHighMarginEdge({
    netEdge: edgeBreakdown.netEdge,
    grossEdge: edgeBreakdown.grossEdge,
    matchConfidenceHigh: matchResult.eventMatch.confidence === "HIGH",
    settlementExact: matchResult.settlement.exact,
    orderbookFresh,
    oddsFresh: input.oddsFresh ?? true,
    executableAskKnown: executableAsk != null,
    fillableNotional: liquidity.fillableNotional,
    marketActive: input.kalshiMarketStatus === "active" || input.kalshiMarketStatus == null,
    survives5s: edgeSurvival.survives5s,
    survives15s: edgeSurvival.survives15s,
    survives30s: edgeSurvival.survives30s,
    bookmakerCount: noVig.bookmakerCount,
    expectedDollarValue: expectedDollarProfit,
    isLive: input.isLive ?? false,
    scoreFresh: input.scoreFresh,
    clockKnown: input.clockPeriod != null,
  });

  let state: OpportunityDecisionState = matchResult.decision.state;
  let reason = matchResult.decision.reason;

  if (!noVig.available) {
    state = "UNCONFIRMED";
    reason = NO_VIG_UNAVAILABLE;
  } else if (edgeBreakdown.belowMinimum) {
    state = "BLOCKED";
    reason = BLOCK_BELOW_MIN;
  } else if (executableAsk == null) {
    state = "UNCONFIRMED";
    reason = "executable ask unknown";
  } else if (
    highMargin.status === "BLOCKED — HIGH_MARGIN_EDGE_FAILED_VERIFICATION" &&
    edgeBreakdown.edgeTier === "HIGH_MARGIN_EDGE"
  ) {
    state = "BLOCKED";
    reason = highMargin.reason;
  } else if (
    state === "BETTABLE" &&
    highMargin.status.startsWith("UNCONFIRMED") &&
    edgeBreakdown.netEdge >= 0.3
  ) {
    state = "UNCONFIRMED";
    reason = highMargin.reason;
  }

  const stakeDecision = input.stakeSettings
    ? computeOpportunityStake({
        bankroll,
        stakeSettings: input.stakeSettings,
        opportunity: {
          id: input.id,
          sport: input.sportKey,
          league: input.league,
          game: `${awayTeam} @ ${homeTeam}`,
          teams: { home: homeTeam, away: awayTeam },
          startTime: commenceTime,
          liveStatus: input.isLive ? "LIVE" : commenceTime && Date.parse(commenceTime) > Date.now() ? "PRE_GAME" : "UNKNOWN",
          kalshiEvent: input.kalshiEventTicker,
          kalshiMarket: input.kalshiMarketTitle,
          kalshiTicker: input.kalshiMarketTicker,
          sportsbookEvent: oddsEventId,
          sportsbookMarket: input.oddsMarketKey ?? "h2h",
          side: input.side,
          matchConfidence: matchResult.eventMatch.confidence,
          settlementConfidence: matchResult.settlement.exact
            ? "EXACT"
            : matchResult.settlement.status === "MISMATCH"
              ? "MISMATCH"
              : "UNCONFIRMED",
          marketTypeLevel: matchResult.marketTypeLevel,
          scopePeriod: matchResult.settlement.scope,
          overtimeTreatment: matchResult.settlement.overtimeHandling,
          currentScore: input.currentScore ?? null,
          clockPeriod: input.clockPeriod ?? null,
          executableKalshiAsk: executableAsk,
          orderbookFreshness: obMetrics.freshnessState,
          oddsFreshness: input.oddsFresh === false ? "STALE" : "FRESH",
          scoreFreshness: input.isLive ? (input.scoreFresh ? "FRESH" : "STALE") : "N/A",
          noVigFairProbability: fairProb,
          bookmakerCount: noVig.bookmakerCount,
          sportsbookDisagreement: noVig.disagreement,
          liquidity: liquidity.label,
          fillableNotional: liquidity.fillableNotional,
          edgeBreakdown: {
            grossEdge: edgeBreakdown.grossEdge,
            fees: edgeBreakdown.fees,
            spread: edgeBreakdown.spread,
            slippage: edgeBreakdown.slippage,
            staleDataBuffer: edgeBreakdown.staleDataBuffer,
            partialFillRisk: edgeBreakdown.partialFillRisk,
            confidencePenalty: edgeBreakdown.confidencePenalty,
            netEdge: edgeBreakdown.netEdge,
            edgeTier: edgeBreakdown.edgeTier,
            blockCode: edgeBreakdown.blockCode,
          },
          expectedDollarProfit,
          expectedProfitPerSecond,
          expectedProfitPerMinute,
          edgeSurvivalConfidence: edgeSurvival.confidence,
          fillProbability: liquidity.fillProbability,
          edgeQualityScore,
          moneyConfidenceScore,
          profitPriorityScore,
          userRequestedStake: stake,
          aiRecommendedStake: 0,
          suggestedStake: 0,
          finalAllowedStake: 0,
          maxLoss: 0,
          stakeDecision: "BLOCKED",
          stakeReason: "",
          confidenceLevel: "",
          autoAllowed: false,
          manualOnly: true,
          state,
          reason,
          highMarginStatus: highMargin.status,
          valueBucket,
          executeReadiness: state === "BETTABLE" ? "PER_TRADE_VALIDATION_REQUIRED" : "BLOCKED",
          dataLabel: "REAL_PROVIDER_DATA",
        },
      })
    : null;

  const resolvedStake = stakeDecision ?? {
    userRequestedStake: stake,
    aiRecommendedStake: Math.min(stake, liquidity.fillableNotional * 0.5),
    suggestedStake: Math.min(stake, liquidity.fillableNotional * 0.5),
    finalAllowedStake: state === "BETTABLE" ? Math.min(stake, liquidity.fillableNotional * 0.5) : 0,
    maxLoss: state === "BETTABLE" ? Math.min(stake, liquidity.fillableNotional * 0.5) : 0,
    expectedDollarProfit,
    decision: "ALLOWED" as const,
    reason: "default stake",
    confidenceLevel: "normal_validated",
    autoAllowed: false,
    manualOnly: true,
  };

  const finalAllowedStake =
    state === "BETTABLE" ? resolvedStake.finalAllowedStake : 0;
  const maxLoss = finalAllowedStake;
  const scaledProfit =
    finalAllowedStake > 0 && stake > 0
      ? (finalAllowedStake / stake) * expectedDollarProfit
      : 0;

  return {
    id: input.id,
    sport: input.sportKey,
    league: input.league,
    game: `${awayTeam} @ ${homeTeam}`,
    teams: { home: homeTeam, away: awayTeam },
    startTime: commenceTime,
    liveStatus: input.isLive ? "LIVE" : commenceTime && Date.parse(commenceTime) > Date.now() ? "PRE_GAME" : "UNKNOWN",
    kalshiEvent: input.kalshiEventTicker,
    kalshiMarket: input.kalshiMarketTitle,
    kalshiTicker: input.kalshiMarketTicker,
    sportsbookEvent: oddsEventId,
    sportsbookMarket: input.oddsMarketKey ?? "h2h",
    side: input.side,
    matchConfidence: matchResult.eventMatch.confidence,
    settlementConfidence: matchResult.settlement.exact
      ? "EXACT"
      : matchResult.settlement.status === "MISMATCH"
        ? "MISMATCH"
        : "UNCONFIRMED",
    marketTypeLevel: matchResult.marketTypeLevel,
    scopePeriod: matchResult.settlement.scope,
    overtimeTreatment: matchResult.settlement.overtimeHandling,
    currentScore: input.currentScore ?? null,
    clockPeriod: input.clockPeriod ?? null,
    executableKalshiAsk: executableAsk,
    orderbookFreshness: obMetrics.freshnessState,
    oddsFreshness: input.oddsFresh === false ? "STALE" : "FRESH",
    scoreFreshness: input.isLive ? (input.scoreFresh ? "FRESH" : "STALE") : "N/A",
    noVigFairProbability: fairProb,
    bookmakerCount: noVig.bookmakerCount,
    sportsbookDisagreement: noVig.disagreement,
    liquidity: liquidity.label,
    fillableNotional: liquidity.fillableNotional,
    edgeBreakdown: {
      grossEdge: edgeBreakdown.grossEdge,
      fees: edgeBreakdown.fees,
      spread: edgeBreakdown.spread,
      slippage: edgeBreakdown.slippage,
      staleDataBuffer: edgeBreakdown.staleDataBuffer,
      partialFillRisk: edgeBreakdown.partialFillRisk,
      confidencePenalty: edgeBreakdown.confidencePenalty,
      netEdge: edgeBreakdown.netEdge,
      edgeTier: edgeBreakdown.edgeTier,
      blockCode: edgeBreakdown.blockCode,
    },
    expectedDollarProfit: scaledProfit,
    expectedProfitPerSecond,
    expectedProfitPerMinute,
    edgeSurvivalConfidence: edgeSurvival.confidence,
    fillProbability: liquidity.fillProbability,
    edgeQualityScore,
    moneyConfidenceScore,
    profitPriorityScore,
    userRequestedStake: resolvedStake.userRequestedStake,
    aiRecommendedStake: resolvedStake.aiRecommendedStake,
    suggestedStake: resolvedStake.suggestedStake ?? resolvedStake.aiRecommendedStake,
    finalAllowedStake,
    maxLoss,
    stakeDecision: state === "BETTABLE" ? resolvedStake.decision : "BLOCKED",
    stakeReason: resolvedStake.reason,
    confidenceLevel:
      typeof resolvedStake.confidenceLevel === "string" &&
      ["risky_or_uncertain", "normal_validated", "strong_validated", "highest_confidence"].includes(
        resolvedStake.confidenceLevel
      )
        ? confidenceLabel(resolvedStake.confidenceLevel as import("@/lib/core/staking").ConfidenceLevel)
        : confidenceLabel("normal_validated"),
    autoAllowed: resolvedStake.autoAllowed ?? false,
    manualOnly: resolvedStake.manualOnly ?? true,
    state,
    reason,
    highMarginStatus: highMargin.status,
    valueBucket,
    executeReadiness:
      state === "BETTABLE" ? "PER_TRADE_VALIDATION_REQUIRED" : "BLOCKED",
    dataLabel: "REAL_PROVIDER_DATA",
  };
}

export function sanitizeOpportunityForClient(item: ScoredOpportunity): ScoredOpportunity {
  return item;
}
