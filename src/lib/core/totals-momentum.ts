/**
 * Totals momentum watchlist engine.
 */

import { TOTALS_SCOPE_MISMATCH } from "@/lib/core/score-pace";
import type { TotalsWatchEntry } from "@/lib/core/types";
import { computeScorePace } from "@/lib/core/score-pace";

export interface TotalsMomentumInput {
  id: string;
  sportKey: string;
  league: string;
  game: string;
  kalshiMarketTicker: string;
  kalshiTotalLine: number | null;
  sportsbookLiveTotal: number | null;
  sportsbookPregameTotal: number | null;
  settlementExact: boolean;
  scopePeriod: string;
  overtimeRule: string;
  homeScore: number | null;
  awayScore: number | null;
  period: string | null;
  clockRemainingSeconds: number | null;
  scoreFresh: boolean;
  clockFresh: boolean;
}

export function buildTotalsWatchEntry(input: TotalsMomentumInput): TotalsWatchEntry {
  if (!input.settlementExact) {
    return {
      id: input.id,
      sportKey: input.sportKey,
      league: input.league,
      game: input.game,
      kalshiMarketTicker: input.kalshiMarketTicker,
      state: "BLOCKED",
      reason: TOTALS_SCOPE_MISMATCH,
      currentScore: input.homeScore != null && input.awayScore != null ? input.homeScore + input.awayScore : null,
      projectedTotal: null,
      paceStatus: "BLOCKED",
      scoreFresh: input.scoreFresh,
      clockFresh: input.clockFresh,
    };
  }

  if (input.homeScore == null || input.awayScore == null) {
    return {
      id: input.id,
      sportKey: input.sportKey,
      league: input.league,
      game: input.game,
      kalshiMarketTicker: input.kalshiMarketTicker,
      state: "UNCONFIRMED",
      reason: "score unavailable for totals momentum",
      currentScore: null,
      projectedTotal: null,
      paceStatus: "UNCONFIRMED",
      scoreFresh: input.scoreFresh,
      clockFresh: input.clockFresh,
    };
  }

  const pace = computeScorePace({
    homeScore: input.homeScore,
    awayScore: input.awayScore,
    period: input.period,
    clockRemainingSeconds: input.clockRemainingSeconds,
    totalPeriods: input.sportKey.includes("basketball") ? 4 : input.sportKey.includes("hockey") ? 3 : 4,
    periodLengthSeconds: input.sportKey.includes("basketball") ? 720 : input.sportKey.includes("hockey") ? 1200 : 900,
    sportKey: input.sportKey,
  });

  if (pace.modelStatus === "UNCONFIRMED") {
    return {
      id: input.id,
      sportKey: input.sportKey,
      league: input.league,
      game: input.game,
      kalshiMarketTicker: input.kalshiMarketTicker,
      state: "UNCONFIRMED",
      reason: pace.reason,
      currentScore: pace.currentTotal,
      projectedTotal: pace.projectedTotal,
      paceStatus: "UNCONFIRMED",
      scoreFresh: input.scoreFresh,
      clockFresh: input.clockFresh,
    };
  }

  const acceleration =
    input.sportsbookLiveTotal != null && input.sportsbookPregameTotal != null
      ? input.sportsbookLiveTotal - input.sportsbookPregameTotal
      : 0;

  return {
    id: input.id,
    sportKey: input.sportKey,
    league: input.league,
    game: input.game,
    kalshiMarketTicker: input.kalshiMarketTicker,
    state: "WATCH",
    reason: `totals momentum watch — projected ${pace.projectedTotal?.toFixed(1) ?? "—"} vs line ${input.kalshiTotalLine ?? "—"}; accel ${acceleration.toFixed(1)}`,
    currentScore: pace.currentTotal,
    projectedTotal: pace.projectedTotal,
    paceStatus: "WATCH",
    scoreFresh: input.scoreFresh,
    clockFresh: input.clockFresh,
    kalshiTotalLine: input.kalshiTotalLine,
    sportsbookLiveTotal: input.sportsbookLiveTotal,
    acceleration,
  };
}
