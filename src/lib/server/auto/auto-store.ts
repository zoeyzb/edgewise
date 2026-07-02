import "server-only";

import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import type { AutoDecisionLog } from "@/lib/core/auto-trade";
import type { AutoLevel, ScoredOpportunity, StakeDecision } from "@/lib/core/types";

const DATA_DIR = path.join(process.cwd(), "data");
const AUTO_STATE_FILE = path.join(DATA_DIR, "auto-state.json");

export interface StoredAutoState {
  paused: boolean;
  emergencyStop: boolean;
  lastScanAt: string | null;
  scanning: boolean;
  tradeStatus: string;
  latestCandidate: ScoredOpportunity | null;
  latestValidation: {
    status: string;
    failedGate: string | null;
    blockedReason: string | null;
    stakeDecision: StakeDecision | null;
  } | null;
  lastSubmitted: AutoDecisionLog | null;
  lastBlocked: AutoDecisionLog | null;
  autoTradesToday: number;
  openAutoTrades: number;
  consecutiveAutoLosses: number;
  rejectedOrdersRecent: number;
  orderbookStaleCount: number;
  oddsStaleCount: number;
  settlementDropCount: number;
  falseEdgeCount: number;
  totalAutoDecisions: number;
  shadowMissedCount: number;
  shadowCapturedCount: number;
  logs: AutoDecisionLog[];
}

const DEFAULT_AUTO_STATE: StoredAutoState = {
  paused: false,
  emergencyStop: false,
  lastScanAt: null,
  scanning: false,
  tradeStatus: "AUTO_WAITING_FOR_VALID_TRADE",
  latestCandidate: null,
  latestValidation: null,
  lastSubmitted: null,
  lastBlocked: null,
  autoTradesToday: 0,
  openAutoTrades: 0,
  consecutiveAutoLosses: 0,
  rejectedOrdersRecent: 0,
  orderbookStaleCount: 0,
  oddsStaleCount: 0,
  settlementDropCount: 0,
  falseEdgeCount: 0,
  totalAutoDecisions: 0,
  shadowMissedCount: 0,
  shadowCapturedCount: 0,
  logs: [],
};

async function ensureDataDir() {
  await mkdir(DATA_DIR, { recursive: true });
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  await ensureDataDir();
  try {
    const raw = await readFile(file, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJson<T>(file: string, data: T) {
  await ensureDataDir();
  await writeFile(file, JSON.stringify(data, null, 2), "utf8");
}

export async function getAutoState(): Promise<StoredAutoState> {
  return readJson(AUTO_STATE_FILE, DEFAULT_AUTO_STATE);
}

export async function updateAutoState(
  patch: Partial<StoredAutoState>
): Promise<StoredAutoState> {
  const current = await getAutoState();
  const next = { ...current, ...patch };
  if (patch.logs) {
    next.logs = patch.logs;
  }
  await writeJson(AUTO_STATE_FILE, next);
  return next;
}

export async function appendAutoLog(entry: AutoDecisionLog): Promise<StoredAutoState> {
  const state = await getAutoState();
  const logs = [entry, ...state.logs].slice(0, 100);
  return updateAutoState({ logs, totalAutoDecisions: state.totalAutoDecisions + 1 });
}

export async function recordAutoSubmitted(input: {
  log: AutoDecisionLog;
  isLive: boolean;
}): Promise<StoredAutoState> {
  const state = await getAutoState();
  return updateAutoState({
    lastSubmitted: input.log,
    tradeStatus: "AUTO_TRADE_SUBMITTED",
    autoTradesToday: state.autoTradesToday + 1,
    openAutoTrades: input.isLive ? state.openAutoTrades + 1 : state.openAutoTrades,
    rejectedOrdersRecent: 0,
    logs: [input.log, ...state.logs].slice(0, 100),
    totalAutoDecisions: state.totalAutoDecisions + 1,
  });
}

export async function recordAutoBlocked(input: {
  log: AutoDecisionLog;
  staleOrderbook?: boolean;
  staleOdds?: boolean;
  settlementDrop?: boolean;
  falseEdge?: boolean;
}): Promise<StoredAutoState> {
  const state = await getAutoState();
  return updateAutoState({
    lastBlocked: input.log,
    tradeStatus: "AUTO_TRADE_BLOCKED_PER_TRADE",
    rejectedOrdersRecent: state.rejectedOrdersRecent + 1,
    orderbookStaleCount: input.staleOrderbook ? state.orderbookStaleCount + 1 : 0,
    oddsStaleCount: input.staleOdds ? state.oddsStaleCount + 1 : 0,
    settlementDropCount: input.settlementDrop ? state.settlementDropCount + 1 : 0,
    falseEdgeCount: input.falseEdge ? state.falseEdgeCount + 1 : state.falseEdgeCount,
    logs: [input.log, ...state.logs].slice(0, 100),
    totalAutoDecisions: state.totalAutoDecisions + 1,
  });
}

export async function setAutoPaused(paused: boolean, reason?: string) {
  const state = await getAutoState();
  if (paused && reason) {
    await appendAutoLog({
      id: `pause-${Date.now()}`,
      at: new Date().toISOString(),
      autoLevel: "PAPER_AUTO",
      tradeStatus: "AUTO_TRADE_BLOCKED_PER_TRADE",
      opportunityId: null,
      market: null,
      reason,
      failedGate: "AUTO_PAUSED",
    });
  }
  return updateAutoState({ paused, tradeStatus: paused ? "AUTO_WAITING_FOR_VALID_TRADE" : state.tradeStatus });
}

export async function setAutoEmergencyStop(enabled: boolean) {
  return updateAutoState({
    emergencyStop: enabled,
    paused: enabled,
    tradeStatus: "AUTO_WAITING_FOR_VALID_TRADE",
  });
}

export async function clearAutoEmergencyStop() {
  return updateAutoState({
    emergencyStop: false,
    paused: false,
    tradeStatus: "AUTO_WAITING_FOR_VALID_TRADE",
  });
}

export async function resetAutoDailyCountersIfNeeded() {
  const state = await getAutoState();
  const today = new Date().toISOString().slice(0, 10);
  const lastDay = state.lastScanAt?.slice(0, 10);
  if (lastDay && lastDay !== today) {
    return updateAutoState({
      autoTradesToday: 0,
      rejectedOrdersRecent: 0,
      orderbookStaleCount: 0,
      oddsStaleCount: 0,
      settlementDropCount: 0,
      falseEdgeCount: 0,
      consecutiveAutoLosses: 0,
    });
  }
  return state;
}

export function buildAutoExposureSnapshot(state: StoredAutoState, riskDailyLoss: number, riskOpenExposure: number) {
  return {
    autoTradesToday: state.autoTradesToday,
    openAutoTrades: state.openAutoTrades,
    dailyRealizedLoss: riskDailyLoss,
    totalOpenExposure: riskOpenExposure,
    consecutiveAutoLosses: state.consecutiveAutoLosses,
    rejectedOrdersRecent: state.rejectedOrdersRecent,
  };
}

export type { AutoLevel };
