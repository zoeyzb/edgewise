import "server-only";

import type { KalshiExecutableOrderbook } from "@/lib/core/contracts";
import type { KalshiMarketsListResponse } from "@/lib/core/types";
import {
  fetchKalshiActiveMarkets,
  KALSHI_MARKETS_QUERY,
  KALSHI_MAX_MARKETS_CHECKED,
  KALSHI_MARKETS_REQUEST_PATH,
  type KalshiQueryErrorDiagnostics,
} from "@/lib/server/opportunities/kalshi-only-scanner";
import { rankKalshiMarkets } from "@/lib/server/opportunities/kalshi-market-ranking";
import { resolveProductionKalshiClient } from "@/lib/server/providers/provider-health";
import { getKeyReadinessReport } from "@/lib/server/keys/key-service";

const ORDERBOOK_FETCH_LIMIT = 40;

async function fetchOrderbooksForTopMarkets(
  tickers: string[]
): Promise<Map<string, KalshiExecutableOrderbook>> {
  const { client, configured } = await resolveProductionKalshiClient();
  if (!configured) return new Map();

  const map = new Map<string, KalshiExecutableOrderbook>();
  for (const ticker of tickers.slice(0, ORDERBOOK_FETCH_LIMIT)) {
    const res = await client.getOrderbook(ticker);
    if (res.ok) {
      map.set(ticker, res.data);
    }
  }
  return map;
}

export async function buildKalshiMarketsScanResponse(): Promise<KalshiMarketsListResponse> {
  const scannedAt = new Date().toISOString();
  const readiness = await getKeyReadinessReport();

  const emptyDiagnostics = {
    environment: "prod" as const,
    kalshiRequestPath: KALSHI_MARKETS_REQUEST_PATH,
    kalshiQueryUsed: {
      ...KALSHI_MARKETS_QUERY,
      maxMarketsChecked: KALSHI_MAX_MARKETS_CHECKED,
      pagesFetched: 0,
    },
    kalshiFetchError: null as string | null,
    kalshiQueryError: null as KalshiQueryErrorDiagnostics | null,
    kalshiActiveMarkets: 0,
    kalshiMarketsReturnedRaw: 0,
    first20MarketTitles: [] as string[],
    first20MarketTickers: [] as string[],
    oddsEdgeStatus: readiness.oddsConfigured ? "ODDS_OPTIONAL_NOT_RUN" : "KALSHI_ONLY_READY",
    oddsUsed: false,
  };

  if (!readiness.kalshiProdConfigured) {
    return {
      dataLabel: "PROVIDER_NOT_CONFIGURED",
      providerStatus: "PROVIDER_NOT_CONFIGURED",
      message: "Configure production Kalshi API + private key to scan markets",
      scannedAt,
      markets: [],
      oddsEdgeItems: [],
      scanDiagnostics: emptyDiagnostics,
    };
  }

  const { client } = await resolveProductionKalshiClient();
  const fetch = await fetchKalshiActiveMarkets(client);

  const baseDiagnostics = {
    ...emptyDiagnostics,
    kalshiQueryUsed: {
      ...KALSHI_MARKETS_QUERY,
      maxMarketsChecked: KALSHI_MAX_MARKETS_CHECKED,
      pagesFetched: fetch.pagesFetched,
    },
    kalshiFetchError: fetch.fetchError,
    kalshiQueryError: fetch.queryError,
    kalshiMarketsReturnedRaw: fetch.marketsRaw.length,
    first20MarketTitles: fetch.marketsRaw.slice(0, 20).map((m) => m.title ?? m.ticker),
    first20MarketTickers: fetch.marketsRaw.slice(0, 20).map((m) => m.ticker),
  };

  if (fetch.queryInvalid) {
    return {
      dataLabel: "KALSHI_QUERY_INVALID",
      providerStatus: "KALSHI_QUERY_INVALID",
      message: fetch.queryError
        ? `Kalshi markets query invalid (HTTP ${fetch.queryError.statusCode})`
        : "Kalshi markets query invalid",
      scannedAt,
      markets: [],
      oddsEdgeItems: [],
      scanDiagnostics: {
        ...baseDiagnostics,
        kalshiActiveMarkets: 0,
      },
    };
  }

  if (fetch.marketsRaw.length === 0) {
    return {
      dataLabel: "KALSHI_QUERY_RETURNED_ZERO",
      providerStatus: "KALSHI_QUERY_RETURNED_ZERO",
      message: fetch.fetchError
        ? `Kalshi markets query returned 0 — ${fetch.fetchError}`
        : "Kalshi markets query returned 0 markets",
      scannedAt,
      markets: [],
      oddsEdgeItems: [],
      scanDiagnostics: {
        ...baseDiagnostics,
        kalshiActiveMarkets: 0,
      },
    };
  }

  const preliminary = rankKalshiMarkets({ markets: fetch.marketsTradeable });
  const topTickers = preliminary.slice(0, ORDERBOOK_FETCH_LIMIT).map((m) => m.ticker);
  const orderbooks = await fetchOrderbooksForTopMarkets(topTickers);
  const markets = rankKalshiMarkets({ markets: fetch.marketsTradeable, orderbooks });

  const comboCount = markets.filter((m) => m.isCombo).length;
  const cleanCount = markets.length - comboCount;

  return {
    dataLabel: "KALSHI_MARKETS_FOUND",
    providerStatus: "KALSHI_ONLY",
    message: `${fetch.marketsTradeable.length} tradeable Kalshi markets ranked (${cleanCount} clean, ${comboCount} combo) — Odds API not called`,
    scannedAt,
    markets,
    oddsEdgeItems: [],
    scanDiagnostics: {
      ...baseDiagnostics,
      kalshiActiveMarkets: fetch.marketsTradeable.length,
    },
  };
}
