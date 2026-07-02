/**
 * Risk engine — exposure, cooldowns, duplicate/correlated checks.
 */

import { RISK_CONFIG } from "@/lib/core/risk-config";
import type { RiskExposureSnapshot } from "@/lib/core/types";

export interface CooldownState {
  lastLossAt: string | null;
  lastRejectedOrderAt: string | null;
  lastFailedExecutionAt: string | null;
}

export function checkCooldowns(state: CooldownState, nowMs = Date.now()): {
  blocked: boolean;
  reason: string | null;
  remainingMs: number;
} {
  const checks: Array<{ at: string | null; ms: number; label: string }> = [
    { at: state.lastLossAt, ms: RISK_CONFIG.cooldownAfterLossMs, label: "loss" },
    { at: state.lastRejectedOrderAt, ms: RISK_CONFIG.cooldownAfterRejectedOrderMs, label: "rejected order" },
    { at: state.lastFailedExecutionAt, ms: RISK_CONFIG.cooldownAfterFailedExecutionMs, label: "failed execution" },
  ];

  for (const c of checks) {
    if (!c.at) continue;
    const elapsed = nowMs - Date.parse(c.at);
    if (elapsed < c.ms) {
      return {
        blocked: true,
        reason: `Cooldown after ${c.label}`,
        remainingMs: c.ms - elapsed,
      };
    }
  }

  return { blocked: false, reason: null, remainingMs: 0 };
}

export function assessExposureLimits(input: {
  bankroll: number;
  exposure: RiskExposureSnapshot;
  gameKey: string;
  leagueKey: string;
  proposedStake: number;
}): { approved: boolean; reason: string | null } {
  const { bankroll, exposure, proposedStake } = input;
  if (bankroll <= 0) return { approved: false, reason: "bankroll unknown" };

  const maxDailyExposure = bankroll * (RISK_CONFIG.maxDailyExposurePercent / 100);
  if (exposure.totalOpenExposure + proposedStake > maxDailyExposure) {
    return { approved: false, reason: "max daily exposure exceeded" };
  }

  const maxGame = bankroll * (RISK_CONFIG.maxExposurePerGamePercent / 100);
  const gameExp = exposure.exposureByGame[input.gameKey] ?? 0;
  if (gameExp + proposedStake > maxGame) {
    return { approved: false, reason: "max exposure per game exceeded" };
  }

  const maxLeague = bankroll * (RISK_CONFIG.maxExposurePerLeaguePercent / 100);
  const leagueExp = exposure.exposureByLeague[input.leagueKey] ?? 0;
  if (leagueExp + proposedStake > maxLeague) {
    return { approved: false, reason: "max exposure per league exceeded" };
  }

  if (exposure.openTradesCount >= RISK_CONFIG.maxOpenTrades) {
    return { approved: false, reason: "max open trades reached" };
  }

  if (exposure.tradesToday >= RISK_CONFIG.maxTradesPerDay) {
    return { approved: false, reason: "max trades per day reached" };
  }

  const dailyLossCap = bankroll * (RISK_CONFIG.maxDailyRealizedLossPercent / 100);
  if (exposure.dailyRealizedLoss >= dailyLossCap) {
    return { approved: false, reason: "daily realized loss limit hit" };
  }

  return { approved: true, reason: null };
}

export function checkDuplicateExposure(input: {
  exposure: RiskExposureSnapshot;
  marketTicker: string;
}): { passed: boolean; reason: string | null } {
  if (input.exposure.openMarketTickers.includes(input.marketTicker)) {
    return { passed: false, reason: "duplicate exposure on same market" };
  }
  return { passed: true, reason: null };
}

export function checkCorrelatedExposure(input: {
  bankroll: number;
  exposure: RiskExposureSnapshot;
  gameKey: string;
  proposedStake: number;
}): { passed: boolean; reason: string | null } {
  const cap = input.bankroll * (RISK_CONFIG.correlatedExposureCapPercent / 100);
  const gameExp = input.exposure.exposureByGame[input.gameKey] ?? 0;
  if (gameExp + input.proposedStake > cap * 2) {
    return { passed: false, reason: "correlated exposure too high" };
  }
  return { passed: true, reason: null };
}

export function buildRiskSummary(input: {
  bankroll: number;
  exposure: RiskExposureSnapshot;
  cooldown: CooldownState;
}): {
  dailyLossUsed: number;
  dailyLossCap: number;
  openExposure: number;
  openExposureCap: number;
  openTrades: number;
  tradesToday: number;
  cooldownActive: boolean;
  cooldownReason: string | null;
} {
  const cooldownCheck = checkCooldowns(input.cooldown);
  return {
    dailyLossUsed: input.exposure.dailyRealizedLoss,
    dailyLossCap: input.bankroll * (RISK_CONFIG.maxDailyRealizedLossPercent / 100),
    openExposure: input.exposure.totalOpenExposure,
    openExposureCap: input.bankroll * (RISK_CONFIG.maxDailyExposurePercent / 100),
    openTrades: input.exposure.openTradesCount,
    tradesToday: input.exposure.tradesToday,
    cooldownActive: cooldownCheck.blocked,
    cooldownReason: cooldownCheck.reason,
  };
}
