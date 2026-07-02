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
        ticker: "KXMVE-TEST",
        title: "Combo parlay market",
        status: "active",
        liquidity_dollars: "5000",
        volume_fp: "1000",
        open_interest_fp: "500",
        yes_bid_dollars: "0.40",
        yes_ask_dollars: "0.42",
        market_type: "multivariate",
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
});
