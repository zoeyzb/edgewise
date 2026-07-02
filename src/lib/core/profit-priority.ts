/**
 * Profit Priority Score (0–100) — money-first ranking.
 */

import type { ExpectedValueBucket } from "@/lib/core/types";

export interface ProfitPriorityInput {
  expectedDollarProfit: number;
  expectedProfitPerMinute: number;
  netEdge: number;
  urgency: number;
  liquidityScore: number;
  fillProbability: number;
  riskAdjustedReturn: number;
  valueBucket: ExpectedValueBucket;
}

const BUCKET_WEIGHT: Record<ExpectedValueBucket, number> = {
  HIGH_VALUE_EDGE: 25,
  STRONG_TARGET_EDGE: 20,
  TARGET_EDGE: 15,
  SMALL_EDGE: 8,
  MICRO_EDGE: 3,
  BELOW_MICRO: 0,
};

export function computeProfitPriorityScore(input: ProfitPriorityInput): number {
  let score = BUCKET_WEIGHT[input.valueBucket];
  score += Math.min(25, input.expectedDollarProfit * 0.4);
  score += Math.min(15, input.expectedProfitPerMinute * 2);
  score += Math.min(15, input.netEdge * 40);
  score += input.urgency * 10;
  score += input.liquidityScore * 0.08;
  score += input.fillProbability * 10;
  score += input.riskAdjustedReturn * 15;

  return Math.round(Math.max(0, Math.min(100, score)));
}

export function rankOpportunities<T extends { profitPriorityScore: number; expectedDollarProfit: number }>(
  items: T[]
): T[] {
  return [...items].sort((a, b) => {
    if (b.profitPriorityScore !== a.profitPriorityScore) {
      return b.profitPriorityScore - a.profitPriorityScore;
    }
    return b.expectedDollarProfit - a.expectedDollarProfit;
  });
}
