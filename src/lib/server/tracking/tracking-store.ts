import "server-only";

import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import type { SystemLogEntry } from "@/lib/core/logger";
import { createLogEntry } from "@/lib/core/logger";
import {
  EMPTY_TRACKING_STATE,
  STORAGE_FILES,
  type EdgeReplayRecord,
  type MissedOpportunityRecord,
  type TrackedTradeRecord,
  type TrackingStateSnapshot,
} from "@/lib/core/storage";

const DATA_DIR = path.join(process.cwd(), "data");
const TRACKING_FILE = path.join(DATA_DIR, STORAGE_FILES.tracking);
const SYSTEM_LOG_FILE = path.join(DATA_DIR, STORAGE_FILES.systemLog);

async function ensureDataDir() {
  await mkdir(DATA_DIR, { recursive: true });
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  await ensureDataDir();
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

async function writeJson<T>(file: string, data: T) {
  await ensureDataDir();
  await writeFile(file, JSON.stringify(data, null, 2), "utf8");
}

export async function getTrackingState(): Promise<TrackingStateSnapshot> {
  return readJson(TRACKING_FILE, EMPTY_TRACKING_STATE);
}

export async function saveTrackingState(state: TrackingStateSnapshot) {
  await writeJson(TRACKING_FILE, { ...state, lastUpdatedAt: new Date().toISOString() });
}

export async function recordTrade(input: Omit<TrackedTradeRecord, "id" | "createdAt" | "updatedAt">) {
  const state = await getTrackingState();
  const trade: TrackedTradeRecord = {
    ...input,
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  state.trades = [trade, ...state.trades].slice(0, 500);
  await saveTrackingState(state);
  await appendSystemLog(
    createLogEntry({
      category: input.mode === "LIVE" ? "EXECUTION" : "AUTO",
      message: `${input.mode} trade recorded — ${input.marketTicker}`,
      market: input.marketTicker,
      opportunityId: input.opportunityId ?? undefined,
      details: {
        stake: input.finalAllowedStake,
        mode: input.mode,
        lifecycle: input.lifecycle,
      },
    })
  );
  return trade;
}

export async function recordMissedOpportunity(
  input: Omit<MissedOpportunityRecord, "id" | "at">
) {
  const state = await getTrackingState();
  const record: MissedOpportunityRecord = {
    ...input,
    id: randomUUID(),
    at: new Date().toISOString(),
  };
  state.missed = [record, ...state.missed].slice(0, 200);
  await saveTrackingState(state);
  await appendSystemLog(
    createLogEntry({
      category: "OPPORTUNITY",
      level: "WARN",
      message: `Missed opportunity — ${input.reason}`,
      market: input.marketTicker,
      opportunityId: input.opportunityId,
    })
  );
  return record;
}

export async function recordEdgeReplay(input: Omit<EdgeReplayRecord, "id" | "at">) {
  const state = await getTrackingState();
  const record: EdgeReplayRecord = {
    ...input,
    id: randomUUID(),
    at: new Date().toISOString(),
  };
  state.edgeReplays = [record, ...state.edgeReplays].slice(0, 200);
  await saveTrackingState(state);
  return record;
}

export async function getSystemLogs(): Promise<SystemLogEntry[]> {
  return readJson(SYSTEM_LOG_FILE, [] as SystemLogEntry[]);
}

export async function appendSystemLog(entry: SystemLogEntry) {
  const logs = await getSystemLogs();
  await writeJson(SYSTEM_LOG_FILE, [entry, ...logs].slice(0, 500));
}

export async function syncLogsFromRiskAndAuto(
  riskLogs: Array<{ id: string; at: string; status: string; reason: string; opportunityId?: string; market?: string }>,
  autoLogs: Array<{ id: string; at: string; tradeStatus: string; reason: string; opportunityId: string | null; market: string | null; failedGate: string | null }>
) {
  const existing = await getSystemLogs();
  const existingIds = new Set(existing.map((l) => l.id));

  const newEntries: SystemLogEntry[] = [];

  for (const log of riskLogs) {
    const id = `risk-${log.id}`;
    if (existingIds.has(id)) continue;
    newEntries.push({
      ...createLogEntry({
        level: log.status.includes("BLOCKED") ? "WARN" : "INFO",
        category: "EXECUTION",
        message: log.reason,
        opportunityId: log.opportunityId,
        market: log.market,
        details: { status: log.status },
      }),
      id,
    });
  }

  for (const log of autoLogs) {
    const id = `auto-${log.id}`;
    if (existingIds.has(id)) continue;
    newEntries.push({
      ...createLogEntry({
        level: log.tradeStatus.includes("BLOCKED") ? "WARN" : "INFO",
        category: "AUTO",
        message: log.reason,
        opportunityId: log.opportunityId ?? undefined,
        market: log.market ?? undefined,
        details: { status: log.tradeStatus, failedGate: log.failedGate },
      }),
      id,
    });
  }

  if (newEntries.length > 0) {
    await writeJson(SYSTEM_LOG_FILE, [...newEntries, ...existing].slice(0, 500));
  }
}
