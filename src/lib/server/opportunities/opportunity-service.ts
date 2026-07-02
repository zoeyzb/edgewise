import "server-only";

import { buildTotalsWatchEntry } from "@/lib/core/totals-momentum";
import { detectKalshiMarketType } from "@/lib/core/market-types";
import type {
  OpportunityListResponse,
  ScoredOpportunity,
  TotalsWatchEntry,
} from "@/lib/core/types";
import { scanKalshiSportsOpportunities } from "@/lib/server/opportunities/kalshi-sports-scanner";
import {
  inferOddsSportKeyFromKalshiMarket,
  parseTeamsFromKalshiTitle,
} from "@/lib/server/opportunities/sport-mapping";
import { resolveProductionKalshiClient } from "@/lib/server/providers/provider-health";
import { getKeyReadinessReport } from "@/lib/server/keys/key-service";
import { rankOpportunities } from "@/lib/core/profit-priority";

export { parseTeamsFromKalshiTitle };

export async function buildOpportunityScanResponse(): Promise<
  OpportunityListResponse & { scanDiagnostics?: import("@/lib/server/opportunities/kalshi-sports-scanner").ScanDiagnostics }
> {
  return scanKalshiSportsOpportunities();
}

export async function findOpportunityById(opportunityId: string): Promise<ScoredOpportunity | null> {
  const scan = await buildOpportunityScanResponse();
  return scan.items.find((o) => o.id === opportunityId) ?? null;
}

export async function buildBestBetsResponse(): Promise<OpportunityListResponse> {
  const base = await buildOpportunityScanResponse();
  const items = base.items.filter(
    (o) =>
      o.state === "BETTABLE" ||
      (o.state === "WATCH" && o.moneyConfidenceScore >= 60)
  );
  return { ...base, items: rankOpportunities(items), message: `Best bets — ${items.length} items` };
}

export async function buildFastMoneyResponse(): Promise<OpportunityListResponse> {
  const base = await buildOpportunityScanResponse();
  const items = base.items.filter(
    (o) =>
      o.liveStatus === "LIVE" ||
      o.expectedProfitPerMinute >= 0.05 ||
      o.edgeBreakdown.edgeTier === "STRONG_EDGE"
  );
  return { ...base, items: rankOpportunities(items), message: `Fast money — ${items.length} items` };
}

export async function buildHighMarginResponse(): Promise<OpportunityListResponse> {
  const base = await buildOpportunityScanResponse();
  const items = base.items.filter(
    (o) =>
      o.edgeBreakdown.edgeTier === "HIGH_MARGIN_EDGE" ||
      o.edgeBreakdown.edgeTier === "EXTREME_MARGIN_EDGE" ||
      o.edgeBreakdown.edgeTier === "RARE_EDGE"
  );
  return { ...base, items: rankOpportunities(items), message: `High margin — ${items.length} items` };
}

export async function buildTotalsWatchlistResponse(): Promise<{
  dataLabel: OpportunityListResponse["dataLabel"];
  providerStatus: string;
  message: string;
  scannedAt: string;
  items: TotalsWatchEntry[];
}> {
  const readiness = await getKeyReadinessReport();
  const { client, configured } = await resolveProductionKalshiClient();

  if (!readiness.oddsConfigured || !configured) {
    return {
      dataLabel: "PROVIDER_NOT_CONFIGURED",
      providerStatus: "PROVIDER_NOT_CONFIGURED",
      message: "Configure production Kalshi pair + Odds API key",
      scannedAt: new Date().toISOString(),
      items: [],
    };
  }

  const entries: TotalsWatchEntry[] = [];
  const marketsRes = await client.searchMarkets({ limit: 200 });

  if (marketsRes.ok) {
    for (const m of marketsRes.data.markets) {
      const title = m.title ?? m.ticker;
      const type = detectKalshiMarketType({ title, ticker: m.ticker });
      if (type.kind !== "TOTAL") continue;
      const sportKey = inferOddsSportKeyFromKalshiMarket(m) ?? "unknown";

      entries.push(
        buildTotalsWatchEntry({
          id: m.ticker,
          sportKey,
          league: sportKey,
          game: title,
          kalshiMarketTicker: m.ticker,
          kalshiTotalLine: null,
          sportsbookLiveTotal: null,
          sportsbookPregameTotal: null,
          settlementExact: type.level !== "LEVEL_4_BLOCKED",
          scopePeriod: "FULL_GAME",
          overtimeRule: "OVERTIME_INCLUDED",
          homeScore: null,
          awayScore: null,
          period: null,
          clockRemainingSeconds: null,
          scoreFresh: false,
          clockFresh: false,
        })
      );
    }
  }

  return {
    dataLabel: entries.length > 0 ? "REAL_PROVIDER_DATA" : "NO_MATCHES_FOUND",
    providerStatus: "PRODUCTION",
    message:
      entries.length > 0
        ? `Totals watchlist — ${entries.length} markets`
        : "No totals markets matched — no fake watchlist entries",
    scannedAt: new Date().toISOString(),
    items: entries,
  };
}
