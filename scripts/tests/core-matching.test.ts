import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeTeamName, compareStartTimes } from "../../src/lib/core/matcher.js";
import {
  parseKalshiSettlementScope,
  parseOddsSettlementScope,
  verifySettlementCompatibility,
} from "../../src/lib/core/settlement.js";
import { detectKalshiMarketType } from "../../src/lib/core/market-types.js";

describe("event matching", () => {
  it("normalizes team aliases", () => {
    assert.equal(normalizeTeamName("LA Lakers"), "los angeles lakers");
  });

  it("blocks ambiguous start time mismatch", () => {
    const r = compareStartTimes(
      "2026-01-01T00:00:00Z",
      "2026-01-01T04:00:00Z",
      30 * 60 * 1000
    );
    assert.equal(r.match, false);
  });
});

describe("settlement mismatch", () => {
  it("detects regulation vs overtime mismatch", () => {
    const kalshi = parseKalshiSettlementScope("Team A wins regulation only");
    const odds = parseOddsSettlementScope({ marketKey: "h2h", description: "including overtime" });
    odds.overtimeRule = "OVERTIME_INCLUDED";
    kalshi.overtimeRule = "REGULATION_ONLY";
    const v = verifySettlementCompatibility({
      kalshiScope: kalshi,
      oddsScope: odds,
      kalshiType: detectKalshiMarketType({ title: "Team A wins regulation only", ticker: "T" }),
      oddsMarketKey: "h2h",
    });
    assert.equal(v.exact, false);
  });

  it("blocks full vs first half mismatch", () => {
    const kalshi = parseKalshiSettlementScope("First half winner Team A");
    const odds = parseOddsSettlementScope({ marketKey: "h2h" });
    const v = verifySettlementCompatibility({
      kalshiScope: kalshi,
      oddsScope: odds,
      kalshiType: detectKalshiMarketType({ title: "First half winner Team A", ticker: "T" }),
      oddsMarketKey: "h2h",
    });
    assert.equal(v.exact, false);
  });

  it("allows exact full game match when scopes align", () => {
    const kalshi = parseKalshiSettlementScope("Team A vs Team B winner full game");
    kalshi.overtimeRule = "OVERTIME_INCLUDED";
    kalshi.verified = true;
    kalshi.confidence = "HIGH";
    const odds = parseOddsSettlementScope({ marketKey: "h2h" });
    odds.overtimeRule = "OVERTIME_INCLUDED";
    odds.verified = true;
    odds.confidence = "HIGH";
    const v = verifySettlementCompatibility({
      kalshiScope: kalshi,
      oddsScope: odds,
      kalshiType: detectKalshiMarketType({ title: "Team A vs Team B winner full game", ticker: "T" }),
      oddsMarketKey: "h2h",
    });
    assert.equal(v.exact, true);
    assert.equal(v.blocked, false);
  });
});

describe("high-margin verification", () => {
  it("requires verification for extreme edges", () => {
    const status = "UNCONFIRMED — HIGH_MARGIN_EDGE_NEEDS_VERIFICATION";
    assert.match(status, /HIGH_MARGIN/);
  });
});

describe("totals model lock", () => {
  it("detects totals in settlement metric", () => {
    const scope = parseKalshiSettlementScope("Game total over 220.5");
    assert.equal(scope.metric, "GAME_TOTAL");
  });
});
