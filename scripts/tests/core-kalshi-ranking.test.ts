import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isKalshiComboMarket,
  rankKalshiMarkets,
} from "../../src/lib/server/opportunities/kalshi-market-ranking.js";
import type { KalshiMarketSummary } from "../../src/lib/core/contracts.js";

describe("kalshi market ranking", () => {
  it("prefers open single markets with liquidity over combo markets", () => {
    const markets: KalshiMarketSummary[] = [
      {
        ticker: "KXMVE-MULTIGAME-TEST",
        title: "Leg A, Leg B, Leg C, Leg D",
        status: "active",
        mve_collection_ticker: "KXMVE-COLLECTION",
        mve_selected_legs: [{ ticker: "LEG-A" }, { ticker: "LEG-B" }],
        liquidity_dollars: "5000",
        volume_fp: "1000",
        open_interest_fp: "500",
        yes_bid_dollars: "0.40",
        yes_ask_dollars: "0.42",
      },
      {
        ticker: "KXNBAGAME-TEST",
        title: "Lakers vs Celtics winner",
        status: "active",
        series_ticker: "KXNBAGAME",
        liquidity_dollars: "1200",
        volume_fp: "800",
        open_interest_fp: "300",
        yes_bid_dollars: "0.48",
        yes_ask_dollars: "0.50",
      },
    ];

    const ranked = rankKalshiMarkets({ markets });
    assert.equal(ranked[0]?.ticker, "KXNBAGAME-TEST");
    assert.equal(isKalshiComboMarket(markets[0]!), true);
    assert.ok(ranked[1]?.labels.includes("COMBO_MARKET"));
  });

  it("does not classify comma-heavy titles as combo without MVE evidence", () => {
    const market: KalshiMarketSummary = {
      ticker: "KXNBAGAME-COMMA-TEST",
      title: "yes Player A: 1+,yes Player B: 1+,yes Player C: 1+,yes Player D: 1+",
      status: "active",
      series_ticker: "KXNBAGAME",
      liquidity_dollars: "1200",
    };

    assert.equal(isKalshiComboMarket(market), false);
  });

  it("does not classify empty mve_selected_legs as combo", () => {
    const market: KalshiMarketSummary = {
      ticker: "KXNBAGAME-EMPTY-LEGS",
      title: "Lakers vs Celtics winner",
      status: "active",
      mve_selected_legs: [],
    };

    assert.equal(isKalshiComboMarket(market), false);
  });

  it("does not classify a single mve leg as combo", () => {
    const market: KalshiMarketSummary = {
      ticker: "KXNBAGAME-ONE-LEG",
      title: "Lakers vs Celtics winner",
      status: "active",
      mve_collection_ticker: "KXMVE-COLLECTION",
      mve_selected_legs: [{ ticker: "LEG-A" }],
    };

    assert.equal(isKalshiComboMarket(market), false);
  });
});
