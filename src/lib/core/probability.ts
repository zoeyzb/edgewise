/**
 * No-vig fair probability from sportsbook odds.
 * Never use raw implied probability as fair value.
 */

export const NO_VIG_UNAVAILABLE = "UNCONFIRMED — NO_VIG_FAIR_VALUE_UNAVAILABLE" as const;

export interface BookOutcomeOdds {
  name: string;
  americanOdds: number;
}

export interface BookTwoWayMarket {
  bookmakerKey: string;
  outcomes: BookOutcomeOdds[];
  lastUpdateIso?: string;
}

export interface NoVigResult {
  available: boolean;
  fairProbability: number | null;
  bookmakerCount: number;
  disagreement: number;
  confidencePenalty: number;
  reason: string;
  perBookFair?: number[];
}

export function americanToImpliedProbability(american: number): number | null {
  if (!Number.isFinite(american) || american === 0) return null;
  if (american > 0) {
    return 100 / (american + 100);
  }
  return Math.abs(american) / (Math.abs(american) + 100);
}

export function removeVigTwoWay(impliedA: number, impliedB: number): { fairA: number; fairB: number } | null {
  if (!Number.isFinite(impliedA) || !Number.isFinite(impliedB)) return null;
  const total = impliedA + impliedB;
  if (total <= 0 || total <= 1) return null;
  return { fairA: impliedA / total, fairB: impliedB / total };
}

function parseAmerican(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function extractH2hBooks(
  bookmakers: unknown[],
  targetTeamName: string,
  opponentName: string
): BookTwoWayMarket[] {
  const books: BookTwoWayMarket[] = [];
  const targetNorm = targetTeamName.trim().toLowerCase();
  const oppNorm = opponentName.trim().toLowerCase();

  for (const bm of bookmakers) {
    if (typeof bm !== "object" || bm === null) continue;
    const rec = bm as Record<string, unknown>;
    const key = typeof rec.key === "string" ? rec.key : "unknown";
    const markets = Array.isArray(rec.markets) ? rec.markets : [];
    const h2h = markets.find(
      (m) =>
        typeof m === "object" &&
        m !== null &&
        (m as Record<string, unknown>).key === "h2h"
    ) as Record<string, unknown> | undefined;
    if (!h2h) continue;
    const outcomes = Array.isArray(h2h.outcomes) ? h2h.outcomes : [];
    const parsed: BookOutcomeOdds[] = [];
    for (const o of outcomes) {
      if (typeof o !== "object" || o === null) continue;
      const or = o as Record<string, unknown>;
      const name = typeof or.name === "string" ? or.name : "";
      const american = parseAmerican(or.price);
      if (american === null || !name) continue;
      parsed.push({ name, americanOdds: american });
    }
    if (parsed.length < 2) continue;
    const hasTarget = parsed.some((p) => p.name.toLowerCase().includes(targetNorm) || targetNorm.includes(p.name.toLowerCase()));
    const hasOpp = parsed.some((p) => p.name.toLowerCase().includes(oppNorm) || oppNorm.includes(p.name.toLowerCase()));
    if (!hasTarget || !hasOpp) continue;
    books.push({
      bookmakerKey: key,
      outcomes: parsed,
      lastUpdateIso: typeof rec.last_update === "string" ? rec.last_update : undefined,
    });
  }
  return books;
}

export function computeNoVigFairProbability(input: {
  books: BookTwoWayMarket[];
  targetTeamName: string;
  opponentName: string;
}): NoVigResult {
  if (input.books.length === 0) {
    return {
      available: false,
      fairProbability: null,
      bookmakerCount: 0,
      disagreement: 1,
      confidencePenalty: 1,
      reason: NO_VIG_UNAVAILABLE,
    };
  }

  const targetNorm = input.targetTeamName.trim().toLowerCase();
  const fairByBook: number[] = [];

  for (const book of input.books) {
    let targetImplied: number | null = null;
    let oppImplied: number | null = null;
    for (const o of book.outcomes) {
      const implied = americanToImpliedProbability(o.americanOdds);
      if (implied === null) continue;
      const nameNorm = o.name.toLowerCase();
      if (nameNorm.includes(targetNorm) || targetNorm.includes(nameNorm)) {
        targetImplied = implied;
      } else {
        oppImplied = implied;
      }
    }
    if (targetImplied === null || oppImplied === null) continue;
    const nv = removeVigTwoWay(targetImplied, oppImplied);
    if (nv) fairByBook.push(nv.fairA);
  }

  if (fairByBook.length === 0) {
    return {
      available: false,
      fairProbability: null,
      bookmakerCount: input.books.length,
      disagreement: 1,
      confidencePenalty: 1,
      reason: NO_VIG_UNAVAILABLE,
    };
  }

  fairByBook.sort((a, b) => a - b);
  const median = fairByBook[Math.floor(fairByBook.length / 2)] ?? fairByBook[0];
  const min = fairByBook[0] ?? median;
  const max = fairByBook[fairByBook.length - 1] ?? median;
  const disagreement = max - min;

  let confidencePenalty = 0;
  if (fairByBook.length === 1) confidencePenalty += 0.15;
  if (disagreement > 0.03) confidencePenalty += Math.min(0.25, disagreement * 2);
  if (disagreement > 0.06) confidencePenalty += 0.1;

  const conservativeFair = Math.min(median, median - disagreement * 0.25);

  return {
    available: true,
    fairProbability: conservativeFair,
    bookmakerCount: fairByBook.length,
    disagreement,
    confidencePenalty,
    reason: "no-vig fair probability computed conservatively across books",
    perBookFair: fairByBook,
  };
}
