import { APP_NAME, RISK_DEFAULTS } from "@/lib/core/constants";
import { riskDefaultsFromConfig } from "@/lib/core/risk-config";
import { computeStakeDecision } from "@/lib/core/staking";
import { buildRiskSummary } from "@/lib/core/risk";
import { getAppConfigReport } from "@/lib/core/config";
import type { HealthSnapshot, PlaceholderOpportunity } from "@/lib/core/types";
import { getEncryptionMode } from "@/lib/server/crypto";
import { getKeyReadinessReport } from "@/lib/server/keys/key-service";
import { getRiskState } from "@/lib/server/risk/risk-store";
import { buildAccountResponseFromProviders } from "@/lib/server/providers/provider-health";
import {
  getAppState,
  getPublicKeys,
} from "@/lib/storage/store";

export async function buildHealthSnapshot(): Promise<HealthSnapshot> {
  const [readiness, keys, config] = await Promise.all([
    getKeyReadinessReport(),
    getPublicKeys(),
    Promise.resolve(getAppConfigReport()),
  ]);

  const state = await getAppState();
  const autoSelected = state.executionMode === "AUTO";
  const encryptionMode = getEncryptionMode();

  const secretSafetyStatus =
    config.secretSafety === "EXPOSED_BY_MISTAKE"
      ? "BLOCKED — SECRET_EXPOSED_CLIENT_SIDE"
      : encryptionMode === "dev_fallback"
        ? "SERVER_SIDE_ONLY_DEV_ENCRYPTION"
        : "SERVER_SIDE_ONLY";

  return {
    appStatus: "ACTIVE",
    providerKeyStatus: keys.length > 0 ? "PARTIAL" : "NOT_CONFIGURED",
    secretSafetyStatus,
    kalshiStatus: readiness.kalshiProdConfigured
      ? "PROD_KEYS_CONFIGURED"
      : "PROVIDER_NOT_CONFIGURED",
    oddsApiStatus: "CHECK_HEALTH_FOR_USABILITY",
    manualExecution:
      readiness.kalshiProdConfigured
        ? "READY_WHEN_VALIDATION_BUILT"
        : "PROVIDER_NOT_CONFIGURED",
    autoMode: autoSelected ? "SELECTED" : "SELECTABLE",
    autoSystem: autoSelected ? "ACTIVE" : "ACTIVE_WHEN_SELECTED",
    autoTradeValidation: "PER_TRADE",
    profitability: "UNPROVEN",
    backtesting: "NOT_CONFIGURED",
    fakeDataStatus: "NO_FAKE_REAL_MONEY_DATA",
    dataLabel: "PROVIDER_NOT_CONFIGURED",
  };
}

export async function buildAutoTradeResponse() {
  const { buildAutoEngineResponse } = await import("@/lib/server/auto/auto-engine");
  return buildAutoEngineResponse();
}

export function emptyOpportunities(): PlaceholderOpportunity[] {
  return [];
}

export function placeholderListResponse(endpoint: string) {
  return {
    dataLabel: "PLACEHOLDER_UI_ONLY" as const,
    providerStatus: "PROVIDER_NOT_CONFIGURED",
    message: `NO_REAL_DATA_CONNECTED — ${endpoint} awaiting provider configuration`,
    items: emptyOpportunities(),
  };
}

export async function buildAccountResponse() {
  const state = await getAppState();
  const live = await buildAccountResponseFromProviders();
  const bankroll =
    live?.bankroll?.value != null && typeof live.bankroll.value === "number"
      ? live.bankroll.value
      : state.stakeSettings.bankrollPlaceholder;

  const preview = computeStakeDecision({
    mode: state.stakeSettings.mode,
    bankroll,
    userMaxStake: state.stakeSettings.userMaxStake,
    fixedDollarAmount: state.stakeSettings.fixedDollarAmount,
    fixedPercentAmount: state.stakeSettings.fixedPercentAmount,
    opportunity: {
      id: "account-preview",
      sport: "",
      league: "",
      game: "",
      teams: { home: "", away: "" },
      startTime: null,
      liveStatus: "UNKNOWN",
      kalshiEvent: "",
      kalshiMarket: "",
      kalshiTicker: "",
      sportsbookEvent: "",
      sportsbookMarket: "",
      side: "YES",
      matchConfidence: "MEDIUM",
      settlementConfidence: "UNCONFIRMED",
      marketTypeLevel: "LEVEL_3_WATCH_ONLY",
      scopePeriod: "FULL_GAME",
      overtimeTreatment: "UNSPECIFIED",
      currentScore: null,
      clockPeriod: null,
      executableKalshiAsk: 0.5,
      orderbookFreshness: "UNKNOWN",
      oddsFreshness: "UNKNOWN",
      scoreFreshness: "N/A",
      noVigFairProbability: null,
      bookmakerCount: 0,
      sportsbookDisagreement: 0,
      liquidity: "LOW",
      fillableNotional: 100,
      edgeBreakdown: {
        grossEdge: 0,
        fees: 0,
        spread: 0,
        slippage: 0,
        staleDataBuffer: 0,
        partialFillRisk: 0,
        confidencePenalty: 0,
        netEdge: 0,
        edgeTier: "BLOCKED_BELOW_MIN",
        blockCode: null,
      },
      expectedDollarProfit: 0,
      expectedProfitPerSecond: 0,
      expectedProfitPerMinute: 0,
      edgeSurvivalConfidence: 0.5,
      fillProbability: 0.5,
      edgeQualityScore: 0,
      moneyConfidenceScore: 0,
      profitPriorityScore: 0,
      userRequestedStake: 0,
      aiRecommendedStake: 0,
      suggestedStake: 0,
      finalAllowedStake: 0,
      maxLoss: 0,
      stakeDecision: "BLOCKED",
      stakeReason: "preview",
      confidenceLevel: "normal validated edge",
      autoAllowed: false,
      manualOnly: true,
      state: "UNCONFIRMED",
      reason: "preview",
      highMarginStatus: "NOT_APPLICABLE",
      valueBucket: "BELOW_MICRO",
      executeReadiness: "NOT_READY",
      dataLabel: "PROVIDER_NOT_CONFIGURED",
    },
  });

  if (live) {
    return {
      ...live,
      stakePreview: preview,
      dailyPnl: null,
      sessionPnl: null,
    };
  }

  return {
    dataLabel: "PLACEHOLDER_UI_ONLY",
    bankroll: {
      label: "PLACEHOLDER_UI_ONLY",
      value: state.stakeSettings.bankrollPlaceholder,
      note: "Not connected to Kalshi — configure provider keys",
    },
    stakePreview: preview,
    openTrades: 0,
    dailyPnl: null,
    sessionPnl: null,
  };
}

export async function buildRiskResponse() {
  const state = await getAppState();
  const riskState = await getRiskState();
  const live = await buildAccountResponseFromProviders();
  const bankroll =
    live?.bankroll?.value != null && typeof live.bankroll.value === "number"
      ? live.bankroll.value
      : state.stakeSettings.bankrollPlaceholder;

  const stakePreview = computeStakeDecision({
    mode: state.stakeSettings.mode,
    bankroll,
    userMaxStake: state.stakeSettings.userMaxStake,
    fixedDollarAmount: state.stakeSettings.fixedDollarAmount,
    fixedPercentAmount: state.stakeSettings.fixedPercentAmount,
    opportunity: {
      id: "preview",
      sport: "",
      league: "",
      game: "",
      teams: { home: "", away: "" },
      startTime: null,
      liveStatus: "UNKNOWN",
      kalshiEvent: "",
      kalshiMarket: "",
      kalshiTicker: "",
      sportsbookEvent: "",
      sportsbookMarket: "",
      side: "YES",
      matchConfidence: "MEDIUM",
      settlementConfidence: "UNCONFIRMED",
      marketTypeLevel: "LEVEL_3_WATCH_ONLY",
      scopePeriod: "FULL_GAME",
      overtimeTreatment: "UNSPECIFIED",
      currentScore: null,
      clockPeriod: null,
      executableKalshiAsk: 0.5,
      orderbookFreshness: "UNKNOWN",
      oddsFreshness: "UNKNOWN",
      scoreFreshness: "N/A",
      noVigFairProbability: null,
      bookmakerCount: 0,
      sportsbookDisagreement: 0,
      liquidity: "LOW",
      fillableNotional: 100,
      edgeBreakdown: {
        grossEdge: 0,
        fees: 0,
        spread: 0,
        slippage: 0,
        staleDataBuffer: 0,
        partialFillRisk: 0,
        confidencePenalty: 0,
        netEdge: 0,
        edgeTier: "BLOCKED_BELOW_MIN",
        blockCode: null,
      },
      expectedDollarProfit: 0,
      expectedProfitPerSecond: 0,
      expectedProfitPerMinute: 0,
      edgeSurvivalConfidence: 0.5,
      fillProbability: 0.5,
      edgeQualityScore: 0,
      moneyConfidenceScore: 0,
      profitPriorityScore: 0,
      userRequestedStake: 0,
      aiRecommendedStake: 0,
      suggestedStake: 0,
      finalAllowedStake: 0,
      maxLoss: 0,
      stakeDecision: "BLOCKED",
      stakeReason: "preview",
      confidenceLevel: "normal validated edge",
      autoAllowed: false,
      manualOnly: true,
      state: "UNCONFIRMED",
      reason: "preview only",
      highMarginStatus: "NOT_APPLICABLE",
      valueBucket: "BELOW_MICRO",
      executeReadiness: "NOT_READY",
      dataLabel: "PROVIDER_NOT_CONFIGURED",
    },
    openExposureDollars: riskState.exposure.totalOpenExposure,
    dailyLossUsedDollars: riskState.exposure.dailyRealizedLoss,
  });

  const riskSummary = buildRiskSummary({
    bankroll,
    exposure: riskState.exposure,
    cooldown: riskState.cooldown,
  });

  return {
    dataLabel: live ? "REAL_PROVIDER_DATA" : "PLACEHOLDER_UI_ONLY",
    stakeSettings: state.stakeSettings,
    stakePreview,
    limits: riskDefaultsFromConfig(),
    riskDefaults: RISK_DEFAULTS,
    exposure: riskState.exposure,
    riskSummary,
    cooldown: riskState.cooldown,
  };
}

export function buildExecuteBlockedResponse() {
  return {
    status: "EXECUTION_BLOCKED",
    reason: "PROVIDER_NOT_CONFIGURED",
    orderPlaced: false,
  };
}

export function buildCoreHealthResponse() {
  return {
    ok: true,
    service: APP_NAME,
    version: "0.1.0",
    timestamp: new Date().toISOString(),
  };
}
