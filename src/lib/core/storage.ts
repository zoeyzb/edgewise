/**
 * Core storage types and file identifiers — no secrets, no browser persistence.
 */

export const STORAGE_FILES = {
  appState: "app-state.json",
  riskState: "risk-state.json",
  autoState: "auto-state.json",
  tracking: "tracking-state.json",
  executionLog: "execution-log.json",
  systemLog: "system-log.json",
} as const;

export type TradeSource = "MANUAL" | "AUTO" | "PAPER" | "SHADOW" | "BLOCKED";
export type TradeMode = "LIVE" | "PAPER" | "SHADOW" | "WATCH";
export type TradeLifecycle = "OPEN" | "CLOSED" | "SIMULATED" | "BLOCKED" | "MISSED";

export interface TrackedTradeRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  source: TradeSource;
  mode: TradeMode;
  lifecycle: TradeLifecycle;
  opportunityId: string | null;
  marketTicker: string;
  game: string;
  league: string;
  side: "YES" | "NO";
  detectedEv: number | null;
  executableEv: number | null;
  expectedDollarValue: number | null;
  userRequestedStake: number;
  aiRecommendedStake: number;
  finalAllowedStake: number;
  placedPrice: number | null;
  fillPrice: number | null;
  currentPrice: number | null;
  closingPrice: number | null;
  realizedPnl: number | null;
  unrealizedPnl: number | null;
  closingPriceValue: number | null;
  edgeWasReal: boolean | null;
  beatLaterMarket: boolean | null;
  blockedCorrectly: boolean | null;
  botMissedProfit: boolean | null;
  manualDelayHurt: boolean | null;
  autoWouldHaveCaptured: boolean | null;
  contracts: number | null;
  clientOrderId: string | null;
  blockReason: string | null;
  dataLabel: "REAL_PROVIDER_DATA" | "PAPER_SIMULATION" | "SHADOW_SIMULATION" | "BLOCKED_RECORD";
}

export interface MissedOpportunityRecord {
  id: string;
  at: string;
  opportunityId: string;
  marketTicker: string;
  reason: string;
  expectedDollarValue: number | null;
  autoWouldHaveCaptured: boolean;
  manualDelayHurt: boolean;
  blockedCorrectly: boolean;
}

export interface EdgeReplayRecord {
  id: string;
  at: string;
  opportunityId: string;
  marketTicker: string;
  detectedEv: number | null;
  executableEv: number | null;
  outcome: "REAL_EDGE" | "FALSE_EDGE" | "UNKNOWN" | "BLOCKED_CORRECTLY";
  notes: string;
}

export interface TrackingStateSnapshot {
  trades: TrackedTradeRecord[];
  missed: MissedOpportunityRecord[];
  edgeReplays: EdgeReplayRecord[];
  lastUpdatedAt: string | null;
}

export const EMPTY_TRACKING_STATE: TrackingStateSnapshot = {
  trades: [],
  missed: [],
  edgeReplays: [],
  lastUpdatedAt: null,
};
