import "server-only";

import { buildProviderHealthReport } from "@/lib/server/providers/provider-health";
import { getKeyReadinessReport } from "@/lib/server/keys/key-service";
import { buildKalshiMarketsResponse } from "@/lib/server/opportunities/opportunity-service";

export interface PageProviderStatus {
  kalshiAuth: string;
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

  const kalshiOk = health.kalshiAuthStatus === "AUTH_OK";
  const keysPresent = readiness.kalshiProdConfigured;
  const providersReady = keysPresent && kalshiOk;

  const topReview = kalshiScan.markets
    .filter((m) => m.labels.includes("REVIEW") || m.labels.includes("CLEAN_SINGLE_MARKET"))
    .slice(0, 5)
    .map((m) => `${m.ticker} — ${m.title}`);

  let primaryBlocker: string | null = null;
  if (!readiness.kalshiProdConfigured) {
    primaryBlocker = "Missing production Kalshi API pair";
  } else if (!kalshiOk) {
    primaryBlocker = `Kalshi auth failed (${health.kalshiAuthStatus})`;
  } else if (kalshiScan.dataLabel === "KALSHI_QUERY_INVALID") {
    primaryBlocker = "Kalshi markets query invalid";
  } else if (kalshiScan.markets.length === 0) {
    primaryBlocker = "No tradeable Kalshi markets returned";
  }

  let nextAction = "Review ranked Kalshi markets";
  if (!keysPresent) {
    nextAction = "Add production Kalshi API + private key in Settings";
  } else if (!kalshiOk) {
    nextAction = "Re-test Kalshi pair in Settings → API Keys";
  } else if (topReview.length > 0) {
    nextAction = `Start with: ${topReview[0]}`;
  } else if (readiness.oddsConfigured) {
    nextAction = "Optional: run Find sportsbook edge on Kalshi Markets";
  } else {
    nextAction = "Review Kalshi-only rankings — Odds API optional";
  }

  const oddsEdgeStatus = readiness.oddsConfigured
    ? "optional — not run"
    : "optional — key missing";

  return {
    kalshiAuth: health.kalshiAuthStatus,
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
