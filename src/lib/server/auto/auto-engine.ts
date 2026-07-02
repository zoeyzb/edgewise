import "server-only";

import {
  evaluateAutoPauseConditions,
  getAutoLimits,
  resolveAutoRuntimeState,
  type AutoTradeStatus,
} from "@/lib/core/auto-trade";
import { getAppConfigReport } from "@/lib/core/config";
import type { StakeDecision } from "@/lib/core/types";
import { buildProviderHealthReport } from "@/lib/server/providers/provider-health";
import {
  getRiskState,
  isLoggingHealthy,
  isStorageHealthy,
} from "@/lib/server/risk/risk-store";
import { getAppState } from "@/lib/storage/store";
import {
  getAutoState,
  resetAutoDailyCountersIfNeeded,
  setAutoEmergencyStop,
  clearAutoEmergencyStop,
  setAutoPaused,
  updateAutoState,
} from "./auto-store";

const SCAN_THROTTLE_MS = 15_000;

export async function runAutoScanCycle(options?: { force?: boolean }) {
  await resetAutoDailyCountersIfNeeded();
  const appState = await getAppState();
  let autoState = await getAutoState();

  if (appState.executionMode !== "AUTO") {
    return { scanned: false, reason: "Execution mode is not AUTO" };
  }

  const runtimeState = resolveAutoRuntimeState({
    executionMode: appState.executionMode,
    autoLevel: appState.autoLevel,
    paused: autoState.paused,
    emergencyStop: autoState.emergencyStop,
  });

  if (runtimeState === "AUTO_PAUSED" || runtimeState === "AUTO_EMERGENCY_STOP") {
    return { scanned: false, reason: `Auto ${runtimeState}` };
  }

  const now = Date.now();
  if (
    !options?.force &&
    autoState.lastScanAt &&
    now - Date.parse(autoState.lastScanAt) < SCAN_THROTTLE_MS
  ) {
    return { scanned: false, reason: "Scan throttled" };
  }

  autoState = await updateAutoState({ scanning: true, lastScanAt: new Date().toISOString() });

  const config = getAppConfigReport();
  const health = await buildProviderHealthReport();
  const riskState = await getRiskState();
  const limits = getAutoLimits(appState.autoLevel);
  const bankroll = appState.stakeSettings.bankrollPlaceholder;

  const pauseCheck = evaluateAutoPauseConditions({
    pausedByUser: autoState.paused,
    emergencyStop: autoState.emergencyStop,
    dailyLossHit:
      riskState.exposure.dailyRealizedLoss >= bankroll * (limits.maxDailyLossPercent / 100),
    consecutiveLosses: autoState.consecutiveAutoLosses,
    healthColor: health.executionReadiness,
    storageHealthy: await isStorageHealthy(),
    loggingHealthy: await isLoggingHealthy(),
    secretScanPassed: config.secretSafety !== "EXPOSED_BY_MISTAKE",
    rejectedOrdersRecent: autoState.rejectedOrdersRecent,
    orderbookStaleCount: autoState.orderbookStaleCount,
    oddsStaleCount: autoState.oddsStaleCount,
    settlementDropCount: autoState.settlementDropCount,
    falseEdgeRate:
      autoState.totalAutoDecisions > 0
        ? autoState.falseEdgeCount / autoState.totalAutoDecisions
        : 0,
  });

  if (pauseCheck.shouldPause && !autoState.paused) {
    await setAutoPaused(true, pauseCheck.reason ?? "Auto paused");
    await updateAutoState({ scanning: false, tradeStatus: "AUTO_WAITING_FOR_VALID_TRADE" });
    return { scanned: false, reason: pauseCheck.reason };
  }

  // Kalshi-first: auto stays blocked until manual market selection or validated Odds edge.
  await updateAutoState({
    scanning: false,
    latestCandidate: null,
    latestValidation: null,
    tradeStatus: "AUTO_WAITING_FOR_VALID_TRADE",
  });
  return {
    scanned: true,
    candidate: null,
    tradeStatus: "AUTO_WAITING_FOR_VALID_TRADE" as AutoTradeStatus,
    reason: "AUTO_BLOCKED — select a Kalshi market manually or run Find sportsbook edge first",
  };
}

export async function buildAutoEngineResponse() {
  const appState = await getAppState();
  await resetAutoDailyCountersIfNeeded();

  const autoSelected = appState.executionMode === "AUTO";
  if (autoSelected) {
    await runAutoScanCycle();
  }

  const autoState = await getAutoState();
  const riskState = await getRiskState();
  const limits = getAutoLimits(appState.autoLevel);

  const runtimeState = resolveAutoRuntimeState({
    executionMode: appState.executionMode,
    autoLevel: appState.autoLevel,
    paused: autoState.paused,
    emergencyStop: autoState.emergencyStop,
  });

  const stakePreview: StakeDecision | null = autoState.latestValidation?.stakeDecision ?? null;

  return {
    executionMode: appState.executionMode,
    autoLevel: appState.autoLevel,
    runtimeState,
    autoSelected,
    autoActive: autoSelected && !autoState.paused && !autoState.emergencyStop,
    scanning: autoState.scanning,
    scanningStatus: autoState.scanning
      ? "AUTO_SCANNING"
      : autoSelected
        ? "AUTO_ACTIVE"
        : "OFF",
    tradeStatus: autoState.tradeStatus,
    pauseReason: autoState.paused
      ? autoState.emergencyStop
        ? "Emergency stop active"
        : "Paused by user or auto pause rule"
      : null,
    latestCandidate: autoState.latestCandidate
      ? {
          id: autoState.latestCandidate.id,
          market: autoState.latestCandidate.kalshiTicker,
          game: autoState.latestCandidate.game,
          netEdge: autoState.latestCandidate.edgeBreakdown.netEdge,
          state: autoState.latestCandidate.state,
        }
      : null,
    latestValidation: autoState.latestValidation,
    lastSubmitted: autoState.lastSubmitted,
    lastBlocked: autoState.lastBlocked,
    stakeLimits: {
      userMaxStake: appState.stakeSettings.userMaxStake,
      aiRecommendedStake: stakePreview?.aiRecommendedStake ?? null,
      finalAllowedStake: stakePreview?.finalAllowedStake ?? null,
      maxStakePercent: limits.maxStakePercent,
      maxDailyLossPercent: limits.maxDailyLossPercent,
    },
    counters: {
      autoTradesToday: autoState.autoTradesToday,
      openAutoTrades: autoState.openAutoTrades,
      maxAutoTradesPerDay: limits.maxTradesPerDay,
      maxOpenAutoTrades: limits.maxOpenTrades,
      tradesToday: riskState.exposure.tradesToday,
      dailyRealizedLoss: riskState.exposure.dailyRealizedLoss,
    },
    shadowStats: {
      captured: autoState.shadowCapturedCount,
      missed: autoState.shadowMissedCount,
      label: "SHADOW — not real profit",
    },
    paperLabel: "PAPER — simulated decisions only, not real P&L",
    logs: autoState.logs.slice(0, 20),
    autoStatus: autoSelected
      ? {
          AUTO_MODE: runtimeState,
          AUTO_SYSTEM: autoState.emergencyStop ? "AUTO_EMERGENCY_STOP" : autoState.paused ? "AUTO_PAUSED" : "AUTO_ACTIVE",
          AUTO_SCANNING: autoState.scanning ? "SCANNING" : "READY",
          AUTO_TRADE_VALIDATION: "PER_TRADE",
          LIVE_AUTO_LEVEL: appState.autoLevel,
          LAST_AUTO_TRADE_RESULT: autoState.lastSubmitted?.tradeStatus ?? "NONE",
        }
      : null,
    note: "Auto blocked in Kalshi-first mode until you select a market or run Find sportsbook edge.",
  };
}

export async function handleAutoAction(action: string) {
  switch (action) {
    case "pause":
      return setAutoPaused(true, "Paused by user");
    case "resume":
      return setAutoPaused(false);
    case "emergency_stop":
      return setAutoEmergencyStop(true);
    case "clear_emergency":
      return clearAutoEmergencyStop();
    case "scan":
      return runAutoScanCycle({ force: true });
    default:
      return null;
  }
}
