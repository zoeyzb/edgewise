/**
 * Stake intelligence — user input, suggested stake, risk capping.
 */

import { RISK_CONFIG, STAKE_BLOCK_CODES } from "@/lib/core/risk-config";
import type { ScoredOpportunity, StakeDecision, StakeMode, StakeSettings } from "@/lib/core/types";

export interface StakeEngineInput {
  mode: StakeMode;
  bankroll: number;
  userMaxStake: number;
  fixedDollarAmount: number;
  fixedPercentAmount: number;
  manualStakeMode?: "DOLLAR" | "PERCENT" | "SUGGESTED";
  autoFixedDollarAmount?: number;
  autoFixedPercentAmount?: number;
  autoMaxDollar?: number;
  autoMaxPercent?: number;
  opportunity: ScoredOpportunity;
  recentDrawdownPercent?: number;
  openExposureDollars?: number;
  dailyLossUsedDollars?: number;
  correlatedExposureDollars?: number;
  /** When true, allow stakes up to maxManualStakePercent (25%). */
  manualHighStakeConfirmed?: boolean;
  /** When true, apply Auto hard caps. */
  forAuto?: boolean;
}

export type ConfidenceLevel =
  | "risky_or_uncertain"
  | "normal_validated"
  | "strong_validated"
  | "highest_confidence";

export function classifyOpportunityConfidence(o: ScoredOpportunity): ConfidenceLevel {
  if (
    o.state === "BLOCKED" ||
    o.matchConfidence === "LOW" ||
    o.edgeBreakdown.edgeTier === "BLOCKED_BELOW_MIN" ||
    o.liquidity === "VERY_LOW"
  ) {
    return "risky_or_uncertain";
  }
  if (
    o.state === "BETTABLE" &&
    o.matchConfidence === "HIGH" &&
    o.settlementConfidence === "EXACT" &&
    (o.edgeBreakdown.edgeTier === "HIGH_MARGIN_EDGE" ||
      o.edgeBreakdown.edgeTier === "EXTREME_MARGIN_EDGE" ||
      o.edgeBreakdown.edgeTier === "RARE_EDGE" ||
      o.moneyConfidenceScore >= 80)
  ) {
    return "highest_confidence";
  }
  if (
    o.edgeBreakdown.edgeTier === "STRONG_EDGE" ||
    o.edgeBreakdown.edgeTier === "HIGH_MARGIN_EDGE" ||
    o.moneyConfidenceScore >= 70
  ) {
    return "strong_validated";
  }
  return "normal_validated";
}

export function maxStakePercentForConfidence(level: ConfidenceLevel, forAuto: boolean): number {
  if (forAuto) return RISK_CONFIG.autoHardMaxStakePercent;
  switch (level) {
    case "risky_or_uncertain":
      return RISK_CONFIG.riskyStakePercentMax;
    case "normal_validated":
      return RISK_CONFIG.conservativeStakePercent;
    case "strong_validated":
      return RISK_CONFIG.strongStakePercentMax;
    case "highest_confidence":
      return RISK_CONFIG.maxManualStakePercent;
    default:
      return RISK_CONFIG.conservativeStakePercent;
  }
}

export function computeSuggestedStake(input: {
  bankroll: number;
  opportunity: ScoredOpportunity;
  forAuto?: boolean;
}): number {
  const { bankroll, opportunity: o, forAuto } = input;
  if (bankroll <= 0) return 0;
  const level = classifyOpportunityConfidence(o);
  const pct = forAuto
    ? Math.min(RISK_CONFIG.autoDefaultMaxStakePercent, maxStakePercentForConfidence(level, true))
    : maxStakePercentForConfidence(level, false);
  let stake = bankroll * (pct / 100);

  const liquidityCap = o.fillableNotional * 0.5;
  stake = Math.min(stake, liquidityCap);
  stake *= o.fillProbability * Math.max(0.5, o.edgeSurvivalConfidence);

  if (level === "risky_or_uncertain") {
    stake = Math.min(stake, bankroll * (RISK_CONFIG.riskyStakePercentMax / 100));
  }

  return Math.max(0, Math.round(stake * 100) / 100);
}

export function computeUserRequestedStake(input: StakeEngineInput): number {
  const { bankroll, mode, forAuto } = input;

  if (forAuto) {
    if (input.autoFixedDollarAmount != null && input.autoFixedDollarAmount > 0) {
      return input.autoFixedDollarAmount;
    }
    if (input.autoFixedPercentAmount != null && input.autoFixedPercentAmount > 0) {
      return (input.autoFixedPercentAmount / 100) * bankroll;
    }
    return computeSuggestedStake({ bankroll, opportunity: input.opportunity, forAuto: true });
  }

  if (input.manualStakeMode === "SUGGESTED") {
    return computeSuggestedStake({ bankroll, opportunity: input.opportunity });
  }
  if (input.manualStakeMode === "DOLLAR" || mode === "FIXED_DOLLAR_STAKE") {
    return input.fixedDollarAmount;
  }
  if (input.manualStakeMode === "PERCENT" || mode === "FIXED_PERCENT_STAKE") {
    return (input.fixedPercentAmount / 100) * bankroll;
  }

  switch (mode) {
    case "AI_RECOMMENDED_STAKE":
      return computeSuggestedStake({ bankroll, opportunity: input.opportunity });
    case "AI_WITH_USER_MAX":
      return Math.min(
        computeSuggestedStake({ bankroll, opportunity: input.opportunity }),
        input.userMaxStake
      );
    case "AUTO_RISK_CAPPED":
      return Math.min(
        computeSuggestedStake({ bankroll, opportunity: input.opportunity, forAuto: true }),
        bankroll * (RISK_CONFIG.autoDefaultMaxStakePercent / 100)
      );
    default:
      return input.fixedDollarAmount;
  }
}

export function computeAiRecommendedStake(input: StakeEngineInput): number {
  return computeSuggestedStake({
    bankroll: input.bankroll,
    opportunity: input.opportunity,
    forAuto: input.forAuto,
  });
}

export function computeStakeDecision(input: StakeEngineInput): StakeDecision {
  const bankroll = input.bankroll;
  const userRequested = computeUserRequestedStake(input);
  const aiRecommended = computeAiRecommendedStake(input);
  const level = classifyOpportunityConfidence(input.opportunity);
  const forAuto = input.forAuto === true;

  if (bankroll <= 0) {
    return stakeDecision({
      userRequested,
      aiRecommended,
      finalAllowed: 0,
      decision: "BLOCKED",
      reason: STAKE_BLOCK_CODES.BLOCKED,
      confidenceLevel: level,
      autoAllowed: false,
      manualOnly: true,
    });
  }

  const pctOfBankroll = (userRequested / bankroll) * 100;
  if (pctOfBankroll >= 100) {
    return stakeDecision({
      userRequested,
      aiRecommended,
      finalAllowed: 0,
      decision: "BLOCKED",
      reason: STAKE_BLOCK_CODES.FULL_BANKROLL,
      confidenceLevel: level,
      autoAllowed: false,
      manualOnly: true,
    });
  }

  if (pctOfBankroll >= RISK_CONFIG.absoluteBlockStakePercent) {
    return stakeDecision({
      userRequested,
      aiRecommended,
      finalAllowed: 0,
      decision: "BLOCKED",
      reason: STAKE_BLOCK_CODES.ABOVE_ABSOLUTE_MAX,
      confidenceLevel: level,
      autoAllowed: false,
      manualOnly: true,
    });
  }

  const maxPct = maxStakePercentForConfidence(level, forAuto);
  let maxAllowed = bankroll * (maxPct / 100);

  if (forAuto) {
    const autoMaxPct = input.autoMaxPercent ?? RISK_CONFIG.autoHardMaxStakePercent;
    const autoMaxDollar = input.autoMaxDollar ?? bankroll * (autoMaxPct / 100);
    maxAllowed = Math.min(maxAllowed, autoMaxDollar, bankroll * (autoMaxPct / 100));
  }

  const dailyLossCap = bankroll * (RISK_CONFIG.maxDailyRealizedLossPercent / 100);
  const dailyLossRemaining = dailyLossCap - (input.dailyLossUsedDollars ?? 0);
  if (dailyLossRemaining <= 0) {
    return stakeDecision({
      userRequested,
      aiRecommended,
      finalAllowed: 0,
      decision: "BLOCKED",
      reason: "Daily loss limit reached",
      confidenceLevel: level,
      autoAllowed: false,
      manualOnly: true,
    });
  }

  let finalAllowed = Math.min(userRequested, maxAllowed, input.userMaxStake, dailyLossRemaining);

  if (
    !forAuto &&
    pctOfBankroll >= RISK_CONFIG.manualConfirmStakePercent &&
    !input.manualHighStakeConfirmed
  ) {
    finalAllowed = Math.min(finalAllowed, bankroll * (RISK_CONFIG.manualConfirmStakePercent / 100));
    if (userRequested > finalAllowed + 0.01) {
      return stakeDecision({
        userRequested,
        aiRecommended,
        finalAllowed: Math.round(finalAllowed * 100) / 100,
        decision: "REDUCED",
        reason: STAKE_BLOCK_CODES.MANUAL_CONFIRM_REQUIRED,
        confidenceLevel: level,
        autoAllowed: false,
        manualOnly: true,
      });
    }
  }

  if (forAuto && pctOfBankroll > RISK_CONFIG.autoHardMaxStakePercent) {
    finalAllowed = Math.min(finalAllowed, bankroll * (RISK_CONFIG.autoHardMaxStakePercent / 100));
  }

  if (input.opportunity.executableKalshiAsk != null && input.opportunity.executableKalshiAsk > 0) {
    finalAllowed = Math.min(finalAllowed, input.opportunity.fillableNotional);
  }

  if (finalAllowed <= 0) {
    return stakeDecision({
      userRequested,
      aiRecommended,
      finalAllowed: 0,
      decision: "BLOCKED",
      reason: STAKE_BLOCK_CODES.BLOCKED,
      confidenceLevel: level,
      autoAllowed: false,
      manualOnly: level === "highest_confidence" || pctOfBankroll >= RISK_CONFIG.manualConfirmStakePercent,
    });
  }

  const reduced = finalAllowed < userRequested - 0.01;
  const expectedDollarProfit =
    (finalAllowed / Math.max(userRequested, 1)) * input.opportunity.expectedDollarProfit;

  const autoAllowed =
    forAuto ||
    (level !== "highest_confidence" &&
      pctOfBankroll <= RISK_CONFIG.autoDefaultMaxStakePercent &&
      input.opportunity.state === "BETTABLE");

  const manualOnly =
    level === "highest_confidence" ||
    pctOfBankroll >= RISK_CONFIG.manualConfirmStakePercent ||
    !autoAllowed;

  let reason = reduced
    ? STAKE_BLOCK_CODES.REDUCED
    : "Stake within risk limits — all validation gates passed for this tier";

  if (forAuto && reduced) reason = STAKE_BLOCK_CODES.AUTO_CAP;

  return stakeDecision({
    userRequested,
    aiRecommended,
    finalAllowed,
    expectedDollarProfit,
    decision: reduced ? "REDUCED" : "ALLOWED",
    reason,
    confidenceLevel: level,
    autoAllowed,
    manualOnly,
  });
}

function stakeDecision(input: {
  userRequested: number;
  aiRecommended: number;
  finalAllowed: number;
  expectedDollarProfit?: number;
  decision: StakeDecision["decision"];
  reason: string;
  confidenceLevel: ConfidenceLevel;
  autoAllowed: boolean;
  manualOnly: boolean;
}): StakeDecision {
  return {
    userRequestedStake: Math.round(input.userRequested * 100) / 100,
    aiRecommendedStake: Math.round(input.aiRecommended * 100) / 100,
    suggestedStake: Math.round(input.aiRecommended * 100) / 100,
    finalAllowedStake: Math.round(input.finalAllowed * 100) / 100,
    maxLoss: Math.round(input.finalAllowed * 100) / 100,
    expectedDollarProfit: Math.round((input.expectedDollarProfit ?? 0) * 100) / 100,
    decision: input.decision,
    reason: input.reason,
    confidenceLevel: input.confidenceLevel,
    autoAllowed: input.autoAllowed,
    manualOnly: input.manualOnly,
  };
}

export function computeOpportunityStake(input: {
  bankroll: number;
  stakeSettings: StakeSettings;
  opportunity: ScoredOpportunity;
  forAuto?: boolean;
  manualHighStakeConfirmed?: boolean;
}): StakeDecision {
  const { stakeSettings, opportunity, bankroll, forAuto, manualHighStakeConfirmed } = input;
  return computeStakeDecision({
    mode: stakeSettings.mode,
    bankroll,
    userMaxStake: stakeSettings.userMaxStake,
    fixedDollarAmount: stakeSettings.fixedDollarAmount,
    fixedPercentAmount: stakeSettings.fixedPercentAmount,
    manualStakeMode: stakeSettings.manualStakeMode,
    autoFixedDollarAmount: stakeSettings.autoFixedDollarAmount,
    autoFixedPercentAmount: stakeSettings.autoFixedPercentAmount,
    autoMaxDollar: stakeSettings.autoMaxDollarAmount,
    autoMaxPercent: stakeSettings.autoMaxPercentAmount,
    opportunity,
    forAuto,
    manualHighStakeConfirmed,
  });
}

export function confidenceLabel(level: ConfidenceLevel): string {
  switch (level) {
    case "highest_confidence":
      return "highest confidence — all validation gates passed";
    case "strong_validated":
      return "strong validated edge";
    case "normal_validated":
      return "normal validated edge";
    case "risky_or_uncertain":
      return "risky or uncertain — reduced stake tier";
    default:
      return "normal validated edge";
  }
}
