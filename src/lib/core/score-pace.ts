/**
 * Score pace projection for totals markets.
 */

export const TOTALS_MODEL_MISSING = "UNCONFIRMED — NEEDS_SPORT_SPECIFIC_TOTALS_MODEL" as const;
export const TOTALS_SCOPE_MISMATCH = "BLOCKED — TOTALS_SCOPE_MISMATCH_OR_UNCONFIRMED" as const;

export interface ScorePaceInput {
  homeScore: number;
  awayScore: number;
  period: string | null;
  clockRemainingSeconds: number | null;
  totalPeriods: number;
  periodLengthSeconds: number;
  sportKey: string;
}

export interface ScorePaceResult {
  currentTotal: number;
  currentPacePerMinute: number | null;
  projectedTotal: number | null;
  acceleration: number;
  modelStatus: "READY" | "UNCONFIRMED";
  reason: string;
}

const PACE_READY_SPORTS = new Set([
  "basketball_nba",
  "basketball_ncaab",
  "basketball_wnba",
  "americanfootball_nfl",
  "icehockey_nhl",
]);

export function computeScorePace(input: ScorePaceInput): ScorePaceResult {
  const currentTotal = input.homeScore + input.awayScore;

  if (!PACE_READY_SPORTS.has(input.sportKey)) {
    return {
      currentTotal,
      currentPacePerMinute: null,
      projectedTotal: null,
      acceleration: 0,
      modelStatus: "UNCONFIRMED",
      reason: TOTALS_MODEL_MISSING,
    };
  }

  if (input.clockRemainingSeconds == null || input.period == null) {
    return {
      currentTotal,
      currentPacePerMinute: null,
      projectedTotal: null,
      acceleration: 0,
      modelStatus: "UNCONFIRMED",
      reason: "clock/period unknown for pace model",
    };
  }

  const totalGameSeconds = input.totalPeriods * input.periodLengthSeconds;
  const elapsed = Math.max(1, totalGameSeconds - input.clockRemainingSeconds);
  const pacePerSecond = currentTotal / elapsed;
  const pacePerMinute = pacePerSecond * 60;
  const projectedTotal = pacePerSecond * totalGameSeconds;

  return {
    currentTotal,
    currentPacePerMinute: pacePerMinute,
    projectedTotal,
    acceleration: 0,
    modelStatus: "READY",
    reason: "linear pace projection — conservative sport-specific model",
  };
}
