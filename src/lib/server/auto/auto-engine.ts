import "server-only";

import { randomUUID } from "crypto";
import {
  assessAutoExposureLimits,
  capAutoStake,
  checkAutoCooldowns,
  evaluateAutoPauseConditions,
  getAutoLimits,
  isLiveAutoLevel,
  resolveAutoRuntimeState,
  validateAutoTradeCandidate,
  type AutoDecisionLog,
  type AutoTradeStatus,
} from "@/lib/core/auto-trade";
import { getAppConfigReport, isRealMoneyTradingEnabled } from "@/lib/core/config";
import {
  assessExposureLimits,
  checkCorrelatedExposure,
  checkDuplicateExposure,
} from "@/lib/core/risk";
import { computeStakeDecision } from "@/lib/core/staking";
import { rankOpportunities } from "@/lib/core/profit-priority";
import type { AutoLevel, ScoredOpportunity, StakeDecision } from "@/lib/core/types";
import { executeManualOrder, isKillSwitchEngaged } from "@/lib/server/execution/manual-execution";
import { getKeyReadinessReport } from "@/lib/server/keys/key-service";
import { buildOpportunityScanResponse } from "@/lib/server/opportunities/opportunity-service";
import { buildProviderHealthReport } from "@/lib/server/providers/provider-health";
import {
  getRiskState,
  isLoggingHealthy,
  isStorageHealthy,
} from "@/lib/server/risk/risk-store";
import { getAppState } from "@/lib/storage/store";
import {
  appendAutoLog,
  buildAutoExposureSnapshot,
  getAutoState,
  recordAutoBlocked,
  recordAutoSubmitted,
  resetAutoDailyCountersIfNeeded,
  setAutoEmergencyStop,
  clearAutoEmergencyStop,
  setAutoPaused,
  updateAutoState,
} from "./auto-store";

const SCAN_THROTTLE_MS = 15_000;

async function persistAutoTrade(input: {
  candidate: ScoredOpportunity;
  stakeDecision: StakeDecision;
  mode: "LIVE" | "PAPER" | "SHADOW";
  lifecycle: "OPEN" | "SIMULATED";
  placedPrice: number | null;
  contracts: number | null;
  clientOrderId: string | null;
}) {
  const { recordTrade } = await import("@/lib/server/tracking/tracking-store");
  const { tradeRecordFromOpportunity } = await import("@/lib/server/tracking/tracking-service");
  await recordTrade(
    tradeRecordFromOpportunity({
      opportunity: input.candidate,
      source: "AUTO",
      mode: input.mode,
      lifecycle: input.lifecycle,
      placedPrice: input.placedPrice,
      fillPrice: input.placedPrice,
      contracts: input.contracts,
      clientOrderId: input.clientOrderId,
      userRequestedStake: input.stakeDecision.userRequestedStake,
      aiRecommendedStake: input.stakeDecision.aiRecommendedStake,
      finalAllowedStake: input.stakeDecision.finalAllowedStake,
    })
  );
}

function pickBestCandidate(items: ScoredOpportunity[]): ScoredOpportunity | null {
  const bettable = items.filter(
    (o) =>
      o.state === "BETTABLE" ||
      o.highMarginStatus === "URGENT_BETTABLE_HIGH_MARGIN" ||
      (o.state === "WATCH" && o.moneyConfidenceScore >= 60)
  );
  if (bettable.length === 0) return null;
  return rankOpportunities(bettable)[0] ?? null;
}

async function buildValidationContext(
  opportunity: ScoredOpportunity,
  autoLevel: AutoLevel,
  bankroll: number
) {
  const appState = await getAppState();
  const riskState = await getRiskState();
  const autoState = await getAutoState();
  const config = getAppConfigReport();
  const health = await buildProviderHealthReport();
  const readiness = await getKeyReadinessReport();
  const limits = getAutoLimits(autoLevel);
  const storageOk = await isStorageHealthy();
  const loggingOk = await isLoggingHealthy();

  const baseStake = computeStakeDecision({
    mode: appState.stakeSettings.mode,
    bankroll,
    userMaxStake: appState.stakeSettings.userMaxStake,
    fixedDollarAmount: appState.stakeSettings.fixedDollarAmount,
    fixedPercentAmount: appState.stakeSettings.fixedPercentAmount,
    manualStakeMode: appState.stakeSettings.manualStakeMode,
    autoFixedDollarAmount: appState.stakeSettings.autoFixedDollarAmount,
    autoFixedPercentAmount: appState.stakeSettings.autoFixedPercentAmount,
    autoMaxDollar: appState.stakeSettings.autoMaxDollarAmount,
    autoMaxPercent: appState.stakeSettings.autoMaxPercentAmount,
    opportunity,
    openExposureDollars: riskState.exposure.totalOpenExposure,
    dailyLossUsedDollars: riskState.exposure.dailyRealizedLoss,
  });

  const stakeDecision = capAutoStake({
    stakeDecision: baseStake,
    bankroll,
    userMaxStake: appState.stakeSettings.userMaxStake,
    limits,
  });

  const autoExposure = buildAutoExposureSnapshot(
    autoState,
    riskState.exposure.dailyRealizedLoss,
    riskState.exposure.totalOpenExposure
  );

  const autoExposureCheck = assessAutoExposureLimits({
    bankroll,
    exposure: autoExposure,
    limits,
    proposedStake: stakeDecision.finalAllowedStake,
  });

  const exposureCheck = assessExposureLimits({
    bankroll,
    exposure: riskState.exposure,
    gameKey: opportunity.game,
    leagueKey: opportunity.league,
    proposedStake: stakeDecision.finalAllowedStake,
  });

  const dupCheck = checkDuplicateExposure({
    exposure: riskState.exposure,
    marketTicker: opportunity.kalshiTicker,
  });

  const corrCheck = checkCorrelatedExposure({
    bankroll,
    exposure: riskState.exposure,
    gameKey: opportunity.game,
    proposedStake: stakeDecision.finalAllowedStake,
  });

  const cooldownCheck = checkAutoCooldowns(riskState.cooldown, limits);

  const keysValid = readiness.blockers.length === 0;

  return {
    stakeDecision,
    validation: validateAutoTradeCandidate({
      autoSelected: true,
      autoLevel,
      keysValid,
      secretScanPassed: config.secretSafety !== "EXPOSED_BY_MISTAKE",
      healthColor: health.executionReadiness,
      storageHealthy: storageOk,
      loggingHealthy: loggingOk,
      exchangeActive: health.kalshiExchangeStatus === "TRADING_ACTIVE",
      balanceFresh: bankroll > 0,
      positionsFresh: riskState.exposure.positionsFreshAt != null,
      opportunity,
      stakeDecision,
      autoExposureApproved: autoExposureCheck.approved,
      riskApproved: exposureCheck.approved && stakeDecision.decision !== "BLOCKED",
      duplicatePassed: dupCheck.passed,
      correlatedPassed: corrCheck.passed,
      cooldownBlocked: cooldownCheck.blocked,
      cooldownReason: cooldownCheck.reason,
    }),
  };
}

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

  const scan = await buildOpportunityScanResponse();
  const candidate = pickBestCandidate(scan.items);

  if (!candidate) {
    await updateAutoState({
      scanning: false,
      latestCandidate: null,
      latestValidation: null,
      tradeStatus: "AUTO_WAITING_FOR_VALID_TRADE",
    });
    return { scanned: true, candidate: null, tradeStatus: "AUTO_WAITING_FOR_VALID_TRADE" as AutoTradeStatus };
  }

  const { stakeDecision, validation } = await buildValidationContext(
    candidate,
    appState.autoLevel,
    bankroll
  );

  await updateAutoState({
    scanning: false,
    latestCandidate: candidate,
    latestValidation: {
      status: validation.status,
      failedGate: validation.failedGate,
      blockedReason: validation.blockedReason,
      stakeDecision,
    },
    tradeStatus: validation.status,
  });

  if (!validation.allPassed) {
    const log: AutoDecisionLog = {
      id: randomUUID(),
      at: new Date().toISOString(),
      autoLevel: appState.autoLevel,
      tradeStatus: "AUTO_TRADE_BLOCKED_PER_TRADE",
      opportunityId: candidate.id,
      market: candidate.kalshiTicker,
      reason: validation.blockedReason ?? "validation failed",
      failedGate: validation.failedGate,
      stakeDecision,
    };
    await recordAutoBlocked({
      log,
      staleOrderbook: candidate.orderbookFreshness !== "FRESH",
      staleOdds: candidate.oddsFreshness !== "FRESH",
      settlementDrop: candidate.settlementConfidence !== "EXACT",
      falseEdge: candidate.edgeBreakdown.netEdge < 0.04,
    });
    const { recordMissedOpportunity } = await import("@/lib/server/tracking/tracking-store");
    await recordMissedOpportunity({
      opportunityId: candidate.id,
      marketTicker: candidate.kalshiTicker,
      reason: validation.blockedReason ?? "Auto validation failed",
      expectedDollarValue: candidate.expectedDollarProfit,
      autoWouldHaveCaptured: false,
      manualDelayHurt: false,
      blockedCorrectly: true,
    });
    return { scanned: true, candidate, validation, tradeStatus: "AUTO_TRADE_BLOCKED_PER_TRADE" as AutoTradeStatus };
  }

  if (appState.autoLevel === "PAPER_AUTO") {
    const log: AutoDecisionLog = {
      id: randomUUID(),
      at: new Date().toISOString(),
      autoLevel: appState.autoLevel,
      tradeStatus: "AUTO_TRADE_SUBMITTED",
      opportunityId: candidate.id,
      market: candidate.kalshiTicker,
      reason: "PAPER — simulated decision only, not real profit",
      failedGate: null,
      stakeDecision,
      simulationLabel: "PAPER_SIMULATION",
    };
    await recordAutoSubmitted({ log, isLive: false });
    await appendAutoLog(log);
    await persistAutoTrade({
      candidate,
      stakeDecision,
      mode: "PAPER",
      lifecycle: "SIMULATED",
      placedPrice: candidate.executableKalshiAsk,
      contracts: candidate.executableKalshiAsk
        ? Math.floor(stakeDecision.finalAllowedStake / candidate.executableKalshiAsk)
        : null,
      clientOrderId: null,
    });
    return { scanned: true, candidate, validation, tradeStatus: "AUTO_TRADE_SUBMITTED" as AutoTradeStatus, paper: true };
  }

  if (appState.autoLevel === "SHADOW_AUTO") {
    const log: AutoDecisionLog = {
      id: randomUUID(),
      at: new Date().toISOString(),
      autoLevel: appState.autoLevel,
      tradeStatus: "AUTO_TRADE_SUBMITTED",
      opportunityId: candidate.id,
      market: candidate.kalshiTicker,
      reason: "SHADOW — would-have-traded, no real order placed",
      failedGate: null,
      stakeDecision,
      simulationLabel: "SHADOW_WOULD_HAVE_TRADED",
    };
    const state = await getAutoState();
    await recordAutoSubmitted({ log, isLive: false });
    await updateAutoState({ shadowCapturedCount: state.shadowCapturedCount + 1 });
    await persistAutoTrade({
      candidate,
      stakeDecision,
      mode: "SHADOW",
      lifecycle: "SIMULATED",
      placedPrice: candidate.executableKalshiAsk,
      contracts: candidate.executableKalshiAsk
        ? Math.floor(stakeDecision.finalAllowedStake / candidate.executableKalshiAsk)
        : null,
      clientOrderId: null,
    });
    return { scanned: true, candidate, validation, tradeStatus: "AUTO_TRADE_SUBMITTED" as AutoTradeStatus, shadow: true };
  }

  if (isLiveAutoLevel(appState.autoLevel)) {
    if (!isRealMoneyTradingEnabled()) {
      const log: AutoDecisionLog = {
        id: randomUUID(),
        at: new Date().toISOString(),
        autoLevel: appState.autoLevel,
        tradeStatus: "AUTO_TRADE_BLOCKED_PER_TRADE",
        opportunityId: candidate.id,
        market: candidate.kalshiTicker,
        reason: "BLOCKED — REAL_MONEY_TRADING_DISABLED",
        failedGate: "REAL_MONEY_TRADING_ENABLED",
        stakeDecision,
      };
      await recordAutoBlocked({ log });
      return { scanned: true, candidate, validation, blocked: true };
    }

    if (await isKillSwitchEngaged()) {
      const log: AutoDecisionLog = {
        id: randomUUID(),
        at: new Date().toISOString(),
        autoLevel: appState.autoLevel,
        tradeStatus: "AUTO_TRADE_BLOCKED_PER_TRADE",
        opportunityId: candidate.id,
        market: candidate.kalshiTicker,
        reason: "BLOCKED — KILL_SWITCH_ENABLED",
        failedGate: "KILL_SWITCH_OFF",
        stakeDecision,
      };
      await recordAutoBlocked({ log });
      return { scanned: true, candidate, validation, blocked: true };
    }

    const execResult = await executeManualOrder({ opportunityId: candidate.id });

    if (execResult.orderPlaced) {
      const log: AutoDecisionLog = {
        id: randomUUID(),
        at: new Date().toISOString(),
        autoLevel: appState.autoLevel,
        tradeStatus: "AUTO_TRADE_SUBMITTED",
        opportunityId: candidate.id,
        market: candidate.kalshiTicker,
        reason: "Live Auto order submitted via execute pipeline",
        failedGate: null,
        stakeDecision,
      };
      await recordAutoSubmitted({ log, isLive: true });
      await persistAutoTrade({
        candidate,
        stakeDecision,
        mode: "LIVE",
        lifecycle: "OPEN",
        placedPrice: candidate.executableKalshiAsk,
        contracts: candidate.executableKalshiAsk
          ? Math.floor(stakeDecision.finalAllowedStake / candidate.executableKalshiAsk)
          : null,
        clientOrderId: String(execResult.clientOrderId ?? null),
      });
      return { scanned: true, candidate, validation, execResult, tradeStatus: "AUTO_TRADE_SUBMITTED" as AutoTradeStatus };
    }

    const log: AutoDecisionLog = {
      id: randomUUID(),
      at: new Date().toISOString(),
      autoLevel: appState.autoLevel,
      tradeStatus: "AUTO_TRADE_BLOCKED_PER_TRADE",
      opportunityId: candidate.id,
      market: candidate.kalshiTicker,
      reason: String(execResult.reason ?? "execution blocked"),
      failedGate: String(execResult.failedGate ?? "EXECUTION_BLOCKED"),
      stakeDecision,
    };
    await recordAutoBlocked({ log });
    return { scanned: true, candidate, validation, execResult, tradeStatus: "AUTO_TRADE_BLOCKED_PER_TRADE" as AutoTradeStatus };
  }

  await updateAutoState({ scanning: false });
  return { scanned: true, candidate, validation };
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
    note: "Auto is selectable. Each trade validated individually. Bad trades blocked per trade.",
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
