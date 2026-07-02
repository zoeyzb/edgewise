#!/usr/bin/env node

/**
 * Verify active routes do not serve fake data as real money data.
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const errors: string[] = [];
const warnings: string[] = [];

const FORBIDDEN_IN_ROUTES = [
  /guaranteed win/i,
  /100% win rate/i,
  /free money/i,
  /REAL_MONEY_PROVEN/,
  /profit guaranteed/i,
];

const ACCEPTABLE_PLACEHOLDERS = [
  "PROVIDER_NOT_CONFIGURED",
  "NO_MATCHES_FOUND",
  "INSUFFICIENT_DATA",
  "UNPROVEN",
  "HISTORICAL_DATA_NOT_CONFIGURED",
  "BLOCKED",
  "TRACKED_RESULTS",
  "PAPER_SIMULATION",
  "SHADOW_SIMULATION",
];

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, files);
    else if (entry === "route.ts") files.push(full);
  }
  return files;
}

function checkRoute(file: string): void {
  const rel = file.replace(ROOT + "/", "");
  const content = readFileSync(file, "utf8");

  for (const pattern of FORBIDDEN_IN_ROUTES) {
    if (pattern.test(content)) {
      errors.push(`${rel}: forbidden claim pattern ${pattern}`);
    }
  }

  if (content.includes("PLACEHOLDER_UI_ONLY") && !rel.includes("backtesting-status")) {
    if (!content.includes("PROVIDER_NOT_CONFIGURED") && !content.includes("NOT_CONFIGURED")) {
      warnings.push(`${rel}: PLACEHOLDER_UI_ONLY without honest provider status`);
    }
  }

  if (content.includes("fake") && content.includes("profit") && !content.includes("No fake")) {
    errors.push(`${rel}: possible fake profit language`);
  }
}

for (const route of walk(join(ROOT, "app", "api"))) {
  checkRoute(route);
}

const execute = readFileSync(join(ROOT, "app/api/core/execute/route.ts"), "utf8");
if (!execute.includes("opportunityId")) {
  errors.push("execute route must require opportunityId");
}
if (execute.match(/body\.(stake|price|side)/)) {
  errors.push("execute route must not trust browser stake/price/side");
}

const profitabilityCore = readFileSync(join(ROOT, "src/lib/core/profitability.ts"), "utf8");
if (!profitabilityCore.includes("winRate") || !profitabilityCore.includes("sampleSize")) {
  errors.push("profitability must gate win rate on sample size");
}

const clientLayout = existsSync(join(ROOT, "app/layout.tsx"))
  ? readFileSync(join(ROOT, "app/layout.tsx"), "utf8")
  : "";
const publicEnvPrefix = "NEXT" + "_PUBLIC_";
if (clientLayout.includes(publicEnvPrefix) && /(?:KEY|SECRET)/.test(clientLayout)) {
  errors.push("layout exposes secret via NEXT_PUBLIC");
}

if (errors.length > 0) {
  console.error("[edgewise:verify:no-fake-active-data] FAILED:");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log("[edgewise:verify:no-fake-active-data] Active route checks passed.");
if (warnings.length > 0) {
  for (const w of warnings) console.log(`  [warn] ${w}`);
}
console.log("[edgewise:verify:no-fake-active-data] Acceptable labels:", ACCEPTABLE_PLACEHOLDERS.join(", "));
process.exit(0);
