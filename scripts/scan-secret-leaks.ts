#!/usr/bin/env node

import { readFileSync, readdirSync, statSync } from "fs";
import { join, extname, relative } from "path";

const ROOT = join(import.meta.dirname, "..");
const IGNORE_DIRS = new Set(["node_modules", ".next", ".git", "data", ".test-dist"]);
const SCAN_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".json", ".env", ".example"]);

interface Finding {
  file: string;
  rule: string;
  detail: string;
}

const findings: Finding[] = [];

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (IGNORE_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, files);
    else if (SCAN_EXTENSIONS.has(extname(full)) || entry.startsWith(".env")) files.push(full);
  }
  return files;
}

function rel(file: string) {
  return relative(ROOT, file);
}

function add(file: string, rule: string, detail: string) {
  findings.push({ file: rel(file), rule, detail });
}

function isClientComponent(content: string) {
  return /^\s*["']use client["']/m.test(content);
}

function scanFile(file: string) {
  const content = readFileSync(file, "utf8");
  const client = isClientComponent(content);
  const fileRel = rel(file);

  if (/NEXT_PUBLIC_.*(KEY|SECRET|TOKEN|PRIVATE|PASSWORD)/i.test(content)) {
    add(file, "next_public_secret", "Secret-looking NEXT_PUBLIC variable");
  }

  if (client && /process\.env/.test(content)) {
    add(file, "client_process_env", "process.env referenced in client component");
  }

  if (client && /process\.env\.(ODDS_API_KEY|KALSHI_[A-Z_]*KEY)/.test(content)) {
    add(file, "client_odds_api_key", "Provider key env reference in client code");
  }

  if (client && /(createSign\(|RSA_PKCS1_PSS|KALSHI-ACCESS-SIGNATURE)/.test(content)) {
    add(file, "client_kalshi_signing", "Kalshi signing logic in client code");
  }

  if (client && /-----BEGIN (?:RSA )?PRIVATE KEY-----/.test(content)) {
    add(file, "client_kalshi_private_key", "Private key material in client code");
  }

  if (/localStorage\.(setItem|getItem)\([^)]*(key|secret|token)/i.test(content)) {
    add(file, "local_storage_secret", "Secret stored/read from localStorage");
  }

  if (/sessionStorage\.(setItem|getItem)\([^)]*(key|secret|token)/i.test(content)) {
    add(file, "session_storage_secret", "Secret stored/read from sessionStorage");
  }

  if (/console\.(log|info|debug|error)\([^)]*(api[_-]?key|private[_-]?key|secret)/i.test(content)) {
    add(file, "secret_logged", "Secret-like value printed in logs");
  }

  if (/NextResponse\.json\([\s\S]*?(secretValue|encryptedValue|privateKeyPem)/.test(content)) {
    add(file, "raw_auth_payload", "Raw auth payload may be returned from route");
  }

  if (/-----BEGIN (?:RSA )?PRIVATE KEY-----[\s\S]{40,}-----END/.test(content)) {
    if (
      !fileRel.includes("key-validator.ts") &&
      !fileRel.endsWith(".example") &&
      !fileRel.includes("scripts/tests/")
    ) {
      add(file, "private_key_material", "Private key material committed in source");
    }
  }

  if (/api[_-]?key\s*[:=]\s*["'][a-zA-Z0-9_\-]{20,}["']/i.test(content)) {
    if (!fileRel.endsWith(".example") && fileRel !== ".env.example") {
      add(file, "provider_key_in_source", "Provider key literal in source");
    }
  }

  if (/\.env\.(local|production|development)["']?\s*,|\bfrom\s+["']\.env/.test(content)) {
    add(file, "env_imported_to_source", ".env values may be copied into source files");
  }

  if (fileRel.includes("__tests__") || fileRel.includes("/tests/") || fileRel.includes("fixtures")) {
    if (/api[_-]?key\s*[:=]\s*["'][a-zA-Z0-9_\-]{12,}["']/i.test(content)) {
      if (!fileRel.includes("scripts/tests/")) {
        add(file, "provider_key_fixture", "Provider key in test fixture");
      }
    }
  }
}

for (const file of walk(ROOT)) {
  if (file.endsWith("scan-secret-leaks.ts")) continue;
  scanFile(file);
}

if (findings.length > 0) {
  console.error("[edgewise:security] BLOCKED — SECRET_LEAK_DETECTED");
  for (const f of findings) {
    console.error(`  - ${f.file} :: ${f.rule} :: ${f.detail}`);
  }
  process.exit(1);
}

console.log("[edgewise:security] Secret leak scan passed.");
process.exit(0);
