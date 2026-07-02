/**
 * Edge Quality Score (0–100).
 */

import type { MatchConfidence } from "@/lib/core/types";

export interface EdgeQualityInput {
  matchConfidence: MatchConfidence;
  settlementExact: boolean;
  oddsFresh: boolean;
  orderbookFresh: boolean;
  scoreFresh: boolean;
  bookmakerCount: number;
  disagreement: number;
  liquidityScore: number;
  spreadFraction: number;
  slippageFraction: number;
  netEdge: number;
  edgeSurvivalConfidence: number;
}

export function computeEdgeQualityScore(input: EdgeQualityInput): number {
  let score = 0;

  score += input.matchConfidence === "HIGH" ? 18 : input.matchConfidence === "MEDIUM" ? 10 : 0;
  score += input.settlementExact ? 15 : 0;
  score += input.oddsFresh ? 10 : 0;
  score += input.orderbookFresh ? 12 : 0;
  score += input.scoreFresh ? 5 : 3;
  score += Math.min(10, input.bookmakerCount * 2);
  score += input.disagreement < 0.02 ? 8 : input.disagreement < 0.04 ? 4 : 0;
  score += Math.min(12, input.liquidityScore * 0.12);
  score += input.spreadFraction < 0.015 ? 5 : input.spreadFraction < 0.03 ? 2 : 0;
  score += input.netEdge >= 0.04 ? Math.min(10, input.netEdge * 30) : 0;
  score += input.edgeSurvivalConfidence * 10;
  score -= input.slippageFraction * 100;

  return Math.round(Math.max(0, Math.min(100, score)));
}
