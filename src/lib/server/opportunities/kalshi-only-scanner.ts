import "server-only";

import { KALSHI_CONTRACT } from "@/lib/core/contracts";
import type { KalshiMarketSummary } from "@/lib/core/contracts";
import { KalshiClient } from "@/lib/core/kalshi-client";
import {
  classifyKalshiMarketCategory,
  type KalshiMarketCategory,
} from "@/lib/server/opportunities/kalshi-market-classifier";
import { resolveProductionKalshiClient } from "@/lib/server/providers/provider-health";
import { getKeyReadinessReport } from "@/lib/server/keys/key-service";

export const KALSHI_MARKETS_PAGE_SIZE = 200;
export const KALSHI_MAX_MARKETS_CHECKED = 1000;

/** Minimal GET /markets query — no status filter (invalid value `active` caused HTTP 400). */
export const KALSHI_MARKETS_QUERY = {
  limit: KALSHI_MARKETS_PAGE_SIZE,
} as const;

export const KALSHI_MARKETS_REQUEST_PATH = KALSHI_CONTRACT.endpoints.markets;

export type KalshiScanPhaseStatus =
  | "PROVIDER_NOT_CONFIGURED"
  | "KALSHI_QUERY_INVALID"
  | "KALSHI_QUERY_RETURNED_ZERO"
  | "KALSHI_MARKETS_FOUND"
  | "KALSHI_SPORTS_MARKETS_FOUND"
  | "KALSHI_MARKETS_FOUND_BUT_CLASSIFIER_REJECTED_ALL";

export interface KalshiQueryErrorDiagnostics {
  requestPath: string;
  statusCode: number;
  queryParams: Record<string, string | number | undefined>;
  responseBody: string;
}

export interface KalshiMarketDiagnostic {
  ticker: string;
  eventTicker: string | null;
  seriesTicker: string | null;
  title: string;
  status: string | null;
  volumeFp: string | null;
  openInterestFp: string | null;
  category: KalshiMarketCategory;
  rejectReason: string | null;
  matchedHint: string | null;
}

export interface KalshiOnlyScanResult {
  phaseStatus: KalshiScanPhaseStatus;
  kalshiRequestPath: string;
  kalshiRequestQuery: typeof KALSHI_MARKETS_QUERY & {
    maxMarketsChecked: number;
    pagesFetched: number;
  };
  kalshiFetchError: string | null;
  kalshiQueryError: KalshiQueryErrorDiagnostics | null;
  marketsReturnedRaw: number;
  marketsReturned: number;
  marketsChecked: number;
  first20MarketTitles: string[];
  first20MarketTickers: string[];
  sportsMarketsCount: number;
  nonSportsCount: number;
  unknownCount: number;
  allMarkets: KalshiMarketDiagnostic[];
  sportsMarkets: KalshiMarketDiagnostic[];
  rawMarkets: KalshiMarketSummary[];
  allTradeableMarkets: KalshiMarketSummary[];
}

/** Response-body statuses for tradeable markets (GET /markets returns `active` for open). */
export function isKalshiMarketTradeable(market: KalshiMarketSummary): boolean {
  const s = (market.status ?? "").toLowerCase();
  return s === "active" || s === "open";
}

function toDiagnostic(market: KalshiMarketSummary): KalshiMarketDiagnostic {
  const classification = classifyKalshiMarketCategory(market);
  return {
    ticker: market.ticker,
    eventTicker: market.event_ticker ?? null,
    seriesTicker: market.series_ticker ?? null,
    title: market.title ?? market.ticker,
    status: market.status ?? null,
    volumeFp: market.volume_fp ?? null,
    openInterestFp: market.open_interest_fp ?? null,
    category: classification.category,
    rejectReason: classification.rejectReason,
    matchedHint: classification.matchedHint,
  };
}

export async function fetchKalshiActiveMarkets(client: KalshiClient): Promise<{
  marketsRaw: KalshiMarketSummary[];
  marketsTradeable: KalshiMarketSummary[];
  pagesFetched: number;
  fetchError: string | null;
  queryInvalid: boolean;
  queryError: KalshiQueryErrorDiagnostics | null;
}> {
  const marketsRaw: KalshiMarketSummary[] = [];
  let cursor: string | undefined;
  let pagesFetched = 0;
  let fetchError: string | null = null;
  let queryInvalid = false;
  let queryError: KalshiQueryErrorDiagnostics | null = null;

  while (marketsRaw.length < KALSHI_MAX_MARKETS_CHECKED) {
    const queryParams: Record<string, string | number | undefined> = {
      limit: KALSHI_MARKETS_PAGE_SIZE,
      cursor,
    };
    const res = await client.searchMarkets(queryParams);
    pagesFetched += 1;

    if (!res.ok) {
      fetchError = res.error.message;
      if (res.status === 400) {
        queryInvalid = true;
      }
      queryError = {
        requestPath: KALSHI_MARKETS_REQUEST_PATH,
        statusCode: res.status,
        queryParams,
        responseBody: res.error.responseBody ?? res.error.message,
      };
      break;
    }

    marketsRaw.push(...res.data.markets);
    cursor = res.data.cursor ?? undefined;
    if (!cursor) break;
    if (marketsRaw.length >= KALSHI_MAX_MARKETS_CHECKED) break;
  }

  const marketsTradeable = marketsRaw.filter(isKalshiMarketTradeable);

  return {
    marketsRaw,
    marketsTradeable,
    pagesFetched,
    fetchError,
    queryInvalid,
    queryError,
  };
}

export async function scanKalshiMarketsOnly(): Promise<KalshiOnlyScanResult> {
  const readiness = await getKeyReadinessReport();
  const empty: KalshiOnlyScanResult = {
    phaseStatus: "PROVIDER_NOT_CONFIGURED",
    kalshiRequestPath: KALSHI_MARKETS_REQUEST_PATH,
    kalshiRequestQuery: {
      ...KALSHI_MARKETS_QUERY,
      maxMarketsChecked: KALSHI_MAX_MARKETS_CHECKED,
      pagesFetched: 0,
    },
    kalshiFetchError: "Kalshi production pair not configured",
    kalshiQueryError: null,
    marketsReturnedRaw: 0,
    marketsReturned: 0,
    marketsChecked: 0,
    first20MarketTitles: [],
    first20MarketTickers: [],
    sportsMarketsCount: 0,
    nonSportsCount: 0,
    unknownCount: 0,
    allMarkets: [],
    sportsMarkets: [],
    rawMarkets: [],
    allTradeableMarkets: [],
  };

  if (!readiness.kalshiProdConfigured) {
    return empty;
  }

  const { client } = await resolveProductionKalshiClient();
  const fetch = await fetchKalshiActiveMarkets(client);

  if (fetch.queryInvalid) {
    return {
      ...empty,
      phaseStatus: "KALSHI_QUERY_INVALID",
      kalshiRequestQuery: {
        ...KALSHI_MARKETS_QUERY,
        maxMarketsChecked: KALSHI_MAX_MARKETS_CHECKED,
        pagesFetched: fetch.pagesFetched,
      },
      kalshiFetchError: fetch.fetchError,
      kalshiQueryError: fetch.queryError,
    };
  }

  const markets = fetch.marketsTradeable;
  const diagnostics = markets.map(toDiagnostic);
  const sportsMarkets = diagnostics.filter((m) => m.category === "sports");
  const nonSportsCount = diagnostics.filter((m) => m.category === "non_sports").length;
  const unknownCount = diagnostics.filter((m) => m.category === "unknown").length;

  let phaseStatus: KalshiScanPhaseStatus;
  if (fetch.marketsRaw.length === 0) {
    phaseStatus = "KALSHI_QUERY_RETURNED_ZERO";
  } else if (sportsMarkets.length > 0) {
    phaseStatus = "KALSHI_SPORTS_MARKETS_FOUND";
  } else if (markets.length === 0) {
    phaseStatus = "KALSHI_QUERY_RETURNED_ZERO";
  } else {
    phaseStatus = "KALSHI_MARKETS_FOUND_BUT_CLASSIFIER_REJECTED_ALL";
  }

  return {
    phaseStatus,
    kalshiRequestPath: KALSHI_MARKETS_REQUEST_PATH,
    kalshiRequestQuery: {
      ...KALSHI_MARKETS_QUERY,
      maxMarketsChecked: KALSHI_MAX_MARKETS_CHECKED,
      pagesFetched: fetch.pagesFetched,
    },
    kalshiFetchError: fetch.fetchError,
    kalshiQueryError: fetch.queryError,
    marketsReturnedRaw: fetch.marketsRaw.length,
    marketsReturned: markets.length,
    marketsChecked: markets.length,
    first20MarketTitles: fetch.marketsRaw.slice(0, 20).map((m) => m.title ?? m.ticker),
    first20MarketTickers: fetch.marketsRaw.slice(0, 20).map((m) => m.ticker),
    sportsMarketsCount: sportsMarkets.length,
    nonSportsCount,
    unknownCount,
    allMarkets: diagnostics,
    sportsMarkets,
    rawMarkets: fetch.marketsTradeable.filter(
      (m) => classifyKalshiMarketCategory(m).category === "sports"
    ),
    allTradeableMarkets: fetch.marketsTradeable,
  };
}
