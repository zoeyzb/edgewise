import type { RiskDefaults, StakeSettings, SystemStatus } from "./types";

export const APP_NAME = "Edgewise";

export const DEFAULT_SYSTEM_STATUS: SystemStatus = {
  manualExecution: "PROVIDER_NOT_CONFIGURED",
  autoMode: "SELECTABLE",
  liveAutoTrading: "SELECTABLE",
  profitability: "UNPROVEN",
  providerKeys: "NOT_BUILT_YET",
};

export const RISK_DEFAULTS: RiskDefaults = {
  maxManualStakePercent: 25,
  conservativeStakePercent: 10,
  maxDailyRealizedLossPercent: 3,
  maxDailyExposurePercent: 10,
  maxExposurePerGamePercent: 3,
  maxExposurePerLeaguePercent: 6,
  maxOpenTrades: 10,
  maxTradesPerDay: 25,
};

export const DEFAULT_STAKE_SETTINGS: StakeSettings = {
  mode: "FIXED_PERCENT_STAKE",
  manualStakeMode: "PERCENT",
  fixedDollarAmount: 0,
  fixedPercentAmount: 10,
  autoFixedDollarAmount: 0,
  autoFixedPercentAmount: 10,
  autoMaxDollarAmount: 0,
  autoMaxPercentAmount: 15,
  userMaxStake: 500,
  dailyMaxLoss: 3,
  sessionMaxLoss: 2,
  maxOpenExposure: 10,
  maxTradesPerDay: 25,
  maxAutoTradesPerDay: 10,
  bankrollPlaceholder: 1000,
};

export const PLACEHOLDER_DATA_LABEL = "PLACEHOLDER_UI_ONLY" as const;

/** Forbidden marketing / UI language — never display to users. */
export const FORBIDDEN_CLAIMS = [
  "guaranteed win",
  "100% win rate",
  "free money",
  "lock",
  "sure thing",
  "risk-free",
] as const;

/** Preferred terminology for verified opportunities. */
export const APPROVED_TERMINOLOGY = [
  "highest-confidence",
  "verified edge",
  "validation passed",
  "validation failed",
  "positive expected value",
  "risk-adjusted opportunity",
  "blocked per trade",
] as const;

export const BLOCK_CODES = {
  FULL_BANKROLL_STAKE: "BLOCKED — 100_PERCENT_BANKROLL_STAKE_NOT_ALLOWED",
} as const;

export const NAV_ITEMS = [
  { href: "/", label: "Dashboard" },
  { href: "/opportunities", label: "Opportunities" },
  { href: "/auto-trade", label: "Auto" },
  { href: "/account", label: "Account" },
  { href: "/settings/keys", label: "Settings" },
] as const;

export const ADVANCED_NAV = [
  { href: "/live-games", label: "Live Games" },
  { href: "/best-bets", label: "Best Bets" },
  { href: "/fast-money", label: "Fast Money" },
  { href: "/high-margin", label: "High Margin" },
  { href: "/totals-watchlist", label: "Totals Watchlist" },
  { href: "/tracker", label: "Tracker" },
  { href: "/profitability", label: "Profitability" },
  { href: "/risk", label: "Risk" },
  { href: "/health", label: "Health" },
  { href: "/logs", label: "Logs" },
  { href: "/backtesting-status", label: "Backtesting" },
  { href: "/settings/stake", label: "Stake" },
  { href: "/settings/risk", label: "Risk Limits" },
  { href: "/settings/providers", label: "Providers" },
] as const;

export const SETTINGS_NAV = [
  { href: "/settings/keys", label: "API Keys" },
  { href: "/settings/stake", label: "Stake" },
  { href: "/settings/risk", label: "Risk Limits" },
  { href: "/settings/providers", label: "Providers" },
] as const;
