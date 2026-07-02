import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  formatDiagnosticText,
  formatLabelList,
} from "../../src/lib/utils/diagnostic-text.js";
import { rankKalshiMarkets } from "../../src/lib/server/opportunities/kalshi-market-ranking.js";
import type { KalshiMarketSummary } from "../../src/lib/core/contracts.js";

const ROOT = process.cwd();

describe("Kalshi markets query", () => {
  it("does not use status=active in GET /markets query", () => {
    const scanner = readFileSync(
      join(ROOT, "src/lib/server/opportunities/kalshi-only-scanner.ts"),
      "utf8"
    );
    assert.match(scanner, /KALSHI_MARKETS_QUERY[\s\S]*limit:\s*KALSHI_MARKETS_PAGE_SIZE/);
    assert.doesNotMatch(scanner, /status:\s*["']active["']/);
    assert.doesNotMatch(scanner, /status=active/);
    assert.match(scanner, /limit:\s*KALSHI_MARKETS_PAGE_SIZE/);
    assert.match(scanner, /cursor/);
  });
});

describe("diagnostic renderer safety", () => {
  it("formatDiagnosticText handles null, string, number, object, and array", () => {
    assert.equal(formatDiagnosticText(null), "—");
    assert.equal(formatDiagnosticText("hello"), "hello");
    assert.equal(formatDiagnosticText(42), "42");
    assert.equal(formatDiagnosticText(["a", "b"]), "a · b");
    assert.equal(formatDiagnosticText({ x: 1 }), '{"x":1}');
  });

  it("formatLabelList never throws on malformed labels", () => {
    assert.deepEqual(formatLabelList(["REVIEW", "WATCH"]), ["REVIEW", "WATCH"]);
    assert.deepEqual(formatLabelList("REVIEW"), ["REVIEW"]);
    assert.deepEqual(formatLabelList(null), []);
    assert.deepEqual(formatLabelList({ bad: true }), ['{"bad":true}']);
  });

  it("KalshiMarketsTable uses safe diagnostic helpers", () => {
    const content = readFileSync(
      join(ROOT, "src/components/KalshiMarketsTable.tsx"),
      "utf8"
    );
    assert.match(content, /formatDiagnosticText/);
    assert.match(content, /formatLabelList/);
    assert.doesNotMatch(content, /m\.labels\.map/);
  });
});

describe("clean/review markets tab filter", () => {
  it("includes comma-heavy single markets in clean ranking", () => {
    const market: KalshiMarketSummary = {
      ticker: "KXNBAGAME-COMMA-TEST",
      title: "yes Player A: 1+,yes Player B: 1+,yes Player C: 1+",
      status: "active",
      series_ticker: "KXNBAGAME",
      liquidity_dollars: "1200",
      volume_fp: "800",
      yes_bid_dollars: "0.48",
      yes_ask_dollars: "0.50",
    };

    const ranked = rankKalshiMarkets({ markets: [market] });
    assert.equal(ranked.length, 1);
    assert.equal(ranked[0]?.isCombo, false);
    assert.ok(
      ranked[0]?.labels.includes("REVIEW") ||
        ranked[0]?.labels.includes("CLEAN_SINGLE_MARKET") ||
        ranked[0]?.labels.includes("WATCH")
    );
  });
});

describe("Kalshi-only dashboard does not require Odds API", () => {
  it("scan-status does not probe Odds on page load", () => {
    const content = readFileSync(
      join(ROOT, "src/lib/server/providers/scan-status.ts"),
      "utf8"
    );
    assert.match(content, /buildProviderHealthReport\(\)/);
    assert.doesNotMatch(content, /probeOdds:\s*true/);
    assert.match(content, /ODDS_OPTIONAL_NOT_RUN|KALSHI_ONLY_READY/);
  });

  it("health route does not probe Odds on page load", () => {
    const content = readFileSync(join(ROOT, "app/api/core/health/route.ts"), "utf8");
    assert.match(content, /buildProviderHealthReport\(\)/);
    assert.doesNotMatch(content, /probeOdds:\s*true/);
  });

  it("kalshi-markets page does not call Odds scan by default", () => {
    const content = readFileSync(
      join(ROOT, "app/(dashboard)/kalshi-markets/page.tsx"),
      "utf8"
    );
    assert.match(content, /buildKalshiMarketsResponse/);
    assert.match(content, /includeOddsEdge/);
    assert.doesNotMatch(content, /buildOpportunityScanResponse\(\)/);
  });

  it("provider health skips Odds probe unless explicitly requested", () => {
    const content = readFileSync(
      join(ROOT, "src/lib/server/providers/provider-health.ts"),
      "utf8"
    );
    assert.match(content, /options\?\.probeOdds/);
    assert.match(content, /buildOddsDiagnostics/);
  });
});

describe("Account uses real Kalshi balance source", () => {
  it("account page prefers buildAccountResponseFromProviders", () => {
    const content = readFileSync(join(ROOT, "app/(dashboard)/account/page.tsx"), "utf8");
    assert.match(content, /buildAccountResponseFromProviders/);
    assert.match(content, /KALSHI_BALANCE/);
    assert.match(content, /live\?\.bankroll/);
  });

  it("buildAccountResponseFromProviders reads Kalshi portfolio balance", () => {
    const content = readFileSync(
      join(ROOT, "src/lib/server/providers/provider-health.ts"),
      "utf8"
    );
    assert.match(content, /buildPortfolioResponse/);
    assert.match(content, /LIVE_PROVIDER_DATA/);
    assert.match(content, /KALSHI_BALANCE/);
  });
});
