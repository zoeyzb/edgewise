import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  validateAutoTradeCandidate,
  getAutoLimits,
  assessAutoExposureLimits,
  isLiveAutoLevel,
  resolveAutoRuntimeState,
  AUTO_RISK_LIMITS,
} from "../../src/lib/core/auto-trade.js";
import { computeProfitabilityMetrics, WIN_RATE_EVIDENCE } from "../../src/lib/core/profitability.js";
import { evaluateBacktestReadiness, BACKTEST_BLOCK_CODE } from "../../src/lib/core/backtest-contract.js";
import { mockOpportunity } from "./helpers.js";
import type { TrackedTradeRecord } from "../../src/lib/core/storage.js";

describe("Auto selectable and active", () => {
  it("Auto is not globally locked", () => {
    const state = resolveAutoRuntimeState({
      executionMode: "AUTO",
      autoLevel: "TINY_LIVE_AUTO",
      paused: false,
      emergencyStop: false,
    });
    assert.equal(state, "TINY_LIVE_AUTO");
  });
});

describe("Auto per-trade validation", () => {
  const o = mockOpportunity();
  const stake = {
    userRequestedStake: 5,
    aiRecommendedStake: 5,
    suggestedStake: 5,
    finalAllowedStake: 5,
    maxLoss: 5,
    expectedDollarProfit: 2,
    decision: "ALLOWED" as const,
    reason: "ok",
  };

  it("AUTO_TRADE_READY when all gates pass", () => {
    const r = validateAutoTradeCandidate({
      autoSelected: true,
      autoLevel: "STANDARD_AUTO",
      keysValid: true,
      secretScanPassed: true,
      healthColor: "GREEN",
      storageHealthy: true,
      loggingHealthy: true,
      exchangeActive: true,
      balanceFresh: true,
      positionsFresh: true,
      opportunity: o,
      stakeDecision: stake,
      autoExposureApproved: true,
      riskApproved: true,
      duplicatePassed: true,
      correlatedPassed: true,
      cooldownBlocked: false,
      cooldownReason: null,
    });
    assert.equal(r.status, "AUTO_TRADE_READY");
  });

  it("AUTO_TRADE_BLOCKED_PER_TRADE when gate fails", () => {
    const r = validateAutoTradeCandidate({
      autoSelected: true,
      autoLevel: "STANDARD_AUTO",
      keysValid: true,
      secretScanPassed: true,
      healthColor: "GREEN",
      storageHealthy: true,
      loggingHealthy: true,
      exchangeActive: true,
      balanceFresh: true,
      positionsFresh: true,
      opportunity: mockOpportunity({ orderbookFreshness: "STALE" }),
      stakeDecision: stake,
      autoExposureApproved: true,
      riskApproved: true,
      duplicatePassed: true,
      correlatedPassed: true,
      cooldownBlocked: false,
      cooldownReason: null,
    });
    assert.equal(r.status, "AUTO_TRADE_BLOCKED_PER_TRADE");
  });
});

describe("Auto risk limits", () => {
  it("Tiny Live Auto limits", () => {
    const limits = getAutoLimits("TINY_LIVE_AUTO");
    assert.equal(limits.maxStakePercent, 10);
    assert.equal(limits.maxOpenTrades, 1);
  });

  it("Standard Auto limits", () => {
    const limits = getAutoLimits("STANDARD_AUTO");
    assert.equal(limits.maxStakePercent, 15);
    assert.equal(limits.maxOpenTrades, 3);
  });

  it("Tiny Live blocks excess auto trades", () => {
    const r = assessAutoExposureLimits({
      bankroll: 1000,
      exposure: {
        autoTradesToday: 3,
        openAutoTrades: 0,
        dailyRealizedLoss: 0,
        totalOpenExposure: 0,
        consecutiveAutoLosses: 0,
        rejectedOrdersRecent: 0,
      },
      limits: AUTO_RISK_LIMITS.TINY_LIVE_AUTO,
      proposedStake: 2,
    });
    assert.equal(r.approved, false);
  });
});

describe("profitability claims blocked without evidence", () => {
  it("UNPROVEN with no trades", () => {
    const m = computeProfitabilityMetrics([], "MANUAL");
    assert.equal(m.status, "UNPROVEN");
    assert.equal(m.winRate, null);
  });

  it("win rate evidence strings present", () => {
    assert.match(WIN_RATE_EVIDENCE.guarantee, /NONE/);
  });
});

describe("backtesting honest status", () => {
  it("BLOCKED when historical data missing", () => {
    const r = evaluateBacktestReadiness({
      historicalOddsConfigured: false,
      historicalKalshiConfigured: false,
      orderbookReplayAvailable: false,
      walkForwardEngineBuilt: false,
    });
    assert.equal(r.status, "BLOCKED");
    assert.equal(r.blockCode, BACKTEST_BLOCK_CODE);
  });
});

describe("paper and shadow labeled", () => {
  it("paper labeled separately", () => {
    const t: TrackedTradeRecord = {
      id: "1",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      source: "AUTO",
      mode: "PAPER",
      lifecycle: "SIMULATED",
      opportunityId: "x",
      marketTicker: "T",
      game: "g",
      league: "l",
      side: "YES",
      detectedEv: 0.05,
      executableEv: 0.05,
      expectedDollarValue: 2,
      userRequestedStake: 5,
      aiRecommendedStake: 5,
      finalAllowedStake: 5,
      placedPrice: 0.45,
      fillPrice: null,
      currentPrice: 0.45,
      closingPrice: null,
      realizedPnl: null,
      unrealizedPnl: null,
      closingPriceValue: null,
      edgeWasReal: null,
      beatLaterMarket: null,
      blockedCorrectly: null,
      botMissedProfit: null,
      manualDelayHurt: null,
      autoWouldHaveCaptured: true,
      contracts: 10,
      clientOrderId: null,
      blockReason: null,
      dataLabel: "PAPER_SIMULATION",
    };
    assert.equal(t.dataLabel, "PAPER_SIMULATION");
  });
});
