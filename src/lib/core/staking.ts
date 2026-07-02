/**
 * Stake intelligence — AI recommendation + risk capping.
 */

import { RISK_CONFIG, STAKE_BLOCK_CODES } from "@/lib/core/risk-config";
import type { ScoredOpportunity, StakeDecision, StakeMode } from "@/lib/core/types";

export interface StakeEngineInput {
  mode: StakeMode;
  bankroll: number;
  userMaxStake: number;
  fixedDollarAmount: number;
  fixedPercentAmount: number;
  opportunity: ScoredOpportunity;
  recentDrawdownPercent?: number;
  openExposureDollars?: number;
  dailyLossUsedDollars?: number;
  correlatedExposureDollars?: number;
}

export function computeUserRequestedStake(input: StakeEngineInput): number {
  const { bankroll, mode } = input;
  switch (mode) {
    case "FIXED_DOLLAR_STAKE":
      return input.fixedDollarAmount;
    case "FIXED_PERCENT_STAKE":
      return (input.fixedPercentAmount / 100) * bankroll;
    case "AI_RECOMMENDED_STAKE":
      return computeAiRecommendedStake(input);
    case "AI_WITH_USER_MAX":
      return Math.min(computeAiRecommendedStake(input), input.userMaxStake);
    case "AUTO_RISK_CAPPED":
      return Math.min(
        computeAiRecommendedStake(input),
        bankroll * (RISK_CONFIG.conservativeStakePercent / 100)
      );
    default:
      return input.fixedDollarAmount;
  }
}

export function computeAiRecommendedStake(input: StakeEngineInput): number {
  const { bankroll, opportunity: o } = input;
  if (bankroll <= 0) return 0;

  const basePct = RISK_CONFIG.conservativeStakePercent / 100;
  let stake = bankroll * basePct;

  const edgeBoost = Math.min(0.005, o.edgeBreakdown.netEdge * 0.02);
  const eqsBoost = (o.edgeQualityScore / 100) * 0.003 * bankroll;
  const mcsBoost = (o.moneyConfidenceScore / 100) * 0.002 * bankroll;
  const liquidityCap = o.fillableNotional * 0.5;

  stake += edgeBoost * bankroll + eqsBoost + mcsBoost;
  stake *= o.fillProbability * o.edgeSurvivalConfidence;

  if (o.highMarginStatus.startsWith("UNCONFIRMED")) stake *= 0.5;
  if (input.recentDrawdownPercent && input.recentDrawdownPercent > 1) stake *= 0.75;
  if (input.openExposureDollars && input.openExposureDollars > bankroll * 0.05) stake *= 0.8;

  const maxManual = bankroll * (RISK_CONFIG.maxManualStakePercent / 100);
  stake = Math.min(stake, maxManual, liquidityCap, input.userMaxStake);

  return Math.max(0, Math.round(stake * 100) / 100);
}

export function computeStakeDecision(input: StakeEngineInput): StakeDecision {
  const bankroll = input.bankroll;
  const userRequested = computeUserRequestedStake(input);
  const aiRecommended = computeAiRecommendedStake(input);

  if (bankroll <= 0) {
    return {
      userRequestedStake: userRequested,
      aiRecommendedStake: aiRecommended,
      finalAllowedStake: 0,
      maxLoss: 0,
      expectedDollarProfit: 0,
      decision: "BLOCKED",
      reason: STAKE_BLOCK_CODES.BLOCKED,
    };
  }

  const pctOfBankroll = (userRequested / bankroll) * 100;
  if (pctOfBankroll >= 100) {
    return {
      userRequestedStake: userRequested,
      aiRecommendedStake: aiRecommended,
      finalAllowedStake: 0,
      maxLoss: 0,
      expectedDollarProfit: 0,
      decision: "BLOCKED",
      reason: STAKE_BLOCK_CODES.FULL_BANKROLL,
    };
  }

  const maxManual = bankroll * (RISK_CONFIG.maxManualStakePercent / 100);
  const dailyLossCap = bankroll * (RISK_CONFIG.maxDailyRealizedLossPercent / 100);
  const dailyLossRemaining = dailyLossCap - (input.dailyLossUsedDollars ?? 0);

  if (dailyLossRemaining <= 0) {
    return {
      userRequestedStake: userRequested,
      aiRecommendedStake: aiRecommended,
      finalAllowedStake: 0,
      maxLoss: 0,
      expectedDollarProfit: 0,
      decision: "BLOCKED",
      reason: "Daily loss limit reached",
    };
  }

  let finalAllowed = Math.min(userRequested, aiRecommended, maxManual, input.userMaxStake, dailyLossRemaining);

  if (input.opportunity.executableKalshiAsk != null && input.opportunity.executableKalshiAsk > 0) {
    finalAllowed = Math.min(finalAllowed, input.opportunity.fillableNotional);
  }

  if (finalAllowed <= 0) {
    return {
      userRequestedStake: userRequested,
      aiRecommendedStake: aiRecommended,
      finalAllowedStake: 0,
      maxLoss: 0,
      expectedDollarProfit: 0,
      decision: "BLOCKED",
      reason: STAKE_BLOCK_CODES.BLOCKED,
    };
  }

  const reduced = finalAllowed < userRequested - 0.01;
  const expectedDollarProfit =
    (finalAllowed / Math.max(userRequested, 1)) * input.opportunity.expectedDollarProfit;

  return {
    userRequestedStake: Math.round(userRequested * 100) / 100,
    aiRecommendedStake: Math.round(aiRecommended * 100) / 100,
    finalAllowedStake: Math.round(finalAllowed * 100) / 100,
    maxLoss: Math.round(finalAllowed * 100) / 100,
    expectedDollarProfit: Math.round(expectedDollarProfit * 100) / 100,
    decision: reduced ? "REDUCED" : "ALLOWED",
    reason: reduced ? STAKE_BLOCK_CODES.REDUCED : "Stake approved by risk engine",
  };
}
