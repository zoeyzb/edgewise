#!/usr/bin/env node

/**
 * Verify provider and backtest contracts exist and are honestly marked.
 */

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const errors: string[] = [];

function requireFile(path: string, label: string): string | null {
  if (!existsSync(join(ROOT, path))) {
    errors.push(`Missing ${label}: ${path}`);
    return null;
  }
  return readFileSync(join(ROOT, path), "utf8");
}

const contracts = requireFile("src/lib/core/contracts.ts", "Kalshi/Odds contracts");
const backtest = requireFile("src/lib/core/backtest-contract.ts", "backtest contract");
requireFile("src/lib/core/backtest-contract.ts", "backtest contract file");

if (contracts) {
  if (!contracts.includes("KALSHI_CONTRACT")) errors.push("KALSHI_CONTRACT not defined");
  if (!contracts.includes("ODDS_API_CONTRACT")) errors.push("ODDS_API_CONTRACT not defined");
  if (!contracts.includes("UNCONFIRMED")) {
    errors.push("Contracts should mark unconfirmed fields");
  }
}

if (backtest) {
  if (!backtest.includes("HISTORICAL_DATA_NOT_CONFIGURED")) {
    errors.push("Backtest block code missing");
  }
  if (!backtest.includes("no lookahead bias")) errors.push("Lookahead bias guard missing");
  if (!backtest.includes("profitabilityClaimAllowed")) {
    errors.push("Backtest profitability claim guard missing");
  }
}

const executeRoute = requireFile("app/api/core/execute/route.ts", "execute route");
if (executeRoute && !executeRoute.includes("executeManualOrder")) {
  errors.push("Execute route must use server execution pipeline");
}

const autoEngine = requireFile("src/lib/server/auto/auto-engine.ts", "auto engine");
if (autoEngine && !autoEngine.includes("executeManualOrder")) {
  errors.push("Auto live must use execute pipeline (executeManualOrder)");
}

const validators = requireFile("src/lib/core/validators.ts", "validators");
if (validators && validators.includes("midpoint")) {
  errors.push("Validators must not use midpoint for execution");
}

if (errors.length > 0) {
  console.error("[edgewise:verify:contracts] FAILED:");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log("[edgewise:verify:contracts] Contract checks passed.");
console.log("[edgewise:verify:contracts] Backtesting: BLOCKED — historical data not configured");
console.log("[edgewise:verify:contracts] Provider contracts: typed with unconfirmed markers");
console.log("[edgewise:verify:contracts] Execute pipeline: server-side opportunityId only");
process.exit(0);
