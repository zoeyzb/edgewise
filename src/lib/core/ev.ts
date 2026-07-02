/**
 * Gross/net edge, expected dollar value, edge classification.
 */

import { feeAsEdgeFraction } from "@/lib/core/fees";
import type { EdgeTier, ExpectedValueBucket } from "@/lib/core/types";

export const MIN_NET_EDGE = 0.04;
export const BLOCK_BELOW_MIN = "BLOCKED — EDGE_BELOW_MINIMUM" as const;

export interface EdgeCostInput {
  grossEdge: number;
  spreadFraction: number;
  slippageFraction: number;
  staleDataBuffer: number;
  partialFillPenalty: number;
  stakeDollars: number;
  executableAsk: number;
  fairProbability: number;
  confidencePenalty: number;
}

export interface EdgeBreakdown {
  grossEdge: number;
  fees: number;
  feeRounding: number;
  spread: number;
  slippage: number;
  staleDataBuffer: number;
  partialFillRisk: number;
  confidencePenalty: number;
  netEdge: number;
  edgeTier: EdgeTier;
  belowMinimum: boolean;
  blockCode: string | null;
}

export function classifyEdgeTier(netEdge: number): EdgeTier {
  if (netEdge < MIN_NET_EDGE) return "BLOCKED_BELOW_MIN";
  if (netEdge < 0.07) return "NORMAL_EDGE";
  if (netEdge < 0.15) return "STRONG_EDGE";
  if (netEdge < 0.3) return "RARE_EDGE";
  if (netEdge < 0.6) return "HIGH_MARGIN_EDGE";
  return "EXTREME_MARGIN_EDGE";
}

export function computeEdgeBreakdown(input: EdgeCostInput): EdgeBreakdown {
  const fees = feeAsEdgeFraction({
    stakeDollars: input.stakeDollars,
    executableAsk: input.executableAsk,
    fairProbability: input.fairProbability,
  });

  const netEdge =
    input.grossEdge -
    fees -
    input.spreadFraction -
    input.slippageFraction -
    input.staleDataBuffer -
    input.partialFillPenalty -
    input.confidencePenalty;

  const edgeTier = classifyEdgeTier(netEdge);
  const belowMinimum = netEdge < MIN_NET_EDGE;

  return {
    grossEdge: input.grossEdge,
    fees,
    feeRounding: 0,
    spread: input.spreadFraction,
    slippage: input.slippageFraction,
    staleDataBuffer: input.staleDataBuffer,
    partialFillRisk: input.partialFillPenalty,
    confidencePenalty: input.confidencePenalty,
    netEdge,
    edgeTier,
    belowMinimum,
    blockCode: belowMinimum ? BLOCK_BELOW_MIN : null,
  };
}

export function computeExpectedDollarValue(input: {
  netEdge: number;
  fillableNotional: number;
  executionConfidence: number;
  edgeSurvivalConfidence: number;
}): number {
  const base = input.netEdge * input.fillableNotional;
  return base * input.executionConfidence * input.edgeSurvivalConfidence;
}

export function classifyExpectedValueBucket(expectedDollars: number): ExpectedValueBucket {
  if (expectedDollars >= 50) return "HIGH_VALUE_EDGE";
  if (expectedDollars >= 15) return "STRONG_TARGET_EDGE";
  if (expectedDollars >= 5) return "TARGET_EDGE";
  if (expectedDollars >= 1) return "SMALL_EDGE";
  if (expectedDollars >= 0.25) return "MICRO_EDGE";
  return "BELOW_MICRO";
}

export function grossEdgeFromFairAndAsk(fairProbability: number, executableAsk: number): number {
  if (!Number.isFinite(fairProbability) || !Number.isFinite(executableAsk)) return 0;
  return fairProbability - executableAsk;
}
