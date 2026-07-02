/**
 * Liquidity, fill probability, partial-fill risk.
 */

import type { OrderbookMetrics } from "@/lib/core/orderbook";

export interface LiquidityAssessment {
  fillableNotional: number;
  liquidityScore: number;
  fillProbability: number;
  partialFillRisk: number;
  label: string;
}

const LOW_NOTIONAL_THRESHOLD = 25;
const TARGET_NOTIONAL = 500;

export function assessLiquidity(input: {
  orderbook: OrderbookMetrics;
  side: "YES" | "NO";
  requestedStake?: number;
}): LiquidityAssessment {
  const notional =
    input.side === "YES"
      ? input.orderbook.fillableNotionalYes
      : input.orderbook.fillableNotionalNo;

  const fillableNotional = notional ?? 0;

  let liquidityScore = 0;
  if (fillableNotional >= TARGET_NOTIONAL) liquidityScore = 100;
  else if (fillableNotional >= 100) liquidityScore = 75;
  else if (fillableNotional >= LOW_NOTIONAL_THRESHOLD) liquidityScore = 50;
  else if (fillableNotional > 0) liquidityScore = 25;

  if (input.orderbook.freshnessState === "STALE") liquidityScore = Math.min(liquidityScore, 20);
  if (input.orderbook.freshnessState === "UNKNOWN") liquidityScore = Math.min(liquidityScore, 40);

  const stake = input.requestedStake ?? 50;
  const fillRatio = fillableNotional > 0 ? Math.min(1, fillableNotional / stake) : 0;
  const fillProbability = Math.max(0, Math.min(1, fillRatio * (liquidityScore / 100)));

  const partialFillRisk =
    fillableNotional <= 0
      ? 1
      : fillableNotional < stake
        ? Math.min(1, 1 - fillRatio)
        : 0.05;

  const label =
    fillableNotional >= TARGET_NOTIONAL
      ? "HIGH"
      : fillableNotional >= 100
        ? "MEDIUM"
        : fillableNotional >= LOW_NOTIONAL_THRESHOLD
          ? "LOW"
          : "VERY_LOW";

  return {
    fillableNotional,
    liquidityScore,
    fillProbability,
    partialFillRisk,
    label,
  };
}
