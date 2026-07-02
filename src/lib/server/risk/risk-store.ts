import { mkdir, readFile, writeFile, access } from "fs/promises";
import path from "path";
import type { RiskExposureSnapshot } from "@/lib/core/types";
import type { CooldownState } from "@/lib/core/risk";

const DATA_DIR = path.join(process.cwd(), "data");
const RISK_FILE = path.join(DATA_DIR, "risk-state.json");
const LOG_FILE = path.join(DATA_DIR, "execution-log.json");

export interface StoredRiskState {
  exposure: RiskExposureSnapshot;
  cooldown: CooldownState;
  appKillSwitch: boolean;
  logs: Array<{
    id: string;
    at: string;
    status: string;
    reason: string;
    opportunityId?: string;
    market?: string;
  }>;
}

const DEFAULT_RISK_STATE: StoredRiskState = {
  exposure: {
    totalOpenExposure: 0,
    dailyRealizedLoss: 0,
    exposureByGame: {},
    exposureByLeague: {},
    openTradesCount: 0,
    tradesToday: 0,
    openMarketTickers: [],
    balanceFreshAt: null,
    positionsFreshAt: null,
  },
  cooldown: {
    lastLossAt: null,
    lastRejectedOrderAt: null,
    lastFailedExecutionAt: null,
  },
  appKillSwitch: true,
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

export async function getRiskState(): Promise<StoredRiskState> {
  return readJson(RISK_FILE, DEFAULT_RISK_STATE);
}

export async function updateRiskState(
  patch: Partial<StoredRiskState> & {
    exposure?: Partial<RiskExposureSnapshot>;
    cooldown?: Partial<CooldownState>;
  }
): Promise<StoredRiskState> {
  const current = await getRiskState();
  const next: StoredRiskState = {
    ...current,
    ...patch,
    exposure: { ...current.exposure, ...patch.exposure },
    cooldown: { ...current.cooldown, ...patch.cooldown },
    logs: patch.logs ?? current.logs,
  };
  await writeJson(RISK_FILE, next);
  return next;
}

export async function appendExecutionLog(entry: StoredRiskState["logs"][number]) {
  const state = await getRiskState();
  const logs = [entry, ...state.logs].slice(0, 200);
  await updateRiskState({ logs });
}

export async function isStorageHealthy(): Promise<boolean> {
  try {
    await ensureDataDir();
    await access(DATA_DIR);
    return true;
  } catch {
    return false;
  }
}

export async function isLoggingHealthy(): Promise<boolean> {
  try {
    await ensureDataDir();
    const existing = await readJson(LOG_FILE, [] as unknown[]);
    await writeJson(LOG_FILE, existing);
    return true;
  } catch {
    return false;
  }
}

export async function setAppKillSwitch(enabled: boolean) {
  return updateRiskState({ appKillSwitch: enabled });
}

export async function getAppKillSwitch(): Promise<boolean> {
  const state = await getRiskState();
  return state.appKillSwitch;
}

export async function recordSubmittedOrder(input: {
  marketTicker: string;
  gameKey: string;
  leagueKey: string;
  stake: number;
}) {
  const state = await getRiskState();
  const exposure = { ...state.exposure };
  exposure.totalOpenExposure += input.stake;
  exposure.openTradesCount += 1;
  exposure.tradesToday += 1;
  exposure.openMarketTickers = [...exposure.openMarketTickers, input.marketTicker];
  exposure.exposureByGame[input.gameKey] = (exposure.exposureByGame[input.gameKey] ?? 0) + input.stake;
  exposure.exposureByLeague[input.leagueKey] =
    (exposure.exposureByLeague[input.leagueKey] ?? 0) + input.stake;
  await updateRiskState({ exposure });
}

export async function recordFailedExecution() {
  await updateRiskState({
    cooldown: { ...(await getRiskState()).cooldown, lastFailedExecutionAt: new Date().toISOString() },
  });
}

export async function recordRejectedOrder() {
  await updateRiskState({
    cooldown: { ...(await getRiskState()).cooldown, lastRejectedOrderAt: new Date().toISOString() },
  });
}
