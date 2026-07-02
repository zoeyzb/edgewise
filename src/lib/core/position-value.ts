/**
 * Open position value — unrealized P&L, closing price value, edge remaining.
 */

import type { TrackedTradeRecord } from "@/lib/core/storage";

export interface PositionValueInput {
  trade: TrackedTradeRecord;
  currentExecutableExitPrice: number | null;
  currentFairProbability: number | null;
  originalFairProbability: number | null;
  spreadCost: number;
  liquidityToExit: number;
  timeToSettlementHours: number | null;
  orderbookFresh: boolean;
  originalReasonStillValid: boolean;
}

export interface PositionValueResult {
  entryPrice: number | null;
  currentExitPrice: number | null;
  currentEdgeRemaining: number | null;
  unrealizedPnl: number | null;
  realizedPnlIfExited: number | null;
  spreadCost: number;
  liquidityToExit: number;
  closingPriceValue: number | null;
  holdingStillPositiveEv: boolean;
  marketMovement: "FAVORABLE" | "UNFAVORABLE" | "FLAT" | "UNKNOWN";
}

export function calculatePositionValue(input: PositionValueInput): PositionValueResult {
  const entry = input.trade.fillPrice ?? input.trade.placedPrice;
  const exit = input.currentExecutableExitPrice;
  const stake = input.trade.finalAllowedStake;
  const contracts = input.trade.contracts;

  let unrealizedPnl: number | null = null;
  let realizedPnlIfExited: number | null = null;
  let closingPriceValue: number | null = null;
  let currentEdgeRemaining: number | null = null;

  if (entry != null && exit != null && contracts != null && contracts > 0) {
    const priceDiff =
      input.trade.side === "YES" ? exit - entry : entry - exit;
    unrealizedPnl = Math.round((priceDiff * contracts - input.spreadCost) * 100) / 100;
    realizedPnlIfExited = unrealizedPnl;
    closingPriceValue = Math.round((exit * contracts - stake) * 100) / 100;
  } else if (entry != null && input.currentFairProbability != null) {
    const fairEdge =
      input.trade.side === "YES"
        ? input.currentFairProbability - entry
        : 1 - input.currentFairProbability - entry;
    currentEdgeRemaining = Math.round(fairEdge * 10000) / 10000;
    closingPriceValue =
      stake > 0 && currentEdgeRemaining != null
        ? Math.round(stake * currentEdgeRemaining * 100) / 100
        : null;
  }

  let marketMovement: PositionValueResult["marketMovement"] = "UNKNOWN";
  if (entry != null && exit != null) {
    const delta = exit - entry;
    if (Math.abs(delta) < 0.005) marketMovement = "FLAT";
    else if (input.trade.side === "YES") marketMovement = delta > 0 ? "FAVORABLE" : "UNFAVORABLE";
    else marketMovement = delta < 0 ? "FAVORABLE" : "UNFAVORABLE";
  }

  const holdingStillPositiveEv =
    (currentEdgeRemaining != null && currentEdgeRemaining > 0.02) ||
    (unrealizedPnl != null && unrealizedPnl > 0 && input.originalReasonStillValid);

  return {
    entryPrice: entry,
    currentExitPrice: exit,
    currentEdgeRemaining,
    unrealizedPnl,
    realizedPnlIfExited,
    spreadCost: input.spreadCost,
    liquidityToExit: input.liquidityToExit,
    closingPriceValue,
    holdingStillPositiveEv,
    marketMovement,
  };
}

export function mergeLiveAndHistorical(
  live: TrackedTradeRecord[],
  historical: TrackedTradeRecord[]
): TrackedTradeRecord[] {
  const byId = new Map<string, TrackedTradeRecord>();
  for (const t of historical) byId.set(t.id, t);
  for (const t of live) byId.set(t.id, t);
  return [...byId.values()].sort(
    (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)
  );
}
