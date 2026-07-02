/**
 * Sanitized system logging — no secrets in log payloads.
 */

import type { STORAGE_FILES } from "@/lib/core/storage";

export type LogCategory =
  | "PROVIDER"
  | "OPPORTUNITY"
  | "VALIDATION"
  | "EXECUTION"
  | "AUTO"
  | "EXIT"
  | "ERROR"
  | "SYSTEM";

export type LogLevel = "INFO" | "WARN" | "ERROR";

export interface SystemLogEntry {
  id: string;
  at: string;
  level: LogLevel;
  category: LogCategory;
  message: string;
  details?: Record<string, string | number | boolean | null>;
  opportunityId?: string;
  market?: string;
  sanitized: true;
}

const SECRET_PATTERNS = [
  /api[_-]?key/i,
  /private[_-]?key/i,
  /secret/i,
  /password/i,
  /token/i,
  /BEGIN RSA/i,
  /BEGIN PRIVATE/i,
];

export function sanitizeLogValue(value: unknown): string | number | boolean | null {
  if (value == null) return null;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value !== "string") return String(value).slice(0, 200);
  if (SECRET_PATTERNS.some((p) => p.test(value))) return "[REDACTED]";
  if (value.length > 500) return `${value.slice(0, 500)}…`;
  return value;
}

export function sanitizeLogDetails(
  details: Record<string, unknown> | undefined
): Record<string, string | number | boolean | null> | undefined {
  if (!details) return undefined;
  const out: Record<string, string | number | boolean | null> = {};
  for (const [k, v] of Object.entries(details)) {
    if (SECRET_PATTERNS.some((p) => p.test(k))) continue;
    out[k] = sanitizeLogValue(v);
  }
  return out;
}

export function createLogEntry(input: {
  level?: LogLevel;
  category: LogCategory;
  message: string;
  details?: Record<string, unknown>;
  opportunityId?: string;
  market?: string;
}): SystemLogEntry {
  return {
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
    level: input.level ?? "INFO",
    category: input.category,
    message: input.message,
    details: sanitizeLogDetails(input.details),
    opportunityId: input.opportunityId,
    market: input.market,
    sanitized: true,
  };
}

export type StorageFileKey = keyof typeof STORAGE_FILES;
