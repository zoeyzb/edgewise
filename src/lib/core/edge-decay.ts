/**
 * Edge survival / decay confidence.
 */

export interface EdgeDecayInput {
  orderbookFresh: boolean;
  oddsFresh: boolean;
  spreadFraction: number;
  netEdge: number;
  bookmakerCount: number;
  disagreement: number;
  isLive: boolean;
}

export interface EdgeSurvivalResult {
  confidence: number;
  survives5s: boolean;
  survives15s: boolean;
  survives30s: boolean;
  reason: string;
}

export function computeEdgeSurvival(input: EdgeDecayInput): EdgeSurvivalResult {
  let confidence = 0.85;

  if (!input.orderbookFresh) confidence -= 0.25;
  if (!input.oddsFresh) confidence -= 0.2;
  if (input.spreadFraction > 0.02) confidence -= 0.1;
  if (input.netEdge > 0.3) confidence -= 0.15;
  if (input.netEdge > 0.6) confidence -= 0.2;
  if (input.bookmakerCount < 2) confidence -= 0.1;
  if (input.disagreement > 0.04) confidence -= 0.1;
  if (input.isLive) confidence -= 0.1;

  confidence = Math.max(0.05, Math.min(0.99, confidence));

  return {
    confidence,
    survives5s: confidence >= 0.7 && input.orderbookFresh && input.oddsFresh,
    survives15s: confidence >= 0.55,
    survives30s: confidence >= 0.4,
    reason: "edge survival estimated from freshness, spread, and book agreement",
  };
}
