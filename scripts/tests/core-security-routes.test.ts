import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { sanitizeLogValue, createLogEntry } from "../../src/lib/core/logger.js";
import { FORBIDDEN_CLAIMS } from "../../src/lib/core/constants.js";

const ROOT = process.cwd();

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (["node_modules", ".next", ".git", "data", ".test-dist"].includes(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, files);
    else if (full.endsWith(".ts") || full.endsWith(".tsx")) files.push(full);
  }
  return files;
}

describe("secret sanitization", () => {
  it("redacts api key in log values", () => {
    assert.equal(sanitizeLogValue("contains_secret_material"), "[REDACTED]");
  });

  it("creates sanitized log entries", () => {
    const log = createLogEntry({
      category: "EXECUTION",
      message: "test",
      details: { authToken: "secret123456789" },
    });
    assert.equal(log.sanitized, true);
    assert.equal(log.details?.authToken, undefined);
  });
});

describe("forbidden marketing claims", () => {
  it("lists forbidden claims", () => {
    assert.ok(FORBIDDEN_CLAIMS.includes("guaranteed win"));
    assert.ok(FORBIDDEN_CLAIMS.includes("100% win rate"));
  });
});

describe("no secrets in client components", () => {
  it("client components do not reference provider key env", () => {
    const clientFiles = walk(join(ROOT, "src", "components")).filter((f) =>
      /^\s*["']use client["']/m.test(readFileSync(f, "utf8"))
    );
    for (const file of clientFiles) {
      const content = readFileSync(file, "utf8");
      assert.doesNotMatch(content, /process\.env\.(ODDS_API_KEY|KALSHI_[A-Z_]*KEY)/);
    }
  });
});

describe("execute route safety", () => {
  it("execute route uses server-known opportunityId only", () => {
    const content = readFileSync(join(ROOT, "app", "api", "core", "execute", "route.ts"), "utf8");
    assert.match(content, /executeManualOrder/);
    assert.doesNotMatch(content, /body\.stake|body\.price|body\.side/);
  });

  it("auto engine blocks until manual selection or odds edge", () => {
    const content = readFileSync(join(ROOT, "src", "lib", "server", "auto", "auto-engine.ts"), "utf8");
    assert.match(content, /AUTO_BLOCKED/);
    assert.doesNotMatch(content, /buildOpportunityScanResponse/);
  });
});

describe("no fake profit in core routes", () => {
  for (const route of ["execute/route.ts", "profitability/route.ts", "tracker/route.ts"]) {
    it(`${route} has no guaranteed win claims`, () => {
      const content = readFileSync(join(ROOT, "app", "api", "core", route), "utf8");
      assert.doesNotMatch(content, /guaranteed win/i);
      assert.doesNotMatch(content, /100% win rate/i);
    });
  }
});

describe("key store uses encryption", () => {
  it("key-store encrypts at rest", () => {
    const content = readFileSync(join(ROOT, "src", "lib", "server", "keys", "key-store.ts"), "utf8");
    assert.match(content, /encrypt/);
  });
});
