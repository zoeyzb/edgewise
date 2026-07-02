import "server-only";

import { buildScoredOpportunity, sanitizeOpportunityForClient } from "@/lib/core/opportunity-engine";
import { detectKalshiMarketType } from "@/lib/core/market-types";
import { normalizeTeamName } from "@/lib/core/matcher";
import { rankOpportunities } from "@/lib/core/profit-priority";
import { buildTotalsWatchEntry } from "@/lib/core/totals-momentum";
import type {
  OpportunityListResponse,
  ScoredOpportunity,
  TotalsWatchEntry,
} from "@/lib/core/types";
import { KalshiClient } from "@/lib/core/kalshi-client";
import { oddsApiClient } from "@/lib/core/odds-client";
import { oddsFreshnessFromLastUpdate } from "@/lib/core/validators";
import {
  resolveKalshiCredentials,
} from "@/lib/server/providers/provider-health";
import { getKeyReadinessReport } from "@/lib/server/keys/key-service";

const SCAN_SPORTS = ["basketball_nba", "americanfootball_nfl"] as const;
const ODDS_MAX_AGE_MS = 120_000;
const MAX_MARKETS_PER_SPORT = 40;

function parseTeamsFromKalshiTitle(title: string): { teamA: string; teamB: string } | null {
  const vsMatch = title.match(/(.+?)\s+(?:vs\.?|v\.|@)\s+(.+)/i);
  if (vsMatch) {
    return { teamA: vsMatch[1]!.trim(), teamB: vsMatch[2]!.trim() };
  }
  const winMatch = title.match(/will\s+(.+?)\s+win/i);
  if (winMatch) {
    return { teamA: winMatch[1]!.trim(), teamB: "" };
  }
  return null;
}

function titleMentionsTeam(title: string, team: string): boolean {
  const normTitle = normalizeTeamName(title);
  const normTeam = normalizeTeamName(team);
  return normTitle.includes(normTeam) || normTeam.split(" ").some((w) => w.length > 3 && normTitle.includes(w));
}

function marketMatchesOddsEvent(
  marketTitle: string,
  homeTeam: string,
  awayTeam: string
): boolean {
  return (
    titleMentionsTeam(marketTitle, homeTeam) && titleMentionsTeam(marketTitle, awayTeam)
  );
}

async function resolveKalshiClient(): Promise<{
  client: KalshiClient;
  configured: boolean;
}> {
  const prod = await resolveKalshiCredentials("prod");
  const demo = await resolveKalshiCredentials("demo");
  const creds = prod ?? demo;
  const env = prod ? "prod" : "demo";
  return {
    client: creds ? new KalshiClient(creds, env) : KalshiClient.withoutCredentials(env),
    configured: creds != null,
  };
}

export async function buildOpportunityScanResponse(): Promise<OpportunityListResponse> {
  const readiness = await getKeyReadinessReport();
  const { client, configured: kalshiConfigured } = await resolveKalshiClient();

  if (!readiness.oddsConfigured || !kalshiConfigured) {
    return {
      dataLabel: "PROVIDER_NOT_CONFIGURED",
      providerStatus: "PROVIDER_NOT_CONFIGURED",
      message: "Configure Kalshi and Odds API keys to scan opportunities",
      scannedAt: new Date().toISOString(),
      items: [],
    };
  }

  const opportunities: ScoredOpportunity[] = [];

  for (const sportKey of SCAN_SPORTS) {
    const [oddsRes, marketsRes] = await Promise.all([
      oddsApiClient.getOdds(sportKey, {
        regions: "us",
        markets: "h2h",
        oddsFormat: "american",
      }),
      client.searchMarkets({ status: "active", limit: MAX_MARKETS_PER_SPORT }),
    ]);

    if (!oddsRes.ok || !marketsRes.ok) continue;

    const events = Array.isArray(oddsRes.data) ? oddsRes.data : [];
    const markets = marketsRes.data.markets;

    for (const rawEvent of events) {
      if (typeof rawEvent !== "object" || rawEvent === null) continue;
      const event = rawEvent as Record<string, unknown>;
      const homeTeam = typeof event.home_team === "string" ? event.home_team : null;
      const awayTeam = typeof event.away_team === "string" ? event.away_team : null;
      if (!homeTeam || !awayTeam) continue;

      const bookmakers = Array.isArray(event.bookmakers) ? event.bookmakers : [];
      const lastUpdates = bookmakers
        .filter((b) => typeof b === "object" && b !== null)
        .map((b) => (b as Record<string, unknown>).last_update)
        .filter((v): v is string => typeof v === "string");
      const oddsFresh = lastUpdates.some((iso) => oddsFreshnessFromLastUpdate(iso, ODDS_MAX_AGE_MS).fresh);

      const matchedMarkets = markets.filter((m) => {
        const title = m.title ?? m.ticker;
        const type = detectKalshiMarketType({ title, ticker: m.ticker });
        if (type.kind !== "MONEYLINE" || type.level === "LEVEL_4_BLOCKED") return false;
        return marketMatchesOddsEvent(title ?? m.ticker, homeTeam, awayTeam);
      });

      if (matchedMarkets.length === 0) continue;
      if (matchedMarkets.length > 1) {
        // ambiguous — skip rather than fake match
        continue;
      }

      const market = matchedMarkets[0]!;
      const obRes = await client.getOrderbook(market.ticker);
      if (!obRes.ok) continue;

      const commenceTime = typeof event.commence_time === "string" ? event.commence_time : null;
      const isLive = commenceTime ? Date.parse(commenceTime) < Date.now() : false;

      const scored = buildScoredOpportunity({
        id: `${market.ticker}-${typeof event.id === "string" ? event.id : market.ticker}`,
        sportKey,
        league: sportKey,
        kalshiMarketTicker: market.ticker,
        kalshiMarketTitle: market.title ?? market.ticker,
        kalshiEventTicker: market.event_ticker ?? market.ticker,
        kalshiMarketStatus: market.status,
        orderbook: obRes.data,
        oddsEvent: event,
        targetTeamName: homeTeam,
        opponentTeamName: awayTeam,
        side: "YES",
        isLive,
        oddsFresh,
        requestedStake: 50,
      });

      opportunities.push(sanitizeOpportunityForClient(scored));
    }
  }

  const ranked = rankOpportunities(opportunities);

  return {
    dataLabel: ranked.length > 0 ? "REAL_PROVIDER_DATA" : "NO_MATCHES_FOUND",
    providerStatus: "CONFIGURED",
    message:
      ranked.length > 0
        ? `Scanned ${ranked.length} matched opportunity candidates`
        : "Providers configured — no verified matches found (no fake data injected)",
    scannedAt: new Date().toISOString(),
    items: ranked,
  };
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
  const { client, configured } = await resolveKalshiClient();

  if (!readiness.oddsConfigured || !configured) {
    return {
      dataLabel: "PROVIDER_NOT_CONFIGURED",
      providerStatus: "PROVIDER_NOT_CONFIGURED",
      message: "Configure providers for totals watchlist",
      scannedAt: new Date().toISOString(),
      items: [],
    };
  }

  const entries: TotalsWatchEntry[] = [];
  const marketsRes = await client.searchMarkets({ status: "active", limit: MAX_MARKETS_PER_SPORT });

  if (marketsRes.ok) {
    for (const m of marketsRes.data.markets) {
      const title = m.title ?? m.ticker;
      const type = detectKalshiMarketType({ title, ticker: m.ticker });
      if (type.kind !== "TOTAL") continue;

      entries.push(
        buildTotalsWatchEntry({
          id: m.ticker,
          sportKey: "basketball_nba",
          league: "basketball_nba",
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
    providerStatus: "CONFIGURED",
    message:
      entries.length > 0
        ? `Totals watchlist — ${entries.length} markets (score-pace requires live score feed)`
        : "No totals markets matched — no fake watchlist entries",
    scannedAt: new Date().toISOString(),
    items: entries,
  };
}

export { parseTeamsFromKalshiTitle, marketMatchesOddsEvent };
