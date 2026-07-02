#!/usr/bin/env node

/**
 * Edgewise verify script — initialization + readiness checks.
 */

import { existsSync } from "fs";
import { join } from "path";
import { spawnSync } from "child_process";

const ROOT = join(import.meta.dirname, "..");

const requiredPaths = [
  "package.json",
  "tsconfig.json",
  "next.config.ts",
  "tailwind.config.ts",
  "postcss.config.js",
  "PROJECT_RULES.md",
  "app/layout.tsx",
  "app/(dashboard)/page.tsx",
  "app/api/health/route.ts",
  "src/lib/core/index.ts",
  "src/lib/core/types.ts",
  "src/lib/core/constants.ts",
  "src/lib/core/backtest-contract.ts",
  "scripts/verify-contracts.ts",
  "scripts/verify-no-fake-active-data.ts",
  "scripts/tests/core-ev-stake.test.ts",
];

const missing = requiredPaths.filter((p) => !existsSync(join(ROOT, p)));

if (missing.length > 0) {
  console.error("[edgewise:verify] Missing required files:");
  for (const p of missing) {
    console.error(`  - ${p}`);
  }
  process.exit(1);
}

console.log("[edgewise:verify] All required initialization files present.");
console.log("[edgewise:verify] Manual execution: BUILT — per-trade gated");
console.log("[edgewise:verify] Auto mode: BUILT — selectable, per-trade validation");
console.log("[edgewise:verify] Backtesting: BLOCKED — historical data not configured");
console.log("[edgewise:verify] Profitability: UNPROVEN — tracked results only");
console.log("[edgewise:verify] Win rate claims: TRACKED RESULTS ONLY");

const contracts = spawnSync(process.execPath, ["--experimental-strip-types", join(ROOT, "scripts/verify-contracts.ts")], {
  stdio: "inherit",
  cwd: ROOT,
});
if (contracts.status !== 0) process.exit(contracts.status ?? 1);

const noFake = spawnSync(
  process.execPath,
  ["--experimental-strip-types", join(ROOT, "scripts/verify-no-fake-active-data.ts")],
  { stdio: "inherit", cwd: ROOT }
);
if (noFake.status !== 0) process.exit(noFake.status ?? 1);

process.exit(0);
