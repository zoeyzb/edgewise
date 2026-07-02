import "server-only";

export type ServerOnlyOperation =
  | "kalshi_signing"
  | "provider_keys"
  | "account_balance"
  | "positions"
  | "ev_calculation"
  | "staking"
  | "risk_approval"
  | "execution_approval"
  | "order_placement";

export function assertServerOnlyOperation(operation: ServerOnlyOperation) {
  if (typeof window !== "undefined") {
    throw new Error(`BLOCKED — ${operation} must run server-side only`);
  }
}

export function sanitizeClientPayload<T extends Record<string, unknown>>(payload: T) {
  const forbidden = [
    "secretValue",
    "encryptedValue",
    "value",
    "apiKey",
    "privateKey",
    "token",
    "authorization",
  ];
  const clone = { ...payload };
  for (const key of forbidden) {
    if (key in clone) delete clone[key];
  }
  return clone;
}
