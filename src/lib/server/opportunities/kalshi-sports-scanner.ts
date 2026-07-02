import "server-only";

import { buildScoredOpportunity, sanitizeOpportunityForClient } from "@/lib/core/opportunity-engine";
import { detectKalshiMarketType, oddsMarketKeyForKind } from "@/lib/core/market-types";
import { matchEvents, normalizeTeamName } from "@/lib/core/matcher";
import { rankOpportunities } from "@/lib/core/profit-priority";
import type { KalshiMarketSummary } from "@/lib/core/contracts";
import type { EventMatchCandidate, OpportunityListResponse, ScoredOpportunity } from "@/lib/core/types";
import { oddsApiClient } from "@/lib/core/odds-client";
import { oddsFreshnessFromLastUpdate } from "@/lib/core/validators";
import { parseTeamsFromKalshiTitle } from "@/lib/server/opportunities/sport-mapping";
import {
  inferOddsSportKeyFromKalshiMarket,
  oddsSportSupported,
} from "@/lib/server/opportunities/sport-mapping";
import {
  scanKalshiMarketsOnly,
  KALSHI_MARKETS_QUERY,
  KALSHI_MAX_MARKETS_CHECKED,
  KALSHI_MARKETS_REQUEST_PATH,
  type KalshiMarketDiagnostic,
  type KalshiScanPhaseStatus,
} from "@/lib/server/opportunities/kalshi-only-scanner";
import {
  getCachedOddsEvents,
  setCachedOddsEvents,
} from "@/lib/server/opportunities/odds-scan-cache";
import { resolveProductionKalshiClient } from "@/lib/server/providers/provider-health";
import { getKeyReadinessReport } from "@/lib/server/keys/key-service";
import { buildAccountResponseFromProviders } from "@/lib/server/providers/provider-health";
import { getAppState } from "@/lib/storage/store";

const ODDS_MAX_AGE_MS = 120_000;
const MAX_ORDERBOOK_FETCHES = 120;

export type ScanPhaseStatus =
  | KalshiScanPhaseStatus
  | "ODDS_NOT_USED_KALSHI_FIRST"
  | "ODDS_MATCHING_STARTED";

export type ScanBlockReasonCounts = Record<string, number> & {
  kalshi_no_active_sports_markets: number;
  odds_api_no_events: number;
  odds_api_no_bookmakers: number;
  no_kalshi_odds_match: number;
  event_match_ambiguous: number;
  odds_api_sport_not_supported: number;
  stale_odds: number;
  stale_orderbook: number;
  settlement_mismatch: number;
  low_liquidity: number;
  edge_below_minimum: number;
  unconfirmed: number;
  provider_not_configured: number;
  market_type_blocked: number;
};

export interface ScanDiagnostics {
  environment: "prod";
  phaseStatus: ScanPhaseStatus;
  phaseStatuses: ScanPhaseStatus[];
  kalshiRequestPath: string;
  kalshiQueryUsed: typeof KALSHI_MARKETS_QUERY & {
    maxMarketsChecked: number;
    pagesFetched: number;
  };
  kalshiFetchError: string | null;
  kalshiQueryError?: import("@/lib/server/opportunities/kalshi-only-scanner").KalshiQueryErrorDiagnostics | null;
  first20MarketTickers?: string[];
  kalshiActiveMarkets: number;
  kalshiSportsMarkets: number;
  first20MarketTitles: string[];
  kalshiSportsMarketsList: KalshiMarketDiagnostic[];
  kalshiAllMarketsSample: KalshiMarketDiagnostic[];
  matchedMarkets: number;
  oddsUsed: boolean;
  oddsSportsScanned: string[];
  oddsEventsReturned: number;
  oddsBookmakersReturned: number;
  unsupportedSports: string[];
  blockReasonCounts: ScanBlockReasonCounts;
  primaryBlockReason: string | null;
  rejectedMarkets: Array<{ ticker: string; title: string; sportKey: string | null; reason: string }>;
}

function emptyBlockCounts(): ScanBlockReasonCounts {
  return {
    kalshi_no_active_sports_markets: 0,
    odds_api_no_events: 0,
    odds_api_no_bookmakers: 0,
    no_kalshi_odds_match: 0,
    event_match_ambiguous: 0,
    odds_api_sport_not_supported: 0,
    stale_odds: 0,
    stale_orderbook: 0,
    settlement_mismatch: 0,
    low_liquidity: 0,
    edge_below_minimum: 0,
    unconfirmed: 0,
    provider_not_configured: 0,
    market_type_blocked: 0,
  };
}

function bump(counts: ScanBlockReasonCounts, key: keyof ScanBlockReasonCounts) {
  counts[key] += 1;
}

function primaryReason(counts: ScanBlockReasonCounts): string | null {
  const entries = Object.entries(counts).filter(([, v]) => v > 0) as Array<
    [keyof ScanBlockReasonCounts, number]
  >;
  if (entries.length === 0) return null;
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0]![0];
}

function buildPhaseStatuses(input: {
  kalshi: KalshiScanPhaseStatus;
  sportsCount: number;
  marketsCount: number;
  oddsUsed: boolean;
}): ScanPhaseStatus[] {
  const statuses: ScanPhaseStatus[] = [input.kalshi];
  if (input.marketsCount > 0) statuses.push("KALSHI_MARKETS_FOUND");
  if (input.sportsCount > 0) statuses.push("KALSHI_SPORTS_MARKETS_FOUND");
  if (!input.oddsUsed) statuses.push("ODDS_NOT_USED_KALSHI_FIRST");
  return [...new Set(statuses)];
}

function emptyDiagnostics(overrides: Partial<ScanDiagnostics>): ScanDiagnostics {
  return {
    environment: "prod",
    phaseStatus: "PROVIDER_NOT_CONFIGURED",
    phaseStatuses: ["PROVIDER_NOT_CONFIGURED"],
    kalshiRequestPath: KALSHI_MARKETS_REQUEST_PATH,
    kalshiQueryUsed: {
      ...KALSHI_MARKETS_QUERY,
      maxMarketsChecked: KALSHI_MAX_MARKETS_CHECKED,
      pagesFetched: 0,
    },
    kalshiFetchError: null,
    kalshiActiveMarkets: 0,
    kalshiSportsMarkets: 0,
    first20MarketTitles: [],
    kalshiSportsMarketsList: [],
    kalshiAllMarketsSample: [],
    matchedMarkets: 0,
    oddsUsed: false,
    oddsSportsScanned: [],
    oddsEventsReturned: 0,
    oddsBookmakersReturned: 0,
    unsupportedSports: [],
    blockReasonCounts: emptyBlockCounts(),
    primaryBlockReason: null,
    rejectedMarkets: [],
    ...overrides,
  };
}

function eventFromOddsRow(sportKey: string, row: Record<string, unknown>): EventMatchCandidate {
  return {
    eventTicker: typeof row.id === "string" ? row.id : "",
    oddsEventId: typeof row.id === "string" ? row.id : "",
    sportKey,
    league: sportKey,
    startTimeIso: typeof row.commence_time === "string" ? row.commence_time : null,
    homeTeam: typeof row.home_team === "string" ? row.home_team : undefined,
    awayTeam: typeof row.away_team === "string" ? row.away_team : undefined,
  };
}

function teamInGame(teamName: string, home: string, away: string): boolean {
  const norm = normalizeTeamName(teamName);
  if (!norm) return false;
  const h = normalizeTeamName(home);
  const a = normalizeTeamName(away);
  return h === norm || a === norm || h.includes(norm) || a.includes(norm) || norm.includes(h) || norm.includes(a);
}

function buildKalshiEventCandidate(input: {
  market: KalshiMarketSummary;
  sportKey: string;
  teams: { teamA: string; teamB: string } | null;
  oddsHome?: string;
  oddsAway?: string;
  commenceTime?: string | null;
}): EventMatchCandidate {
  const title = input.market.title ?? input.market.ticker;
  const teams = input.teams ?? parseTeamsFromKalshiTitle(title);
  let homeTeam = input.oddsHome ?? teams?.teamA ?? "";
  let awayTeam = input.oddsAway ?? teams?.teamB ?? "";
  if (teams?.teamA && !teams.teamB && input.oddsHome && input.oddsAway) {
    homeTeam = input.oddsHome;
    awayTeam = input.oddsAway;
  } else if (teams?.teamA && teams.teamB) {
    homeTeam = teams.teamA;
    awayTeam = teams.teamB;
  }
  return {
    eventTicker: input.market.event_ticker ?? input.market.ticker,
    sportKey: input.sportKey,
    league: input.sportKey,
    startTimeIso: input.commenceTime ?? null,
    homeTeam,
    awayTeam,
  };
}

function findOddsEventMatches(input: {
  sportKey: string;
  market: KalshiMarketSummary;
  events: Record<string, unknown>[];
  teams: { teamA: string; teamB: string } | null;
}): Array<{ event: Record<string, unknown>; match: ReturnType<typeof matchEvents> }> {
  const title = input.market.title ?? input.market.ticker;
  const matched: Array<{ event: Record<string, unknown>; match: ReturnType<typeof matchEvents> }> = [];
  for (const event of input.events) {
    const home = typeof event.home_team === "string" ? event.home_team : "";
    const away = typeof event.away_team === "string" ? event.away_team : "";
    const commenceTime = typeof event.commence_time === "string" ? event.commence_time : null;
    if (input.teams?.teamA && input.teams.teamB) {
      const mentionsBoth =
        normalizeTeamName(title).includes(normalizeTeamName(home)) &&
        normalizeTeamName(title).includes(normalizeTeamName(away));
      if (!mentionsBoth) {
        const bothNamed =
          teamInGame(input.teams.teamA, home, away) && teamInGame(input.teams.teamB, home, away);
        if (!bothNamed) continue;
      }
    } else if (input.teams?.teamA && !input.teams.teamB) {
      if (!teamInGame(input.teams.teamA, home, away)) continue;
    }
    const kalshiEventCandidate = buildKalshiEventCandidate({
      market: input.market,
      sportKey: input.sportKey,
      teams: input.teams,
      oddsHome: home,
      oddsAway: away,
      commenceTime,
    });
    const eventMatch = matchEvents(kalshiEventCandidate, eventFromOddsRow(input.sportKey, event));
    if (eventMatch.confidence === "HIGH" || eventMatch.confidence === "MEDIUM") {
      matched.push({ event, match: eventMatch });
    }
  }
  return matched;
}

function oddsEventFresh(event: Record<string, unknown>): boolean {
  const bookmakers = Array.isArray(event.bookmakers) ? event.bookmakers : [];
  if (bookmakers.length === 0) return false;
  const lastUpdates = bookmakers
    .filter((b) => typeof b === "object" && b !== null)
    .map((b) => (b as Record<string, unknown>).last_update)
    .filter((v): v is string => typeof v === "string");
  return lastUpdates.some((iso) => oddsFreshnessFromLastUpdate(iso, ODDS_MAX_AGE_MS).fresh);
}

function countBookmakers(events: Record<string, unknown>[]): number {
  return events.reduce((sum, event) => {
    const bookmakers = Array.isArray(event.bookmakers) ? event.bookmakers : [];
    return sum + bookmakers.length;
  }, 0);
}

function classifyOpportunityBlock(opp: ScoredOpportunity, counts: ScanBlockReasonCounts): void {
  const reason = opp.reason.toLowerCase();
  if (opp.state === "BLOCKED" && reason.includes("edge")) bump(counts, "edge_below_minimum");
  else if (opp.state === "BLOCKED" && reason.includes("liquidity")) bump(counts, "low_liquidity");
  else if (opp.state === "BLOCKED" && reason.includes("settlement")) bump(counts, "settlement_mismatch");
  else if (opp.orderbookFreshness === "STALE") bump(counts, "stale_orderbook");
  else if (opp.oddsFreshness === "STALE") bump(counts, "stale_odds");
  else if (opp.state === "UNCONFIRMED") bump(counts, "unconfirmed");
}

async function resolveBankroll(): Promise<number> {
  const live = await buildAccountResponseFromProviders();
  if (live?.bankroll?.value != null && typeof live.bankroll.value === "number") {
    return live.bankroll.value;
  }
  const state = await getAppState();
  return state.stakeSettings.bankrollPlaceholder;
}

async function fetchOddsForSport(sportKey: string): Promise<Record<string, unknown>[]> {
  const cached = getCachedOddsEvents(sportKey);
  if (cached) return cached;

  const oddsRes = await oddsApiClient.getOdds(sportKey, {
    regions: "us",
    markets: "h2h,spreads,totals",
    oddsFormat: "american",
  });
  if (!oddsRes.ok) return [];
  const events = oddsRes.data
    .filter((e) => typeof e === "object" && e !== null)
    .map((e) => e as Record<string, unknown>);
  setCachedOddsEvents(sportKey, events);
  return events;
}

function kalshiDiagnosticsFromScan(kalshiScan: Awaited<ReturnType<typeof scanKalshiMarketsOnly>>): ScanDiagnostics {
  return emptyDiagnostics({
    phaseStatus: kalshiScan.phaseStatus,
    phaseStatuses: buildPhaseStatuses({
      kalshi: kalshiScan.phaseStatus,
      sportsCount: kalshiScan.sportsMarketsCount,
      marketsCount: kalshiScan.marketsReturnedRaw || kalshiScan.marketsReturned,
      oddsUsed: false,
    }),
    kalshiRequestPath: kalshiScan.kalshiRequestPath,
    kalshiQueryUsed: kalshiScan.kalshiRequestQuery,
    kalshiFetchError: kalshiScan.kalshiFetchError,
    kalshiActiveMarkets: kalshiScan.marketsReturned,
    kalshiSportsMarkets: kalshiScan.sportsMarketsCount,
    first20MarketTitles: kalshiScan.first20MarketTitles,
    first20MarketTickers: kalshiScan.first20MarketTickers,
    kalshiQueryError: kalshiScan.kalshiQueryError,
    kalshiSportsMarketsList: kalshiScan.sportsMarkets,
    kalshiAllMarketsSample: kalshiScan.allMarkets.slice(0, 100),
  });
}

export async function scanKalshiSportsOpportunities(): Promise<
  OpportunityListResponse & { scanDiagnostics: ScanDiagnostics }
> {
  const scannedAt = new Date().toISOString();
  const counts = emptyBlockCounts();
  const rejectedMarkets: Array<{ ticker: string; title: string; sportKey: string | null; reason: string }> = [];

  const kalshiScan = await scanKalshiMarketsOnly();
  const baseDiag = kalshiDiagnosticsFromScan(kalshiScan);

  if (kalshiScan.phaseStatus === "PROVIDER_NOT_CONFIGURED") {
    bump(counts, "provider_not_configured");
    return {
      dataLabel: "PROVIDER_NOT_CONFIGURED",
      providerStatus: "PROVIDER_NOT_CONFIGURED",
      message: "Configure production Kalshi API + private key to scan markets",
      scannedAt,
      items: [],
      scanDiagnostics: {
        ...baseDiag,
        blockReasonCounts: counts,
        primaryBlockReason: "provider_not_configured",
      },
    };
  }

  if (kalshiScan.phaseStatus === "KALSHI_QUERY_INVALID") {
    return {
      dataLabel: "KALSHI_QUERY_INVALID",
      providerStatus: "KALSHI_QUERY_INVALID",
      message: kalshiScan.kalshiQueryError
        ? `Kalshi markets query invalid (HTTP ${kalshiScan.kalshiQueryError.statusCode}) — ${kalshiScan.kalshiQueryError.responseBody}`
        : "Kalshi markets query invalid",
      scannedAt,
      items: [],
      scanDiagnostics: {
        ...baseDiag,
        phaseStatus: "KALSHI_QUERY_INVALID",
        phaseStatuses: ["KALSHI_QUERY_INVALID"],
        kalshiFetchError: kalshiScan.kalshiFetchError,
        primaryBlockReason: "kalshi_query_invalid",
      },
    };
  }

  if (kalshiScan.marketsReturned === 0 && kalshiScan.marketsReturnedRaw === 0) {
    return {
      dataLabel: "KALSHI_QUERY_RETURNED_ZERO",
      providerStatus: "KALSHI_QUERY_RETURNED_ZERO",
      message: kalshiScan.kalshiFetchError
        ? `Kalshi markets query returned 0 — ${kalshiScan.kalshiFetchError}`
        : "Kalshi markets query returned 0 active markets",
      scannedAt,
      items: [],
      scanDiagnostics: {
        ...baseDiag,
        phaseStatus: "KALSHI_QUERY_RETURNED_ZERO",
        phaseStatuses: ["KALSHI_QUERY_RETURNED_ZERO"],
        primaryBlockReason: kalshiScan.kalshiFetchError ?? "kalshi_query_returned_zero",
      },
    };
  }

  if (kalshiScan.sportsMarketsCount === 0) {
    bump(counts, "kalshi_no_active_sports_markets");
    return {
      dataLabel: "KALSHI_MARKETS_FOUND_BUT_CLASSIFIER_REJECTED_ALL",
      providerStatus: "KALSHI_MARKETS_FOUND_BUT_CLASSIFIER_REJECTED_ALL",
      message: `${kalshiScan.marketsReturned} Kalshi markets found — 0 classified as sports. Odds API not called.`,
      scannedAt,
      items: [],
      scanDiagnostics: {
        ...baseDiag,
        phaseStatus: "KALSHI_MARKETS_FOUND_BUT_CLASSIFIER_REJECTED_ALL",
        phaseStatuses: buildPhaseStatuses({
          kalshi: "KALSHI_MARKETS_FOUND_BUT_CLASSIFIER_REJECTED_ALL",
          sportsCount: 0,
          marketsCount: kalshiScan.marketsReturned,
          oddsUsed: false,
        }),
        blockReasonCounts: counts,
        primaryBlockReason: "kalshi_no_active_sports_markets",
        rejectedMarkets: kalshiScan.allMarkets
          .filter((m) => m.category !== "sports")
          .slice(0, 40)
          .map((m) => ({
            ticker: m.ticker,
            title: m.title,
            sportKey: null,
            reason: m.rejectReason ?? m.category,
          })),
      },
    };
  }

  const readiness = await getKeyReadinessReport();
  const sportsMarkets = kalshiScan.rawMarkets;
  let oddsUsed = false;
  let oddsEventsReturned = 0;
  let oddsBookmakersReturned = 0;
  const oddsSportsScanned: string[] = [];
  const unsupportedSports: string[] = [];
  const oddsBySport = new Map<string, Record<string, unknown>[]>();
  let matchedMarkets = 0;
  const opportunities: ScoredOpportunity[] = [];

  if (!readiness.oddsConfigured) {
    return {
      dataLabel: "KALSHI_SPORTS_MARKETS_FOUND",
      providerStatus: "ODDS_NOT_USED_KALSHI_FIRST",
      message: `${kalshiScan.sportsMarketsCount} Kalshi sports markets found — no Odds edge yet (Odds API key not configured)`,
      scannedAt,
      items: [],
      scanDiagnostics: {
        ...baseDiag,
        phaseStatus: "ODDS_NOT_USED_KALSHI_FIRST",
        phaseStatuses: buildPhaseStatuses({
          kalshi: "KALSHI_SPORTS_MARKETS_FOUND",
          sportsCount: kalshiScan.sportsMarketsCount,
          marketsCount: kalshiScan.marketsReturned,
          oddsUsed: false,
        }),
        oddsUsed: false,
        primaryBlockReason: "odds_api_not_configured",
      },
    };
  }

  const sportKeysNeeded = [
    ...new Set(
      sportsMarkets
        .map((m) => inferOddsSportKeyFromKalshiMarket(m))
        .filter((s): s is string => s != null)
    ),
  ];

  for (const sportKey of sportKeysNeeded) {
    if (!oddsSportSupported(sportKey)) {
      unsupportedSports.push(sportKey);
      bump(counts, "odds_api_sport_not_supported");
      continue;
    }
    oddsUsed = true;
    oddsSportsScanned.push(sportKey);
    const events = await fetchOddsForSport(sportKey);
    oddsBySport.set(sportKey, events);
    oddsEventsReturned += events.length;
    oddsBookmakersReturned += countBookmakers(events);
    if (events.length === 0) bump(counts, "odds_api_no_events");
    if (events.length > 0 && countBookmakers(events) === 0) bump(counts, "odds_api_no_bookmakers");
  }

  const { client } = await resolveProductionKalshiClient();
  const bankroll = await resolveBankroll();
  const appState = await getAppState();
  let orderbookFetches = 0;

  for (const market of sportsMarkets) {
    const sportKey = inferOddsSportKeyFromKalshiMarket(market);
    const title = market.title ?? market.ticker;
    if (!sportKey || !oddsSportSupported(sportKey)) {
      rejectedMarkets.push({
        ticker: market.ticker,
        title,
        sportKey,
        reason: sportKey ? "odds_api_sport_not_supported" : "no_odds_sport_key_mapped",
      });
      continue;
    }

    const events = oddsBySport.get(sportKey) ?? [];
    const teams = parseTeamsFromKalshiTitle(title);
    const marketType = detectKalshiMarketType({
      title,
      ticker: market.ticker,
      eventTicker: market.event_ticker,
    });
    if (marketType.level === "LEVEL_4_BLOCKED") {
      bump(counts, "market_type_blocked");
      rejectedMarkets.push({
        ticker: market.ticker,
        title,
        sportKey,
        reason: marketType.exclusionReason ?? "market_type_blocked",
      });
      continue;
    }

    const oddsMarketKey = oddsMarketKeyForKind(marketType.kind);
    const matchedEvents = findOddsEventMatches({ sportKey, market, events, teams });

    if (matchedEvents.length === 0) {
      bump(counts, "no_kalshi_odds_match");
      rejectedMarkets.push({ ticker: market.ticker, title, sportKey, reason: "no_kalshi_odds_match" });
      continue;
    }
    if (matchedEvents.length > 1) {
      bump(counts, "event_match_ambiguous");
      rejectedMarkets.push({ ticker: market.ticker, title, sportKey, reason: "event_match_ambiguous" });
      continue;
    }

    matchedMarkets += 1;
    if (orderbookFetches >= MAX_ORDERBOOK_FETCHES) continue;
    orderbookFetches += 1;
    const obRes = await client.getOrderbook(market.ticker);
    if (!obRes.ok || obRes.data.freshnessState === "STALE") {
      bump(counts, "stale_orderbook");
      rejectedMarkets.push({
        ticker: market.ticker,
        title,
        sportKey,
        reason: obRes.ok ? "stale_orderbook" : "orderbook_fetch_failed",
      });
      continue;
    }

    const { event: oddsEvent, match } = matchedEvents[0]!;
    const homeTeam = typeof oddsEvent.home_team === "string" ? oddsEvent.home_team : teams?.teamA ?? "";
    const awayTeam = typeof oddsEvent.away_team === "string" ? oddsEvent.away_team : teams?.teamB ?? "";
    const commenceTime = typeof oddsEvent.commence_time === "string" ? oddsEvent.commence_time : null;
    const freshOdds = oddsEventFresh(oddsEvent);
    if (!freshOdds) bump(counts, "stale_odds");
    const isLive = commenceTime ? Date.parse(commenceTime) < Date.now() : false;
    const targetTeam = homeTeam || teams?.teamA || "";
    const opponentTeam = awayTeam || teams?.teamB || "";

    for (const side of ["YES", "NO"] as const) {
      const scored = buildScoredOpportunity({
        id: `${market.ticker}-${typeof oddsEvent.id === "string" ? oddsEvent.id : market.ticker}-${side}`,
        sportKey,
        league: sportKey,
        kalshiMarketTicker: market.ticker,
        kalshiMarketTitle: title,
        kalshiEventTicker: market.event_ticker ?? market.ticker,
        kalshiMarketStatus: market.status,
        orderbook: obRes.data,
        oddsEvent,
        targetTeamName: side === "YES" ? targetTeam : opponentTeam,
        opponentTeamName: side === "YES" ? opponentTeam : targetTeam,
        side,
        isLive,
        oddsFresh: freshOdds,
        oddsMarketKey,
        bankroll,
        stakeSettings: appState.stakeSettings,
      });
      if (match.blockCode?.includes("SETTLEMENT")) bump(counts, "settlement_mismatch");
      classifyOpportunityBlock(scored, counts);
      opportunities.push(sanitizeOpportunityForClient(scored));
    }
  }

  const ranked = rankOpportunities(opportunities);
  const primary = primaryReason(counts);
  const bettable = ranked.filter((o) => o.state === "BETTABLE").length;
  const phaseStatuses = buildPhaseStatuses({
    kalshi: "KALSHI_SPORTS_MARKETS_FOUND",
    sportsCount: kalshiScan.sportsMarketsCount,
    marketsCount: kalshiScan.marketsReturned,
    oddsUsed,
  });
  if (oddsUsed) phaseStatuses.push("ODDS_MATCHING_STARTED");

  const scanDiagnostics: ScanDiagnostics = {
    ...baseDiag,
    phaseStatus: oddsUsed ? "ODDS_MATCHING_STARTED" : "ODDS_NOT_USED_KALSHI_FIRST",
    phaseStatuses,
    matchedMarkets,
    oddsUsed,
    oddsSportsScanned,
    oddsEventsReturned,
    oddsBookmakersReturned,
    unsupportedSports,
    blockReasonCounts: counts,
    primaryBlockReason: primary,
    rejectedMarkets: rejectedMarkets.slice(0, 40),
  };

  if (ranked.length === 0) {
    return {
      dataLabel: "KALSHI_SPORTS_MARKETS_FOUND",
      providerStatus: oddsUsed ? "ODDS_MATCHING_STARTED" : "ODDS_NOT_USED_KALSHI_FIRST",
      message: oddsUsed
        ? `${kalshiScan.sportsMarketsCount} Kalshi sports markets — no Odds edge yet${primary ? ` (${primary.replaceAll("_", " ")})` : ""}`
        : `${kalshiScan.sportsMarketsCount} Kalshi sports markets found — Odds matching skipped`,
      scannedAt,
      items: [],
      scanDiagnostics,
    };
  }

  return {
    dataLabel: bettable > 0 ? "REAL_PROVIDER_DATA" : "KALSHI_SPORTS_MARKETS_FOUND",
    providerStatus: "PRODUCTION",
    message:
      bettable > 0
        ? `${kalshiScan.sportsMarketsCount} Kalshi sports markets · ${ranked.length} candidates (${bettable} BETTABLE)`
        : `${kalshiScan.sportsMarketsCount} Kalshi sports markets · ${ranked.length} candidates, none BETTABLE yet`,
    scannedAt,
    items: ranked,
    scanDiagnostics,
  };
}

export { KALSHI_MARKETS_QUERY, KALSHI_MARKETS_REQUEST_PATH, KALSHI_MAX_MARKETS_CHECKED };
