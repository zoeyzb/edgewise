import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import {
  DEFAULT_STAKE_SETTINGS,
  RISK_DEFAULTS,
} from "@/lib/core/constants";
import type {
  AutoLevel,
  ExecutionMode,
  StakeSettings,
} from "@/lib/core/types";
import {
  getKeyReadinessReport,
  listKeysSafe,
} from "@/lib/server/keys/key-service";

const DATA_DIR = path.join(process.cwd(), "data");
const STATE_FILE = path.join(DATA_DIR, "app-state.json");

interface StoredAppState {
  executionMode: ExecutionMode;
  autoLevel: AutoLevel;
  stakeSettings: StakeSettings;
}

const DEFAULT_APP_STATE: StoredAppState = {
  executionMode: "MANUAL",
  autoLevel: "PAPER_AUTO",
  stakeSettings: DEFAULT_STAKE_SETTINGS,
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

export async function getAppState(): Promise<StoredAppState> {
  return readJson(STATE_FILE, DEFAULT_APP_STATE);
}

export async function updateAppState(
  patch: Partial<StoredAppState>
): Promise<StoredAppState> {
  const current = await getAppState();
  const next = { ...current, ...patch };
  if (patch.stakeSettings) {
    next.stakeSettings = { ...current.stakeSettings, ...patch.stakeSettings };
  }
  await writeJson(STATE_FILE, next);
  return next;
}

export async function getPublicKeys() {
  const payload = await listKeysSafe();
  return payload.keys;
}

export async function hasConfiguredKalshiKey(): Promise<boolean> {
  const report = await getKeyReadinessReport();
  return report.kalshiDemoConfigured || report.kalshiProdConfigured;
}

export async function hasConfiguredOddsKey(): Promise<boolean> {
  const report = await getKeyReadinessReport();
  return report.oddsConfigured;
}

export function computeStakePreview(settings: StakeSettings): {
  userRequestedStake: number;
  aiRecommendedStake: number;
  finalAllowedStake: number;
  maxLoss: number;
  expectedDollarProfit: number;
  stakeReason: string;
  blocked: boolean;
  blockCode?: string;
} {
  const bankroll = settings.bankrollPlaceholder;
  let userRequested = 0;

  switch (settings.mode) {
    case "FIXED_DOLLAR_STAKE":
      userRequested = settings.fixedDollarAmount;
      break;
    case "FIXED_PERCENT_STAKE":
      userRequested = (settings.fixedPercentAmount / 100) * bankroll;
      break;
    case "AI_RECOMMENDED_STAKE":
      userRequested = bankroll * (RISK_DEFAULTS.conservativeStakePercent / 100);
      break;
    case "AI_WITH_USER_MAX":
      userRequested = Math.min(
        bankroll * (RISK_DEFAULTS.maxManualStakePercent / 100),
        settings.userMaxStake
      );
      break;
    case "AUTO_RISK_CAPPED":
      userRequested = bankroll * (RISK_DEFAULTS.conservativeStakePercent / 100);
      break;
  }

  const percentOfBankroll = (userRequested / bankroll) * 100;
  if (percentOfBankroll >= 100) {
    return {
      userRequestedStake: userRequested,
      aiRecommendedStake: bankroll * 0.005,
      finalAllowedStake: 0,
      maxLoss: 0,
      expectedDollarProfit: 0,
      stakeReason: "100% bankroll stake blocked",
      blocked: true,
      blockCode: "BLOCKED — 100_PERCENT_BANKROLL_STAKE_NOT_ALLOWED",
    };
  }

  const maxAllowed = bankroll * (RISK_DEFAULTS.maxManualStakePercent / 100);
  const aiRecommended = bankroll * (RISK_DEFAULTS.conservativeStakePercent / 100);
  const finalAllowed = Math.min(userRequested, maxAllowed, settings.userMaxStake);
  const reduced = finalAllowed < userRequested;

  return {
    userRequestedStake: Math.round(userRequested * 100) / 100,
    aiRecommendedStake: Math.round(aiRecommended * 100) / 100,
    finalAllowedStake: Math.round(finalAllowed * 100) / 100,
    maxLoss: Math.round(finalAllowed * 100) / 100,
    expectedDollarProfit: 0,
    stakeReason: reduced
      ? "Stake reduced to respect max manual stake and user max limits"
      : "Stake within risk limits — awaiting verified opportunity",
    blocked: false,
  };
}
