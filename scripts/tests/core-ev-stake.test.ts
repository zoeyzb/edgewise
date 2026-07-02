import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { americanToImpliedProbability, removeVigTwoWay } from "../../src/lib/core/probability.js";
import { MIN_NET_EDGE, classifyEdgeTier } from "../../src/lib/core/ev.js";
import { computeStakeDecision } from "../../src/lib/core/staking.js";
import { assessExposureLimits, checkDuplicateExposure, checkCorrelatedExposure } from "../../src/lib/core/risk.js";
import { runExecutionGates } from "../../src/lib/core/execution-gates.js";
import { calculateKalshiFees } from "../../src/lib/core/fees.js";
import { pickExecutableAsk, spreadAsFraction } from "../../src/lib/core/orderbook.js";
import { mockOpportunity } from "./helpers.js";

describe("no-vig probability", () => {
  it("converts american odds", () => {
    assert.ok(Math.abs(americanToImpliedProbability(-110)! - 0.5238) < 0.01);
    assert.ok(Math.abs(americanToImpliedProbability(150)! - 0.4) < 0.01);
  });

  it("removes vig from two-way market", () => {
    const r = removeVigTwoWay(0.55, 0.55);
    assert.ok(r);
    assert.ok(Math.abs(r!.fairA + r!.fairB - 1) < 0.001);
  });
});

describe("EV and edge", () => {
  it("blocks below 4% edge tier", () => {
    assert.equal(classifyEdgeTier(0.03), "BLOCKED_BELOW_MIN");
    assert.equal(classifyEdgeTier(0.05), "NORMAL_EDGE");
  });

  it("MIN_NET_EDGE is 4%", () => {
    assert.equal(MIN_NET_EDGE, 0.04);
  });

  it("detects $5–$15 target bucket via expected dollar profit", () => {
    const o = mockOpportunity({ expectedDollarProfit: 8, valueBucket: "TARGET_EDGE" });
    assert.ok(o.expectedDollarProfit >= 5 && o.expectedDollarProfit <= 15);
  });
});

describe("stake engine", () => {
  const base = { bankroll: 1000, userMaxStake: 50, fixedDollarAmount: 10, fixedPercentAmount: 0.5, opportunity: mockOpportunity() };

  it("fixed-dollar stake", () => {
    const d = computeStakeDecision({ ...base, mode: "FIXED_DOLLAR_STAKE" });
    assert.equal(d.userRequestedStake, 10);
  });

  it("fixed-percent stake", () => {
    const d = computeStakeDecision({ ...base, mode: "FIXED_PERCENT_STAKE" });
    assert.equal(d.userRequestedStake, 5);
  });

  it("AI recommended stake", () => {
    const d = computeStakeDecision({ ...base, mode: "AI_RECOMMENDED_STAKE" });
    assert.ok(d.aiRecommendedStake > 0);
  });

  it("AI with user max", () => {
    const d = computeStakeDecision({ ...base, mode: "AI_WITH_USER_MAX", userMaxStake: 3 });
    assert.ok(d.finalAllowedStake <= 3);
  });

  it("blocks 100% bankroll stake", () => {
    const d = computeStakeDecision({ ...base, mode: "FIXED_DOLLAR_STAKE", fixedDollarAmount: 1000 });
    assert.equal(d.decision, "BLOCKED");
    assert.match(d.reason, /100_PERCENT_BANKROLL/);
  });

  it("final allowed stake respects caps", () => {
    const d = computeStakeDecision({ ...base, mode: "FIXED_DOLLAR_STAKE", fixedDollarAmount: 100 });
    assert.ok(d.finalAllowedStake <= 10);
  });
});

describe("risk engine", () => {
  it("blocks duplicate exposure", () => {
    const r = checkDuplicateExposure({
      exposure: {
        totalOpenExposure: 10,
        dailyRealizedLoss: 0,
        exposureByGame: {},
        exposureByLeague: {},
        openTradesCount: 1,
        tradesToday: 1,
        openMarketTickers: ["TICK-A"],
        balanceFreshAt: null,
        positionsFreshAt: null,
      },
      marketTicker: "TICK-A",
    });
    assert.equal(r.passed, false);
  });

  it("blocks correlated exposure", () => {
    const r = checkCorrelatedExposure({
      bankroll: 1000,
      exposure: {
        totalOpenExposure: 40,
        dailyRealizedLoss: 0,
        exposureByGame: { game1: 85 },
        exposureByLeague: {},
        openTradesCount: 1,
        tradesToday: 1,
        openMarketTickers: [],
        balanceFreshAt: null,
        positionsFreshAt: null,
      },
      gameKey: "game1",
      proposedStake: 20,
    });
    assert.equal(r.passed, false);
  });

  it("blocks daily loss limit", () => {
    const r = assessExposureLimits({
      bankroll: 1000,
      exposure: {
        totalOpenExposure: 0,
        dailyRealizedLoss: 35,
        exposureByGame: {},
        exposureByLeague: {},
        openTradesCount: 0,
        tradesToday: 0,
        openMarketTickers: [],
        balanceFreshAt: null,
        positionsFreshAt: null,
      },
      gameKey: "g",
      leagueKey: "l",
      proposedStake: 5,
    });
    assert.equal(r.approved, false);
  });
});

describe("execution gates", () => {
  it("blocks stale orderbook", () => {
    const o = mockOpportunity({ orderbookFreshness: "STALE" });
    const stake = computeStakeDecision({
      mode: "FIXED_DOLLAR_STAKE",
      bankroll: 1000,
      userMaxStake: 50,
      fixedDollarAmount: 5,
      fixedPercentAmount: 0.5,
      opportunity: o,
    });
    const result = runExecutionGates({
      realMoneyTradingEnabled: true,
      killSwitchActive: false,
      healthColor: "GREEN",
      secretScanPassed: true,
      storageHealthy: true,
      loggingHealthy: true,
      kalshiAuthValid: true,
      exchangeTradingActive: true,
      balanceFresh: true,
      positionsFresh: true,
      marketActive: true,
      marketOrderable: true,
      opportunity: o,
      stakeDecision: stake,
      duplicateExposurePassed: true,
      correlatedExposurePassed: true,
      riskApproved: true,
    });
    assert.equal(result.allPassed, false);
    assert.equal(result.failedGate, "ORDERBOOK_FRESH");
  });

  it("blocks stale scores when live", () => {
    const o = mockOpportunity({ liveStatus: "LIVE", scoreFreshness: "STALE" });
    const stake = computeStakeDecision({
      mode: "FIXED_DOLLAR_STAKE",
      bankroll: 1000,
      userMaxStake: 50,
      fixedDollarAmount: 5,
      fixedPercentAmount: 0.5,
      opportunity: o,
    });
    const result = runExecutionGates({
      realMoneyTradingEnabled: true,
      killSwitchActive: false,
      healthColor: "GREEN",
      secretScanPassed: true,
      storageHealthy: true,
      loggingHealthy: true,
      kalshiAuthValid: true,
      exchangeTradingActive: true,
      balanceFresh: true,
      positionsFresh: true,
      marketActive: true,
      marketOrderable: true,
      opportunity: o,
      stakeDecision: stake,
      duplicateExposurePassed: true,
      correlatedExposurePassed: true,
      riskApproved: true,
    });
    assert.equal(result.failedGate, "SCORES_FRESH_IF_LIVE");
  });

  it("blocks storage failure", () => {
    const o = mockOpportunity();
    const stake = computeStakeDecision({
      mode: "FIXED_DOLLAR_STAKE",
      bankroll: 1000,
      userMaxStake: 50,
      fixedDollarAmount: 5,
      fixedPercentAmount: 0.5,
      opportunity: o,
    });
    const result = runExecutionGates({
      realMoneyTradingEnabled: true,
      killSwitchActive: false,
      healthColor: "GREEN",
      secretScanPassed: true,
      storageHealthy: false,
      loggingHealthy: true,
      kalshiAuthValid: true,
      exchangeTradingActive: true,
      balanceFresh: true,
      positionsFresh: true,
      marketActive: true,
      marketOrderable: true,
      opportunity: o,
      stakeDecision: stake,
      duplicateExposurePassed: true,
      correlatedExposurePassed: true,
      riskApproved: true,
    });
    assert.equal(result.failedGate, "STORAGE_HEALTHY");
  });

  it("blocks kill switch", () => {
    const o = mockOpportunity();
    const stake = computeStakeDecision({
      mode: "FIXED_DOLLAR_STAKE",
      bankroll: 1000,
      userMaxStake: 50,
      fixedDollarAmount: 5,
      fixedPercentAmount: 0.5,
      opportunity: o,
    });
    const result = runExecutionGates({
      realMoneyTradingEnabled: true,
      killSwitchActive: true,
      healthColor: "GREEN",
      secretScanPassed: true,
      storageHealthy: true,
      loggingHealthy: true,
      kalshiAuthValid: true,
      exchangeTradingActive: true,
      balanceFresh: true,
      positionsFresh: true,
      marketActive: true,
      marketOrderable: true,
      opportunity: o,
      stakeDecision: stake,
      duplicateExposurePassed: true,
      correlatedExposurePassed: true,
      riskApproved: true,
    });
    assert.equal(result.failedGate, "KILL_SWITCH_OFF");
  });

  it("passes when all gates pass", () => {
    const o = mockOpportunity();
    const stake = computeStakeDecision({
      mode: "FIXED_DOLLAR_STAKE",
      bankroll: 1000,
      userMaxStake: 50,
      fixedDollarAmount: 5,
      fixedPercentAmount: 0.5,
      opportunity: o,
    });
    const result = runExecutionGates({
      realMoneyTradingEnabled: true,
      killSwitchActive: false,
      healthColor: "GREEN",
      secretScanPassed: true,
      storageHealthy: true,
      loggingHealthy: true,
      kalshiAuthValid: true,
      exchangeTradingActive: true,
      balanceFresh: true,
      positionsFresh: true,
      marketActive: true,
      marketOrderable: true,
      opportunity: o,
      stakeDecision: stake,
      duplicateExposurePassed: true,
      correlatedExposurePassed: true,
      riskApproved: true,
    });
    assert.equal(result.allPassed, true);
  });
});

describe("fees", () => {
  it("calculates fee rounding", () => {
    const f = calculateKalshiFees({ stakeDollars: 10, executableAsk: 0.45, fairProbability: 0.52 });
    assert.ok(f.totalFees >= 0);
  });
});

describe("orderbook — no midpoint", () => {
  it("picks executable ask not midpoint", () => {
    const metrics = {
      ticker: "T",
      executableYesAsk: "0.45",
      executableNoAsk: "0.58",
      spreadDollars: "0.02",
      fillableNotionalYes: 100,
      fillableNotionalNo: 100,
      orderbookAgeMs: 1000,
      freshnessState: "FRESH" as const,
      source: "REST" as const,
      blockedReason: null,
    };
    assert.equal(pickExecutableAsk("YES", metrics), 0.45);
    assert.notEqual(pickExecutableAsk("YES", metrics), 0.515);
  });
});
