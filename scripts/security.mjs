#!/usr/bin/env node

import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const scanner = join(ROOT, "scripts/scan-secret-leaks.ts");

const result = spawnSync(
  process.execPath,
  ["--experimental-strip-types", scanner],
  { stdio: "inherit", cwd: ROOT }
);

if (result.error) {
  console.error("[edgewise:security] Failed to run scanner:", result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
