import "server-only";

import type { KalshiMarketSummary } from "@/lib/core/contracts";
import type { KalshiExecutableOrderbook } from "@/lib/core/contracts";
import { detectKalshiMarketType } from "@/lib/core/market-types";
import type { KalshiMarketReviewLabel, RankedKalshiMarket } from "@/lib/core/types";
import { classifyKalshiMarketCategory } from "@/lib/server/opportunities/kalshi-market-classifier";
import { inferOddsSportKeyFromKalshiMarket } from "@/lib/server/opportunities/sport-mapping";

const LOW_LIQUIDITY_DOLLARS = 25;
const WIDE_SPREAD_DOLLARS = 0.08;
const CLOSING_SOON_MS = 24 * 60 * 60 * 1000;

function parseAmount(value: string | undefined | null): number {
  if (!value) return 0;
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

function parseCloseTime(market: KalshiMarketSummary): number | null {
  const raw = market.close_time ?? market.expected_expiration_time;
  if (!raw) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}

export function isKalshiComboMarket(market: KalshiMarketSummary): boolean {
  const ticker = market.ticker.toUpperCase();
  const series = (market.series_ticker ?? "").toUpperCase();
  const title = (market.title ?? "").toLowerCase();
  const marketType = (market.market_type ?? "").toLowerCase();

  if (
    marketType.includes("multivariate") ||
    marketType.includes("combo") ||
    marketType.includes("parlay")
  ) {
    return true;
  }
  if (/MVE|MULTI|COMBO|PARLAY/.test(ticker) || /MVE|MULTI|COMBO/.test(series)) {
    return true;
  }
  if (series.startsWith("KXMVE")) return true;
  if (/\bparlay\b/.test(title)) return true;
  if (/\bcombo\b/.test(title)) return true;
  return false;
}

function marketStatusRank(status: string | undefined | null): number {
  const s = (status ?? "").toLowerCase();
  if (s === "active" || s === "open") return 100;
  if (s === "initialized" || s === "unopened") return 40;
  if (s === "paused") return 20;
  return 0;
}

function summarySpreadDollars(market: KalshiMarketSummary): number | null {
  const yesBid = parseAmount(market.yes_bid_dollars);
  const yesAsk = parseAmount(market.yes_ask_dollars);
  if (yesBid > 0 && yesAsk > 0 && yesAsk >= yesBid) {
    return yesAsk - yesBid;
  }
  const noBid = parseAmount(market.no_bid_dollars);
  const noAsk = parseAmount(market.no_ask_dollars);
  if (noBid > 0 && noAsk > 0 && noAsk >= noBid) {
    return noAsk - noBid;
  }
  return null;
}

function orderbookSpreadDollars(orderbook: KalshiExecutableOrderbook | undefined): number | null {
  if (!orderbook?.spreadDollars) return null;
  const spread = parseAmount(orderbook.spreadDollars);
  return spread > 0 ? spread : null;
}

function freshnessBonus(orderbook: KalshiExecutableOrderbook | undefined): number {
  if (!orderbook) return 0;
  if (orderbook.freshnessState === "FRESH") return 12;
  if (orderbook.freshnessState === "UNKNOWN") return 4;
  return -8;
}

function buildRankReason(input: {
  liquidity: number;
  volume: number;
  openInterest: number;
  spread: number | null;
  statusRank: number;
  combo: boolean;
  closingSoon: boolean;
  freshness: KalshiExecutableOrderbook | undefined;
}): string {
  const parts: string[] = [];
  if (input.combo) parts.push("combo/multivariate market penalized");
  else parts.push("single-market structure preferred");
  if (input.liquidity >= 500) parts.push("strong liquidity_dollars");
  else if (input.liquidity >= 100) parts.push("moderate liquidity_dollars");
  else if (input.liquidity > 0) parts.push("thin liquidity_dollars");
  else parts.push("missing liquidity_dollars");
  if (input.volume > 0) parts.push("volume_fp present");
  if (input.openInterest > 0) parts.push("open_interest_fp present");
  if (input.spread != null) {
    parts.push(
      input.spread <= 0.04
        ? "tight YES/NO spread"
        : input.spread >= WIDE_SPREAD_DOLLARS
          ? "wide YES/NO spread"
          : "moderate spread"
    );
  }
  if (input.closingSoon) parts.push("close_time urgency");
  if (input.statusRank >= 100) parts.push("open/active status");
  else parts.push("non-open status penalized");
  if (input.freshness?.freshnessState === "FRESH") parts.push("fresh orderbook");
  else if (input.freshness?.freshnessState === "STALE") parts.push("stale orderbook penalized");
  return parts.join("; ");
}

function assignLabels(input: {
  combo: boolean;
  liquidity: number;
  spread: number | null;
  closingSoon: boolean;
  statusRank: number;
  categorySport: string;
  rankScore: number;
}): KalshiMarketReviewLabel[] {
  const labels: KalshiMarketReviewLabel[] = [];
  if (input.combo) labels.push("COMBO_MARKET");
  if (input.liquidity < LOW_LIQUIDITY_DOLLARS) labels.push("LOW_LIQUIDITY");
  if (input.spread != null && input.spread >= WIDE_SPREAD_DOLLARS) labels.push("WIDE_SPREAD");
  if (input.closingSoon) labels.push("CLOSING_SOON");
  if (
    !input.combo &&
    input.categorySport !== "unknown" &&
    input.liquidity >= LOW_LIQUIDITY_DOLLARS &&
    (input.spread == null || input.spread < WIDE_SPREAD_DOLLARS) &&
    input.statusRank >= 100
  ) {
    labels.push("CLEAN_SINGLE_MARKET");
  }
  if (input.combo || input.statusRank === 0 || input.liquidity <= 0) {
    labels.push("AVOID");
  } else if (input.rankScore >= 55 && !labels.includes("WIDE_SPREAD")) {
    labels.push("REVIEW");
  } else {
    labels.push("WATCH");
  }
  return [...new Set(labels)];
}

function computeRankScore(input: {
  liquidity: number;
  volume: number;
  openInterest: number;
  spread: number | null;
  statusRank: number;
  combo: boolean;
  closeMs: number | null;
  nowMs: number;
  freshness: KalshiExecutableOrderbook | undefined;
}): number {
  let score = 0;
  score += Math.min(30, Math.log10(Math.max(input.liquidity, 1) + 1) * 10);
  score += Math.min(15, Math.log10(Math.max(input.volume, 1) + 1) * 6);
  score += Math.min(15, Math.log10(Math.max(input.openInterest, 1) + 1) * 6);
  if (input.spread != null) {
    score += Math.max(0, 20 - input.spread * 200);
  }
  score += input.statusRank * 0.15;
  score += freshnessBonus(input.freshness);
  if (input.combo) score -= 25;
  if (input.closeMs != null) {
    const hours = (input.closeMs - input.nowMs) / (60 * 60 * 1000);
    if (hours > 0 && hours <= 24) score += 6;
    else if (hours > 24 && hours <= 72) score += 3;
  }
  return Math.round(Math.max(0, Math.min(100, score)));
}

export function rankKalshiMarkets(input: {
  markets: KalshiMarketSummary[];
  orderbooks?: Map<string, KalshiExecutableOrderbook>;
  now?: Date;
}): RankedKalshiMarket[] {
  const nowMs = (input.now ?? new Date()).getTime();
  const orderbooks = input.orderbooks ?? new Map<string, KalshiExecutableOrderbook>();

  const ranked = input.markets.map((market) => {
    const title = market.title ?? market.ticker;
    const liquidity = parseAmount(market.liquidity_dollars);
    const volume = parseAmount(market.volume_fp);
    const openInterest = parseAmount(market.open_interest_fp);
    const combo = isKalshiComboMarket(market);
    const closeMs = parseCloseTime(market);
    const closingSoon = closeMs != null && closeMs > nowMs && closeMs - nowMs <= CLOSING_SOON_MS;
    const statusRank = marketStatusRank(market.status);
    const orderbook = orderbooks.get(market.ticker);
    const spread = orderbookSpreadDollars(orderbook) ?? summarySpreadDollars(market);
    const marketType = detectKalshiMarketType({
      title,
      ticker: market.ticker,
      eventTicker: market.event_ticker,
    });
    const classification = classifyKalshiMarketCategory(market);
    const sportKey = inferOddsSportKeyFromKalshiMarket(market);
    const categorySport =
      classification.category === "sports"
        ? sportKey ?? classification.matchedHint ?? "sports"
        : classification.category === "non_sports"
          ? "non-sports"
          : "unknown";

    const rankScore = computeRankScore({
      liquidity,
      volume,
      openInterest,
      spread,
      statusRank,
      combo,
      closeMs,
      nowMs,
      freshness: orderbook,
    });

    const labels = assignLabels({
      combo,
      liquidity,
      spread,
      closingSoon,
      statusRank,
      categorySport,
      rankScore,
    });

    return {
      ticker: market.ticker,
      title,
      eventTicker: market.event_ticker ?? null,
      seriesTicker: market.series_ticker ?? null,
      categorySport,
      marketType: marketType.kind,
      yesBid: market.yes_bid_dollars ?? null,
      yesAsk: market.yes_ask_dollars ?? null,
      noBid: market.no_bid_dollars ?? null,
      noAsk: market.no_ask_dollars ?? null,
      spreadDollars: spread,
      liquidityDollars: liquidity > 0 ? liquidity : null,
      volumeFp: market.volume_fp ?? null,
      openInterestFp: market.open_interest_fp ?? null,
      closeTime: market.close_time ?? market.expected_expiration_time ?? null,
      status: market.status ?? null,
      isCombo: combo,
      rankScore,
      rankPosition: 0,
      labels,
      rankReason: buildRankReason({
        liquidity,
        volume,
        openInterest,
        spread,
        statusRank,
        combo,
        closingSoon,
        freshness: orderbook,
      }),
      orderbookFreshness: orderbook?.freshnessState ?? "NOT_FETCHED",
    } satisfies RankedKalshiMarket;
  });

  ranked.sort((a, b) => {
    const statusDiff = marketStatusRank(b.status) - marketStatusRank(a.status);
    if (statusDiff !== 0) return statusDiff;
    if (a.isCombo !== b.isCombo) return a.isCombo ? 1 : -1;
    return b.rankScore - a.rankScore;
  });

  return ranked.map((item, index) => ({ ...item, rankPosition: index + 1 }));
}
