/**
 * High-margin verification for 30%+ apparent edges.
 */

import type { HighMarginStatus } from "@/lib/core/types";

export interface HighMarginVerificationInput {
  netEdge: number;
  grossEdge: number;
  matchConfidenceHigh: boolean;
  settlementExact: boolean;
  orderbookFresh: boolean;
  oddsFresh: boolean;
  executableAskKnown: boolean;
  fillableNotional: number;
  marketActive: boolean;
  survives5s: boolean;
  survives15s: boolean;
  survives30s: boolean;
  bookmakerCount: number;
  expectedDollarValue: number;
  isLive: boolean;
  scoreFresh?: boolean;
  clockKnown?: boolean;
}

export function verifyHighMarginEdge(input: HighMarginVerificationInput): {
  status: HighMarginStatus;
  reason: string;
  bettable: boolean;
} {
  if (input.netEdge < 0.3 && input.grossEdge < 0.3) {
    return {
      status: "NOT_APPLICABLE",
      reason: "edge below high-margin threshold",
      bettable: false,
    };
  }

  const failures: string[] = [];

  if (!input.matchConfidenceHigh) failures.push("match confidence not HIGH");
  if (!input.settlementExact) failures.push("settlement not exact");
  if (!input.orderbookFresh) failures.push("orderbook not fresh");
  if (!input.oddsFresh) failures.push("odds not fresh");
  if (!input.executableAskKnown) failures.push("executable ask unknown");
  if (input.fillableNotional < 25) failures.push("insufficient fillable liquidity");
  if (!input.marketActive) failures.push("market not active/orderable");
  if (!input.survives5s || !input.survives15s) failures.push("edge does not survive 5–15s decay check");
  if (input.bookmakerCount < 2 && input.netEdge >= 0.6) failures.push("single-book extreme edge");
  if (input.expectedDollarValue < 1) failures.push("expected dollar value too small for high-margin");
  if (input.isLive && !input.scoreFresh) failures.push("live score feed not fresh");
  if (input.isLive && input.clockKnown === false) failures.push("live clock unknown");

  if (failures.length > 0) {
    if (input.netEdge >= 0.3 && input.netEdge < 0.6) {
      return {
        status: "HIGH_MARGIN_VERIFICATION_REQUIRED",
        reason: failures.join("; "),
        bettable: false,
      };
    }
    return {
      status: "BLOCKED — HIGH_MARGIN_EDGE_FAILED_VERIFICATION",
      reason: failures.join("; "),
      bettable: false,
    };
  }

  if (!input.survives30s) {
    return {
      status: "UNCONFIRMED — HIGH_MARGIN_EDGE_NEEDS_VERIFICATION",
      reason: "edge may not survive 30s — extra verification required",
      bettable: false,
    };
  }

  if (input.netEdge >= 0.3 && input.expectedDollarValue >= 5) {
    return {
      status: "URGENT_BETTABLE_HIGH_MARGIN",
      reason: "high-margin checks passed — still requires per-trade server validation",
      bettable: true,
    };
  }

  return {
    status: "UNCONFIRMED — HIGH_MARGIN_EDGE_NEEDS_VERIFICATION",
    reason: "high edge present but dollar value or survival checks incomplete",
    bettable: false,
  };
}
