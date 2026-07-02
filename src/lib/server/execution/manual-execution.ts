import "server-only";

import { randomUUID } from "crypto";
import { getAppConfigReport, isKillSwitchActive, isRealMoneyTradingEnabled } from "@/lib/core/config";
import { runExecutionGates } from "@/lib/core/execution-gates";
import { EXECUTION_BLOCK_CODES } from "@/lib/core/risk-config";
import { KEY_BLOCK_CODES } from "@/lib/core/key-constants";
import {
  assessExposureLimits,
  checkCorrelatedExposure,
  checkCooldowns,
  checkDuplicateExposure,
} from "@/lib/core/risk";
import { computeStakeDecision } from "@/lib/core/staking";
import type { ManualExecutionEnabledStatus, ScoredOpportunity } from "@/lib/core/types";
import { KalshiClient } from "@/lib/core/kalshi-client";
import { normalizeTeamName } from "@/lib/core/matcher";
import { oddsApiClient } from "@/lib/core/odds-client";
import { findOpportunityById } from "@/lib/server/opportunities/opportunity-service";
import {
  buildProviderHealthReport,
  resolveKalshiCredentials,
} from "@/lib/server/providers/provider-health";
import { getKeyReadinessReport } from "@/lib/server/keys/key-service";
import {
  appendExecutionLog,
  getAppKillSwitch,
  getRiskState,
  isLoggingHealthy,
  isStorageHealthy,
  recordFailedExecution,
  recordRejectedOrder,
  recordSubmittedOrder,
} from "@/lib/server/risk/risk-store";
import { getAppState } from "@/lib/storage/store";
import { assertServerOnlyOperation } from "@/lib/server/boundary";

const BALANCE_STALE_MS = 60_000;

export async function isKillSwitchEngaged(): Promise<boolean> {
  const envKill = isKillSwitchActive();
  const appKill = await getAppKillSwitch();
  return envKill || appKill;
}

export async function getManualExecutionStatus(): Promise<ManualExecutionEnabledStatus> {
  const config = getAppConfigReport();
  const killSwitch = await isKillSwitchEngaged();
  const health = await buildProviderHealthReport();
  const readiness = await getKeyReadinessReport();
  const storageOk = await isStorageHealthy();
  const loggingOk = await isLoggingHealthy();

  const blockedReasons: string[] = [];
  if (!config.realMoneyTradingEnabled) blockedReasons.push(EXECUTION_BLOCK_CODES.REAL_MONEY_DISABLED);
  if (killSwitch) blockedReasons.push(EXECUTION_BLOCK_CODES.KILL_SWITCH);
  if (health.executionReadiness !== "GREEN") blockedReasons.push(`health ${health.executionReadiness}`);
  if (config.secretSafety === "EXPOSED_BY_MISTAKE") blockedReasons.push(EXECUTION_BLOCK_CODES.SECRET_SCAN_FAILED);
  if (!storageOk) blockedReasons.push(EXECUTION_BLOCK_CODES.STORAGE_UNHEALTHY);
  if (!loggingOk) blockedReasons.push(EXECUTION_BLOCK_CODES.LOGGING_UNHEALTHY);
  if (!readiness.kalshiProdConfigured) blockedReasons.push("production Kalshi pair not configured");
  if (!readiness.oddsConfigured) blockedReasons.push(KEY_BLOCK_CODES.ODDS_API_KEY_MISSING);

  return {
    enabled: blockedReasons.length === 0,
    blockedReasons,
    killSwitchActive: killSwitch,
    realMoneyTradingEnabled: config.realMoneyTradingEnabled,
    healthColor: health.executionReadiness,
  };
}

async function resolveClient() {
  const creds = await resolveKalshiCredentials("prod");
  return {
    client: creds ? new KalshiClient(creds, "prod") : KalshiClient.withoutCredentials("prod"),
    creds,
  };
}

async function revalidateOpportunityWithFreshOdds(
  opportunity: ScoredOpportunity,
  orderbook: import("@/lib/core/contracts").KalshiExecutableOrderbook & {
    blockedReason?: string | null;
    freshnessState?: string;
  },
  marketStatus: string | undefined
): Promise<{ ok: true; opportunity: ScoredOpportunity } | { ok: false; reason: string }> {
  const oddsRes = await oddsApiClient.getOdds(opportunity.sport, {
    regions: "us",
    markets: opportunity.sportsbookMarket || "h2h",
    oddsFormat: "american",
  });

  if (!oddsRes.ok) {
    return { ok: false, reason: EXECUTION_BLOCK_CODES.FINAL_ODDS_REVALIDATION_FAILED };
  }

  const events = oddsRes.data.filter((e) => typeof e === "object" && e !== null) as Record<
    string,
    unknown
  >[];
  const matched =
    events.find((e) => typeof e.id === "string" && e.id === opportunity.sportsbookEvent) ??
    events.find((e) => {
      const home = typeof e.home_team === "string" ? e.home_team : "";
      const away = typeof e.away_team === "string" ? e.away_team : "";
      return (
        normalizeTeamName(home) === normalizeTeamName(opportunity.teams.home) &&
        normalizeTeamName(away) === normalizeTeamName(opportunity.teams.away)
      );
    });

  if (!matched) {
    return { ok: false, reason: EXECUTION_BLOCK_CODES.FINAL_ODDS_REVALIDATION_FAILED };
  }

  const bookmakers = Array.isArray(matched.bookmakers) ? matched.bookmakers : [];
  if (bookmakers.length === 0) {
    return { ok: false, reason: EXECUTION_BLOCK_CODES.FINAL_ODDS_REVALIDATION_FAILED };
  }

  const { buildScoredOpportunity } = await import("@/lib/core/opportunity-engine");
  const commenceTime =
    typeof matched.commence_time === "string" ? matched.commence_time : opportunity.startTime;
  const isLive = commenceTime ? Date.parse(commenceTime) < Date.now() : opportunity.liveStatus === "LIVE";

  const fresh = buildScoredOpportunity({
    id: opportunity.id,
    sportKey: opportunity.sport,
    league: opportunity.league,
    kalshiMarketTicker: opportunity.kalshiTicker,
    kalshiMarketTitle: opportunity.kalshiMarket,
    kalshiEventTicker: opportunity.kalshiEvent,
    kalshiMarketStatus: marketStatus ?? "active",
    orderbook,
    oddsEvent: matched,
    targetTeamName: opportunity.side === "YES" ? opportunity.teams.home : opportunity.teams.away,
    opponentTeamName: opportunity.side === "YES" ? opportunity.teams.away : opportunity.teams.home,
    side: opportunity.side,
    isLive,
    oddsFresh: true,
    requestedStake: opportunity.userRequestedStake || opportunity.finalAllowedStake || 50,
    oddsMarketKey: opportunity.sportsbookMarket,
  });

  return { ok: true, opportunity: fresh };
}

export async function executeManualOrder(input: {
  opportunityId: string;
}): Promise<Record<string, unknown>> {
  assertServerOnlyOperation("order_placement");

  const opportunity = await findOpportunityById(input.opportunityId);
  if (!opportunity) {
    return {
      status: "EXECUTION_BLOCKED",
      reason: EXECUTION_BLOCK_CODES.OPPORTUNITY_NOT_FOUND,
      failedGate: "OPPORTUNITY_NOT_FOUND",
      orderPlaced: false,
    };
  }

  return executeManualOrderWithOpportunity(opportunity);
}

async function executeManualOrderWithOpportunity(
  opportunity: ScoredOpportunity
): Promise<Record<string, unknown>> {
  const config = getAppConfigReport();
  const health = await buildProviderHealthReport();
  const readiness = await getKeyReadinessReport();
  const riskState = await getRiskState();
  const appState = await getAppState();
  const killSwitch = await isKillSwitchEngaged();
  const storageOk = await isStorageHealthy();
  const loggingOk = await isLoggingHealthy();

  const { client, creds } = await resolveClient();

  const [exchange, balance, positions, marketRes, orderbookRes] = await Promise.all([
    client.getExchangeStatus(),
    creds ? client.getBalance() : Promise.resolve({ ok: false as const, error: { provider: "kalshi" as const, category: "not_configured" as const, message: "NO" }, status: 401 }),
    creds ? client.getPositions(50) : Promise.resolve({ ok: false as const, error: { provider: "kalshi" as const, category: "not_configured" as const, message: "NO" }, status: 401 }),
    client.getMarket(opportunity.kalshiTicker),
    client.getOrderbook(opportunity.kalshiTicker),
  ]);

  if (!orderbookRes.ok) {
    await appendExecutionLog({
      id: randomUUID(),
      at: new Date().toISOString(),
      status: "EXECUTION_BLOCKED",
      reason: EXECUTION_BLOCK_CODES.FINAL_ODDS_REVALIDATION_FAILED,
      opportunityId: opportunity.id,
      market: opportunity.kalshiTicker,
    });
    return {
      status: "EXECUTION_BLOCKED",
      reason: EXECUTION_BLOCK_CODES.FINAL_ODDS_REVALIDATION_FAILED,
      failedGate: "ORDERBOOK_FRESH",
      orderPlaced: false,
    };
  }

  const marketStatus = marketRes.ok ? String(marketRes.data.market?.status ?? "active") : "active";
  const revalidated = await revalidateOpportunityWithFreshOdds(
    opportunity,
    orderbookRes.data,
    marketStatus
  );

  if (!revalidated.ok) {
    await appendExecutionLog({
      id: randomUUID(),
      at: new Date().toISOString(),
      status: "EXECUTION_BLOCKED",
      reason: revalidated.reason,
      opportunityId: opportunity.id,
      market: opportunity.kalshiTicker,
    });
    return {
      status: "EXECUTION_BLOCKED",
      reason: revalidated.reason,
      failedGate: "ODDS_FRESH",
      orderPlaced: false,
    };
  }

  const freshOpportunity = revalidated.opportunity;

  const bankroll = balance.ok ? balance.data.balance / 100 : 0;
  const balanceFresh =
    balance.ok &&
    (balance.data.updated_ts == null || Date.now() - balance.data.updated_ts * 1000 <= BALANCE_STALE_MS);

  const stakeDecision = computeStakeDecision({
    mode: appState.stakeSettings.mode,
    bankroll: bankroll > 0 ? bankroll : appState.stakeSettings.bankrollPlaceholder,
    userMaxStake: appState.stakeSettings.userMaxStake,
    fixedDollarAmount: appState.stakeSettings.fixedDollarAmount,
    fixedPercentAmount: appState.stakeSettings.fixedPercentAmount,
    opportunity: freshOpportunity,
    openExposureDollars: riskState.exposure.totalOpenExposure,
    dailyLossUsedDollars: riskState.exposure.dailyRealizedLoss,
  });

  const gameKey = freshOpportunity.game;
  const leagueKey = freshOpportunity.league;
  const exposureCheck = assessExposureLimits({
    bankroll: bankroll > 0 ? bankroll : appState.stakeSettings.bankrollPlaceholder,
    exposure: riskState.exposure,
    gameKey,
    leagueKey,
    proposedStake: stakeDecision.finalAllowedStake,
  });

  const cooldownCheck = checkCooldowns(riskState.cooldown);
  const dupCheck = checkDuplicateExposure({
    exposure: riskState.exposure,
    marketTicker: freshOpportunity.kalshiTicker,
  });
  const corrCheck = checkCorrelatedExposure({
    bankroll: bankroll > 0 ? bankroll : appState.stakeSettings.bankrollPlaceholder,
    exposure: riskState.exposure,
    gameKey,
    proposedStake: stakeDecision.finalAllowedStake,
  });

  const marketActive =
    marketRes.ok &&
    (marketRes.data.market?.status === "active" || marketRes.data.market?.status === undefined);
  const marketOrderable = marketActive && exchange.ok && exchange.data.trading_active;

  const riskApproved =
    exposureCheck.approved && !cooldownCheck.blocked && stakeDecision.decision !== "BLOCKED";

  const gateResult = runExecutionGates({
    realMoneyTradingEnabled: isRealMoneyTradingEnabled(),
    killSwitchActive: killSwitch,
    healthColor: health.executionReadiness,
    secretScanPassed: config.secretSafety !== "EXPOSED_BY_MISTAKE",
    storageHealthy: storageOk,
    loggingHealthy: loggingOk,
    kalshiAuthValid: creds != null && readiness.kalshiProdConfigured,
    exchangeTradingActive: exchange.ok && exchange.data.trading_active,
    balanceFresh: bankroll > 0 ? balanceFresh : false,
    positionsFresh: positions.ok,
    marketActive,
    marketOrderable,
    opportunity: freshOpportunity,
    stakeDecision,
    duplicateExposurePassed: dupCheck.passed,
    correlatedExposurePassed: corrCheck.passed,
    riskApproved,
  });

  if (!gateResult.allPassed) {
    await appendExecutionLog({
      id: randomUUID(),
      at: new Date().toISOString(),
      status: "EXECUTION_BLOCKED",
      reason: gateResult.blockedReason ?? "gate failed",
      opportunityId: freshOpportunity.id,
      market: freshOpportunity.kalshiTicker,
    });
    if (gateResult.failedGate === "FINAL_STAKE_APPROVED") {
      await recordRejectedOrder();
    }
    return {
      status: "EXECUTION_BLOCKED",
      reason: gateResult.blockedReason,
      failedGate: gateResult.failedGate,
      orderPlaced: false,
      gates: gateResult.gates.filter((g) => !g.passed),
      stakeDecision,
    };
  }

  const limitPrice = freshOpportunity.executableKalshiAsk!;
  const finalStake = stakeDecision.finalAllowedStake;
  const contracts = Math.floor(finalStake / limitPrice);
  if (contracts <= 0) {
    await recordRejectedOrder();
    return {
      status: "EXECUTION_BLOCKED",
      reason: "Insufficient stake for one contract at limit price",
      failedGate: "FINAL_STAKE_APPROVED",
      orderPlaced: false,
    };
  }

  const clientOrderId = `edgewise-${randomUUID()}`;
  const submit = await client.submitLimitOrder({
    ticker: freshOpportunity.kalshiTicker,
    side: freshOpportunity.side === "YES" ? "yes" : "no",
    action: "buy",
    count: contracts,
    limitPriceDollars: limitPrice.toFixed(4),
    clientOrderId,
  });

  if (!submit.ok) {
    await recordFailedExecution();
    await appendExecutionLog({
      id: randomUUID(),
      at: new Date().toISOString(),
      status: "EXECUTION_BLOCKED",
      reason: submit.error?.message ?? "order submission failed",
      opportunityId: freshOpportunity.id,
      market: freshOpportunity.kalshiTicker,
    });
    return {
      status: "EXECUTION_BLOCKED",
      reason: submit.error?.message ?? "order submission failed",
      failedGate: "MARKET_ORDERABLE",
      orderPlaced: false,
    };
  }

  await recordSubmittedOrder({
    marketTicker: freshOpportunity.kalshiTicker,
    gameKey,
    leagueKey,
    stake: finalStake,
  });

  const { recordTrade } = await import("@/lib/server/tracking/tracking-store");
  const { tradeRecordFromOpportunity } = await import("@/lib/server/tracking/tracking-service");
  await recordTrade(
    tradeRecordFromOpportunity({
      opportunity: freshOpportunity,
      source: "MANUAL",
      mode: "LIVE",
      lifecycle: "OPEN",
      placedPrice: limitPrice,
      fillPrice: limitPrice,
      contracts,
      clientOrderId,
      userRequestedStake: stakeDecision.userRequestedStake,
      aiRecommendedStake: stakeDecision.aiRecommendedStake,
      finalAllowedStake: stakeDecision.finalAllowedStake,
    })
  );

  const orderStatus = submit.data?.status ?? "submitted";
  await appendExecutionLog({
    id: randomUUID(),
    at: new Date().toISOString(),
    status: "ORDER_SUBMITTED",
    reason: "limit order submitted",
    opportunityId: freshOpportunity.id,
    market: freshOpportunity.kalshiTicker,
  });

  return {
    status: "ORDER_SUBMITTED",
    orderPlaced: true,
    market: freshOpportunity.kalshiTicker,
    side: freshOpportunity.side,
    limitPrice: limitPrice.toFixed(4),
    contracts: String(contracts),
    userRequestedStake: String(stakeDecision.userRequestedStake),
    aiRecommendedStake: String(stakeDecision.aiRecommendedStake),
    finalAllowedStake: String(stakeDecision.finalAllowedStake),
    expectedDollarValue: String(freshOpportunity.expectedDollarProfit),
    clientOrderId,
    finalOrderStatus: orderStatus,
  };
}

export async function getExecutionPreview(opportunityId: string) {
  const opportunity = await findOpportunityById(opportunityId);
  if (!opportunity) return null;
  const appState = await getAppState();
  const riskState = await getRiskState();
  const { creds, client } = await resolveClient();
  const balance = creds ? await client.getBalance() : null;
  const bankroll =
    balance?.ok && balance.data.balance
      ? balance.data.balance / 100
      : appState.stakeSettings.bankrollPlaceholder;

  const stakeDecision = computeStakeDecision({
    mode: appState.stakeSettings.mode,
    bankroll,
    userMaxStake: appState.stakeSettings.userMaxStake,
    fixedDollarAmount: appState.stakeSettings.fixedDollarAmount,
    fixedPercentAmount: appState.stakeSettings.fixedPercentAmount,
    opportunity,
    openExposureDollars: riskState.exposure.totalOpenExposure,
    dailyLossUsedDollars: riskState.exposure.dailyRealizedLoss,
  });

  const manualStatus = await getManualExecutionStatus();
  return { opportunity, stakeDecision, manualStatus, riskSummary: riskState.exposure };
}
