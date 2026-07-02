import "server-only";

import { buildProviderHealthReport } from "@/lib/server/providers/provider-health";
import { getKeyReadinessReport } from "@/lib/server/keys/key-service";
import { scanKalshiSportsOpportunities } from "@/lib/server/opportunities/kalshi-sports-scanner";

export interface PageProviderStatus {
  kalshiAuth: string;
  kalshiMode: string;
  oddsStatus: string;
  providersReady: boolean;
  primaryBlocker: string | null;
  nextAction: string;
  kalshiSportsMarkets: number;
  matchedMarkets: number;
  bettableCount: number;
}

export async function buildPageProviderStatus(): Promise<PageProviderStatus> {
  const [health, readiness, scan] = await Promise.all([
    buildProviderHealthReport(),
    getKeyReadinessReport(),
    scanKalshiSportsOpportunities(),
  ]);

  const kalshiOk = health.kalshiAuthStatus === "AUTH_OK";
  const oddsOk = health.oddsDiagnostics.status === "USABLE";
  const keysPresent = readiness.kalshiProdConfigured && readiness.oddsConfigured;
  const providersReady = keysPresent && kalshiOk && oddsOk;

  let primaryBlocker: string | null = null;
  if (!readiness.kalshiProdConfigured || !readiness.oddsConfigured) {
    primaryBlocker = "Missing production Kalshi pair or Odds API key";
  } else if (!kalshiOk) {
    primaryBlocker = `Kalshi auth failed (${health.kalshiAuthStatus})`;
  } else if (!oddsOk) {
    primaryBlocker = health.oddsDiagnostics.failureReason ?? "Odds API not usable";
  } else if (scan.scanDiagnostics.primaryBlockReason) {
    primaryBlocker = scan.scanDiagnostics.primaryBlockReason.replaceAll("_", " ");
  }

  let nextAction = "Review Opportunities for scanned candidates";
  if (!keysPresent) {
    nextAction = "Add production Kalshi API + private key and Odds API key in Settings";
  } else if (!kalshiOk) {
    nextAction = "Re-test Kalshi pair in Settings → API Keys";
  } else if (!oddsOk) {
    nextAction = "Verify Odds API key quota and auth in Settings";
  } else if (scan.items.filter((o) => o.state === "BETTABLE").length === 0) {
    nextAction = primaryBlocker
      ? `Scanner blocker: ${primaryBlocker} — check scan diagnostics on Opportunities`
      : "No BETTABLE edges yet — matches may be WATCH or blocked by EV/liquidity gates";
  }

  return {
    kalshiAuth: health.kalshiAuthStatus,
    kalshiMode: health.kalshiMode,
    oddsStatus: health.oddsDiagnostics.status,
    providersReady,
    primaryBlocker,
    nextAction,
    kalshiSportsMarkets: scan.scanDiagnostics.kalshiSportsMarkets,
    matchedMarkets: scan.scanDiagnostics.matchedMarkets,
    bettableCount: scan.items.filter((o) => o.state === "BETTABLE").length,
  };
}
