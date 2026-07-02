#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readdirSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { fixTestDistImports } from "./tests/fix-imports.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, ".test-dist");
const TESTS_SRC = join(ROOT, "scripts", "tests");

if (existsSync(DIST)) {
  rmSync(DIST, { recursive: true, force: true });
}

const compile = spawnSync(
  process.execPath,
  [join(ROOT, "node_modules", "typescript", "lib", "tsc.js"), "-p", "tsconfig.tests.json"],
  { stdio: "inherit", cwd: ROOT }
);

if (compile.status !== 0) {
  console.error("[edgewise:test] TypeScript compile failed.");
  process.exit(compile.status ?? 1);
}

fixTestDistImports(DIST);

const files = readdirSync(join(DIST, "scripts", "tests"))
  .filter((f) => f.endsWith(".test.js"))
  .map((f) => join(DIST, "scripts", "tests", f));

if (files.length === 0) {
  console.error("[edgewise:test] No compiled test files found.");
  process.exit(1);
}

const result = spawnSync(process.execPath, ["--test", ...files], {
  stdio: "inherit",
  cwd: ROOT,
});

process.exit(result.status ?? 1);
