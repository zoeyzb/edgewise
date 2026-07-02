import "server-only";

import { buildSharedProviderStatus, buildProviderHealthReport } from "@/lib/server/providers/provider-health";
import { getKeyReadinessReport } from "@/lib/server/keys/key-service";
import { buildKalshiMarketsResponse } from "@/lib/server/opportunities/opportunity-service";

export interface PageProviderStatus {
  kalshiAuth: string;
  kalshiKeyPairStatus: string;
  kalshiExchangeStatus: string;
  kalshiBalanceStatus: string;
  kalshiMarketScanStatus: string;
  kalshiMode: string;
  oddsEdgeStatus: string;
  providersReady: boolean;
  primaryBlocker: string | null;
  nextAction: string;
  kalshiMarketsFound: number;
  topReviewMarkets: string[];
  matchedMarkets: number;
  bettableCount: number;
}

export async function buildPageProviderStatus(): Promise<PageProviderStatus> {
  const [health, readiness, kalshiScan] = await Promise.all([
    buildProviderHealthReport(),
    getKeyReadinessReport(),
    buildKalshiMarketsResponse(),
  ]);

  const kalshiMarketsOk =
    kalshiScan.dataLabel === "KALSHI_MARKETS_FOUND" && kalshiScan.markets.length > 0;
  const keyPairPassed = readiness.kalshiPairs.prod.pairStatus === "KALSHI_AUTH_TEST_PASSED";

  const kalshiMarketScanStatus = kalshiMarketsOk
    ? "KALSHI_MARKETS_OK"
    : kalshiScan.dataLabel === "KALSHI_QUERY_INVALID"
      ? "KALSHI_QUERY_INVALID"
      : kalshiScan.dataLabel === "PROVIDER_NOT_CONFIGURED"
        ? "NOT_RUN"
        : "KALSHI_MARKETS_EMPTY";

  const shared = await buildSharedProviderStatus({ kalshiMarketScanStatus });

  const providersReady =
    kalshiMarketsOk ||
    (readiness.kalshiProdConfigured && keyPairPassed);

  const cleanMarkets = kalshiScan.markets.filter((m) => !m.isCombo);
  const topReview = cleanMarkets
    .filter((m) => m.labels.includes("REVIEW") || m.labels.includes("CLEAN_SINGLE_MARKET"))
    .slice(0, 5)
    .map((m) => `${m.ticker} — ${m.title}`);

  let primaryBlocker: string | null = null;
  if (!readiness.kalshiProdConfigured) {
    primaryBlocker = "Missing production Kalshi API pair";
  } else if (kalshiScan.dataLabel === "KALSHI_QUERY_INVALID") {
    primaryBlocker = "Kalshi markets query invalid";
  } else if (!kalshiMarketsOk && !keyPairPassed) {
    primaryBlocker = `Kalshi setup incomplete (${health.kalshiKeyPairStatus})`;
  } else if (!kalshiMarketsOk && keyPairPassed) {
    primaryBlocker = "Kalshi key pair passed — waiting for tradeable markets";
  }

  let nextAction = "Review ranked Kalshi markets";
  if (!readiness.kalshiProdConfigured) {
    nextAction = "Add production Kalshi API + private key in Settings";
  } else if (kalshiMarketsOk) {
    nextAction = topReview.length > 0 ? `Start with: ${topReview[0]}` : "Open Clean Markets tab on Kalshi Markets";
  } else if (keyPairPassed) {
    nextAction = "Key pair passed — open Kalshi Markets to refresh scan";
  } else {
    nextAction = "Test production Kalshi pair in Settings → API Keys";
  }

  const oddsEdgeStatus = shared.oddsEdgeStatus;

  return {
    kalshiAuth: shared.kalshiAuthStatus,
    kalshiKeyPairStatus: shared.kalshiKeyPairStatus,
    kalshiExchangeStatus: shared.kalshiExchangeStatus,
    kalshiBalanceStatus: shared.kalshiBalanceStatus,
    kalshiMarketScanStatus: shared.kalshiMarketScanStatus,
    kalshiMode: health.kalshiMode,
    oddsEdgeStatus,
    providersReady,
    primaryBlocker,
    nextAction,
    kalshiMarketsFound: kalshiScan.scanDiagnostics?.kalshiActiveMarkets ?? kalshiScan.markets.length,
    topReviewMarkets: topReview,
    matchedMarkets: 0,
    bettableCount: 0,
  };
}
