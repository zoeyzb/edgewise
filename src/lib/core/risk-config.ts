/**
 * Risk limits and cooldown defaults — single source of truth.
 */

import type { RiskDefaults } from "@/lib/core/types";

export const RISK_CONFIG = {
  /** Default normal validated trade stake (% bankroll). */
  conservativeStakePercent: 10,
  /** Strong validated trade upper bound (% bankroll). */
  strongStakePercentMax: 20,
  /** Highest-confidence manual-only upper bound (% bankroll). */
  maxManualStakePercent: 25,
  /** Risky / uncertain trade range (% bankroll). */
  riskyStakePercentMin: 2,
  riskyStakePercentMax: 5,
  /** Auto default max per trade (% bankroll). */
  autoDefaultMaxStakePercent: 10,
  /** Auto hard max per trade (% bankroll). */
  autoHardMaxStakePercent: 15,
  /** Block any stake at or above this % bankroll. */
  absoluteBlockStakePercent: 30,
  /** Manual-only threshold requiring explicit confirmation (% bankroll). */
  manualConfirmStakePercent: 25,
  maxDailyRealizedLossPercent: 3,
  maxDailyExposurePercent: 10,
  maxExposurePerGamePercent: 3,
  maxExposurePerLeaguePercent: 6,
  maxOpenTrades: 10,
  maxTradesPerDay: 25,
  cooldownAfterLossMs: 10 * 60 * 1000,
  cooldownAfterRejectedOrderMs: 5 * 60 * 1000,
  cooldownAfterFailedExecutionMs: 5 * 60 * 1000,
  maxKellyFraction: 0.25,
  correlatedExposureCapPercent: 5,
} as const;

export const STAKE_BLOCK_CODES = {
  FULL_BANKROLL: "BLOCKED — 100_PERCENT_BANKROLL_STAKE_NOT_ALLOWED",
  ABOVE_ABSOLUTE_MAX: "BLOCKED — STAKE_ABOVE_30_PERCENT_BANKROLL",
  MANUAL_CONFIRM_REQUIRED: "MANUAL_OVERRIDE_REQUIRED — STAKE_ABOVE_25_PERCENT_BANKROLL",
  REDUCED: "STAKE_REDUCED_TO_RISK_LIMIT",
  BLOCKED: "STAKE_BLOCKED_BY_RISK_ENGINE",
  AUTO_CAP: "AUTO_STAKE_REDUCED_TO_AUTO_HARD_MAX",
} as const;

export const EXECUTION_BLOCK_CODES = {
  KILL_SWITCH: "BLOCKED — KILL_SWITCH_ENABLED",
  REAL_MONEY_DISABLED: "BLOCKED — REAL_MONEY_TRADING_DISABLED",
  BANKROLL_UNKNOWN: "BLOCKED — BANKROLL_UNKNOWN",
  BALANCE_STALE: "BLOCKED — BALANCE_STALE",
  POSITIONS_STALE: "BLOCKED — POSITIONS_STALE",
  EXPOSURE_UNKNOWN: "BLOCKED — EXPOSURE_UNKNOWN",
  DAILY_LOSS_HIT: "BLOCKED — DAILY_LOSS_LIMIT_HIT",
  MARKET_NOT_ORDERABLE: "BLOCKED — MARKET_NOT_ORDERABLE",
  EXCHANGE_DEGRADED: "BLOCKED — EXCHANGE_DEGRADED",
  SECRET_SCAN_FAILED: "BLOCKED — SECRET_SCAN_FAILED",
  KEY_INVALID: "BLOCKED — KEY_INVALID",
  STALE_DATA: "BLOCKED — STALE_DATA",
  LOW_LIQUIDITY: "BLOCKED — LOW_LIQUIDITY",
  EDGE_BELOW_MIN: "BLOCKED — EDGE_BELOW_MINIMUM",
  DUPLICATE_EXPOSURE: "BLOCKED — DUPLICATE_EXPOSURE",
  CORRELATED_EXPOSURE: "BLOCKED — CORRELATED_EXPOSURE_TOO_HIGH",
  STORAGE_UNHEALTHY: "BLOCKED — STORAGE_UNHEALTHY",
  LOGGING_UNHEALTHY: "BLOCKED — LOGGING_UNHEALTHY",
  COOLDOWN_ACTIVE: "BLOCKED — COOLDOWN_ACTIVE",
  SETTLEMENT_UNCONFIRMED: "BLOCKED — SETTLEMENT_UNCONFIRMED",
  OPPORTUNITY_NOT_FOUND: "BLOCKED — OPPORTUNITY_NOT_FOUND",
  NOT_BETTABLE: "BLOCKED — OPPORTUNITY_NOT_BETTABLE",
  FINAL_ODDS_REVALIDATION_FAILED: "BLOCKED — FINAL_ODDS_REVALIDATION_FAILED",
} as const;

export function riskDefaultsFromConfig(): RiskDefaults {
  return {
    maxManualStakePercent: RISK_CONFIG.maxManualStakePercent,
    conservativeStakePercent: RISK_CONFIG.conservativeStakePercent,
    maxDailyRealizedLossPercent: RISK_CONFIG.maxDailyRealizedLossPercent,
    maxDailyExposurePercent: RISK_CONFIG.maxDailyExposurePercent,
    maxExposurePerGamePercent: RISK_CONFIG.maxExposurePerGamePercent,
    maxExposurePerLeaguePercent: RISK_CONFIG.maxExposurePerLeaguePercent,
    maxOpenTrades: RISK_CONFIG.maxOpenTrades,
    maxTradesPerDay: RISK_CONFIG.maxTradesPerDay,
  };
}
