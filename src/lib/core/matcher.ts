/**
 * Event and market matching engine.
 * Never rely on fuzzy team matching alone — structured fields required.
 */

import { MATCH_BLOCK_CODES, ODDS_API_CONTRACT } from "@/lib/core/contracts";
import {
  classifyCombinedMarketLevel,
  detectKalshiMarketType,
  detectOddsMarketType,
  evaluateStrategyScope,
  maxDecisionForMarketLevel,
} from "@/lib/core/market-types";
import {
  parseKalshiSettlementScope,
  parseOddsSettlementScope,
  settlementAllowsBettability,
  verifySettlementCompatibility,
} from "@/lib/core/settlement";
import type {
  EventMatchCandidate,
  EventMatchResult,
  LiveMatchContext,
  MarketMatchCandidate,
  MarketMatchResult,
  MatchConfidence,
  OpportunityDecision,
  OpportunityDecisionState,
  TeamAliasMap,
} from "@/lib/core/types";

const DEFAULT_START_TIME_TOLERANCE_MS = 30 * 60 * 1000;

const DEFAULT_TEAM_ALIASES: TeamAliasMap = {
  "la clippers": "los angeles clippers",
  lac: "los angeles clippers",
  "la lakers": "los angeles lakers",
  lal: "los angeles lakers",
  "ny knicks": "new york knicks",
  nyk: "new york knicks",
  "gs warriors": "golden state warriors",
  gsw: "golden state warriors",
  "tb buccaneers": "tampa bay buccaneers",
  tb: "tampa bay buccaneers",
  "ne patriots": "new england patriots",
  ne: "new england patriots",
};

export function normalizeTeamName(name: string, aliases: TeamAliasMap = DEFAULT_TEAM_ALIASES): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return aliases[base] ?? base;
}

export function compareStartTimes(
  kalshiStartIso: string | null | undefined,
  oddsCommenceIso: string | null | undefined,
  toleranceMs = DEFAULT_START_TIME_TOLERANCE_MS
): { match: boolean; deltaMs: number | null; reason: string } {
  if (!kalshiStartIso) {
    return { match: false, deltaMs: null, reason: "kalshi start time missing" };
  }
  if (!oddsCommenceIso) {
    return { match: false, deltaMs: null, reason: "odds commence time missing" };
  }
  const kalshiMs = Date.parse(kalshiStartIso);
  const oddsMs = Date.parse(oddsCommenceIso);
  if (!Number.isFinite(kalshiMs) || !Number.isFinite(oddsMs)) {
    return { match: false, deltaMs: null, reason: "invalid ISO timestamp" };
  }
  const deltaMs = Math.abs(kalshiMs - oddsMs);
  return {
    match: deltaMs <= toleranceMs,
    deltaMs,
    reason:
      deltaMs <= toleranceMs
        ? "start times within tolerance"
        : `start time delta ${Math.round(deltaMs / 60000)}m exceeds tolerance`,
  };
}

function scoreTeamPair(a: string, b: string, aliases?: TeamAliasMap): boolean {
  return normalizeTeamName(a, aliases) === normalizeTeamName(b, aliases);
}

function deriveEventConfidence(input: {
  sportMatch: boolean;
  leagueMatch: boolean;
  homeMatch: boolean;
  awayMatch: boolean;
  startTimeMatch: boolean;
  neutralSiteConsistent: boolean;
  duplicateCandidates: number;
}): MatchConfidence {
  if (input.duplicateCandidates > 1) return "LOW";
  if (!input.sportMatch || !input.leagueMatch) return "LOW";
  if (!input.homeMatch || !input.awayMatch) return "LOW";
  if (!input.startTimeMatch) return "MEDIUM";
  if (!input.neutralSiteConsistent) return "MEDIUM";
  return "HIGH";
}

export function matchEvents(
  kalshi: EventMatchCandidate,
  odds: EventMatchCandidate,
  options?: { aliases?: TeamAliasMap; startToleranceMs?: number }
): EventMatchResult {
  const aliases = options?.aliases;
  const sportMatch =
    kalshi.sportKey.toLowerCase() === odds.sportKey.toLowerCase() &&
    (ODDS_API_CONTRACT.allowedSportKeys as readonly string[]).includes(odds.sportKey);

  const leagueMatch =
    !kalshi.league || !odds.league
      ? true
      : kalshi.league.toLowerCase() === odds.league.toLowerCase();

  const kalshiHome = kalshi.homeTeam ?? "";
  const kalshiAway = kalshi.awayTeam ?? "";
  const oddsHome = odds.homeTeam ?? "";
  const oddsAway = odds.awayTeam ?? "";

  const directHome = scoreTeamPair(kalshiHome, oddsHome, aliases);
  const directAway = scoreTeamPair(kalshiAway, oddsAway, aliases);
  const swappedHome = scoreTeamPair(kalshiHome, oddsAway, aliases);
  const swappedAway = scoreTeamPair(kalshiAway, oddsHome, aliases);

  const orientationDirect = directHome && directAway;
  const orientationSwapped = swappedHome && swappedAway;
  const homeMatch = orientationDirect || orientationSwapped;
  const awayMatch = orientationDirect || orientationSwapped;

  const start = compareStartTimes(
    kalshi.startTimeIso,
    odds.startTimeIso,
    options?.startToleranceMs
  );

  const neutralSiteConsistent =
    kalshi.neutralSite == null || odds.neutralSite == null
      ? true
      : kalshi.neutralSite === odds.neutralSite;

  const confidence = deriveEventConfidence({
    sportMatch,
    leagueMatch,
    homeMatch,
    awayMatch,
    startTimeMatch: start.match,
    neutralSiteConsistent,
    duplicateCandidates: kalshi.duplicateCandidateCount ?? 1,
  });

  const matchedFields: string[] = [];
  if (sportMatch) matchedFields.push("sport_key");
  if (leagueMatch && kalshi.league) matchedFields.push("league");
  if (homeMatch) matchedFields.push("home_team");
  if (awayMatch) matchedFields.push("away_team");
  if (start.match) matchedFields.push("start_time");
  if (kalshi.eventTicker && odds.oddsEventId) matchedFields.push("event_ids");

  let blockCode: string | null = null;
  let reason = "event match evaluated";

  if ((kalshi.duplicateCandidateCount ?? 1) > 1) {
    blockCode = MATCH_BLOCK_CODES.EVENT_MATCH_AMBIGUOUS;
    reason = "multiple candidate events remain after structured filtering";
  } else if (!homeMatch || !awayMatch) {
    blockCode = MATCH_BLOCK_CODES.MATCH_CONFIDENCE_LOW;
    reason = "team names do not align after normalization";
  } else if (!start.match) {
    reason = start.reason;
  }

  return {
    kalshiEventTicker: kalshi.eventTicker,
    oddsEventId: odds.oddsEventId,
    confidence,
    matchedFields,
    startTimeDeltaMs: start.deltaMs,
    orientation: orientationDirect ? "DIRECT" : orientationSwapped ? "SWAPPED" : "UNKNOWN",
    blockCode,
    reason,
    ambiguous: blockCode === MATCH_BLOCK_CODES.EVENT_MATCH_AMBIGUOUS,
  };
}

export function evaluateLiveMatchContext(ctx: LiveMatchContext): {
  allowed: boolean;
  blockCode: string | null;
  reason: string;
} {
  if (!ctx.isLive) {
    return { allowed: true, blockCode: null, reason: "pre-game — REST orderbook acceptable" };
  }

  if (ctx.orderbookSource === "REST") {
    return {
      allowed: false,
      blockCode: MATCH_BLOCK_CODES.REST_ONLY_LIVE,
      reason: "REST-only live execution not allowed",
    };
  }

  if (ctx.wsConnected !== true) {
    return {
      allowed: false,
      blockCode: MATCH_BLOCK_CODES.LIVE_ORDERBOOK_NOT_GREEN,
      reason: "Kalshi WebSocket not connected",
    };
  }

  if (ctx.snapshotLoaded !== true) {
    return {
      allowed: false,
      blockCode: MATCH_BLOCK_CODES.LIVE_ORDERBOOK_NOT_GREEN,
      reason: "orderbook snapshot not loaded",
    };
  }

  if (ctx.sequenceGap === true) {
    return {
      allowed: false,
      blockCode: MATCH_BLOCK_CODES.LIVE_ORDERBOOK_NOT_GREEN,
      reason: "sequence gap detected — stale orderbook state",
    };
  }

  if (ctx.wsFreshness !== "FRESH") {
    return {
      allowed: false,
      blockCode: MATCH_BLOCK_CODES.LIVE_ORDERBOOK_NOT_GREEN,
      reason: `WebSocket freshness ${ctx.wsFreshness ?? "UNKNOWN"}`,
    };
  }

  if (ctx.scoreFeedFresh !== true) {
    return {
      allowed: false,
      blockCode: MATCH_BLOCK_CODES.STALE_LIVE_GAME,
      reason: "score feed missing or stale",
    };
  }

  if (ctx.oddsFeedFresh !== true) {
    return {
      allowed: false,
      blockCode: MATCH_BLOCK_CODES.STALE_LIVE_GAME,
      reason: "odds feed stale for live game",
    };
  }

  if (ctx.clockKnown === false && ctx.strategyDependsOnClock === true) {
    return {
      allowed: false,
      blockCode: MATCH_BLOCK_CODES.STALE_LIVE_GAME,
      reason: "clock/period unknown for clock-dependent strategy",
    };
  }

  return { allowed: true, blockCode: null, reason: "live feeds GREEN" };
}

export function matchMarket(candidate: MarketMatchCandidate): MarketMatchResult {
  const kalshiType = detectKalshiMarketType({
    title: candidate.kalshiMarketTitle,
    ticker: candidate.kalshiMarketTicker,
    eventTicker: candidate.kalshiEventTicker,
  });

  const oddsType = detectOddsMarketType(candidate.oddsMarketKey);
  const combinedLevel = classifyCombinedMarketLevel(kalshiType, oddsType);

  const scopeVerdict = evaluateStrategyScope({
    sportKey: candidate.sportKey,
    kalshiType,
    isLive: candidate.isLive,
  });

  const kalshiScope = parseKalshiSettlementScope(candidate.kalshiMarketTitle);
  const oddsScope = parseOddsSettlementScope({
    marketKey: candidate.oddsMarketKey,
    point: candidate.oddsLine,
    description: candidate.oddsMarketDescription,
  });

  const settlement = verifySettlementCompatibility({
    kalshiScope,
    oddsScope,
    kalshiType,
    oddsMarketKey: candidate.oddsMarketKey,
    kalshiLine: candidate.kalshiLine,
    oddsLine: candidate.oddsLine,
  });

  const eventMatch = matchEvents(candidate.kalshiEvent, candidate.oddsEvent, {
    aliases: candidate.teamAliases,
  });

  const liveCheck = evaluateLiveMatchContext({
    isLive: candidate.isLive ?? false,
    orderbookSource: candidate.orderbookSource ?? "REST",
    wsConnected: candidate.wsConnected,
    snapshotLoaded: candidate.snapshotLoaded,
    sequenceGap: candidate.sequenceGap,
    wsFreshness: candidate.wsFreshness,
    scoreFeedFresh: candidate.scoreFeedFresh,
    oddsFeedFresh: candidate.oddsFeedFresh,
    clockKnown: candidate.clockKnown,
    strategyDependsOnClock: candidate.strategyDependsOnClock,
  });

  const decision = resolveOpportunityDecision({
    eventConfidence: eventMatch.confidence,
    eventAmbiguous: eventMatch.ambiguous,
    eventBlockCode: eventMatch.blockCode,
    marketLevel: combinedLevel,
    settlement,
    scopeInScope: scopeVerdict.inScope,
    scopeBlockCode: scopeVerdict.blockCode ?? null,
    liveAllowed: liveCheck.allowed,
    liveBlockCode: liveCheck.blockCode,
    settlementExact: settlement.exact,
  });

  return {
    kalshiMarketTicker: candidate.kalshiMarketTicker,
    kalshiEventTicker: candidate.kalshiEventTicker,
    oddsEventId: candidate.oddsEvent.oddsEventId ?? candidate.oddsEvent.eventTicker,
    oddsMarketKey: candidate.oddsMarketKey,
    eventMatch,
    kalshiMarketType: kalshiType,
    oddsMarketType: oddsType,
    marketTypeLevel: combinedLevel,
    settlement,
    strategyScope: scopeVerdict,
    liveContext: liveCheck,
    decision,
  };
}

export function resolveOpportunityDecision(input: {
  eventConfidence: MatchConfidence;
  eventAmbiguous: boolean;
  eventBlockCode: string | null;
  marketLevel: import("@/lib/core/types").MarketTypeLevel;
  settlement: import("@/lib/core/types").SettlementVerification;
  scopeInScope: boolean;
  scopeBlockCode: string | null;
  liveAllowed: boolean;
  liveBlockCode: string | null;
  settlementExact: boolean;
}): OpportunityDecision {
  const reasons: string[] = [];
  let state: OpportunityDecisionState = "UNCONFIRMED";
  let blockCode: string | null = null;

  if (input.eventAmbiguous || input.eventBlockCode === MATCH_BLOCK_CODES.EVENT_MATCH_AMBIGUOUS) {
    return {
      state: "BLOCKED",
      blockCode: MATCH_BLOCK_CODES.EVENT_MATCH_AMBIGUOUS,
      reason: "ambiguous event match — multiple candidates or weak alignment",
      bettable: false,
    };
  }

  if (!input.scopeInScope) {
    return {
      state: "BLOCKED",
      blockCode: input.scopeBlockCode ?? MATCH_BLOCK_CODES.STRATEGY_SCOPE_EXCLUDED,
      reason: "market outside Edgewise strategy scope",
      bettable: false,
    };
  }

  if (input.marketLevel === "LEVEL_4_BLOCKED") {
    return {
      state: "BLOCKED",
      blockCode: MATCH_BLOCK_CODES.MARKET_TYPE_BLOCKED,
      reason: "market type level 4 — blocked category",
      bettable: false,
    };
  }

  if (!input.liveAllowed) {
    return {
      state: "BLOCKED",
      blockCode: input.liveBlockCode ?? MATCH_BLOCK_CODES.LIVE_ORDERBOOK_NOT_GREEN,
      reason: "live matching rules failed",
      bettable: false,
    };
  }

  if (input.eventConfidence === "LOW") {
    return {
      state: "BLOCKED",
      blockCode: input.eventBlockCode ?? MATCH_BLOCK_CODES.MATCH_CONFIDENCE_LOW,
      reason: "event match confidence LOW",
      bettable: false,
    };
  }

  if (!settlementAllowsBettability(input.settlement)) {
    if (input.settlement.blocked) {
      return {
        state: "BLOCKED",
        blockCode: input.settlement.blockCode,
        reason: input.settlement.reason,
        bettable: false,
      };
    }
    reasons.push(input.settlement.reason);
  }

  if (input.eventConfidence === "MEDIUM") {
    return {
      state: "WATCH",
      blockCode: null,
      reason: reasons.length ? reasons.join("; ") : "event match confidence MEDIUM — watch only",
      bettable: false,
    };
  }

  const levelCap = maxDecisionForMarketLevel(input.marketLevel, input.settlementExact);
  let reason = "";

  if (levelCap === "BLOCKED") {
    state = "BLOCKED";
    blockCode = MATCH_BLOCK_CODES.MARKET_TYPE_BLOCKED;
    reason = "market type blocked";
  } else if (levelCap === "WATCH") {
    state = "WATCH";
    reason = "level 2/3 market — settlement or model verification required before BETTABLE";
  } else if (levelCap === "UNCONFIRMED") {
    state = "UNCONFIRMED";
    reason = "settlement or contract verification incomplete";
  } else if (
    input.eventConfidence === "HIGH" &&
    input.settlementExact &&
    levelCap === "BETTABLE"
  ) {
    state = "BETTABLE";
    reason =
      "HIGH event match, exact settlement, level 1 comparable — eligible for per-trade validation";
  } else {
    state = "UNCONFIRMED";
    reason = "insufficient evidence for BETTABLE";
  }

  const finalReason = reasons.length ? `${reason}; ${reasons.join("; ")}` : reason;

  return {
    state,
    blockCode,
    reason: finalReason,
    bettable: state === "BETTABLE",
  };
}

export function rankEventCandidates(
  kalshi: EventMatchCandidate,
  oddsCandidates: EventMatchCandidate[]
): EventMatchResult[] {
  return oddsCandidates
    .map((odds) => {
      const result = matchEvents(kalshi, odds);
      return result;
    })
    .sort((a, b) => confidenceRank(b.confidence) - confidenceRank(a.confidence));
}

function confidenceRank(c: MatchConfidence): number {
  switch (c) {
    case "HIGH":
      return 3;
    case "MEDIUM":
      return 2;
    case "LOW":
      return 1;
    default:
      return 0;
  }
}
