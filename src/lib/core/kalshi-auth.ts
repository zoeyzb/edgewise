import "server-only";
import { createSign, constants } from "crypto";
import { KALSHI_CONTRACT } from "@/lib/core/contracts";

export type KalshiEnvironment = "demo" | "prod";

export interface KalshiCredentials {
  apiKeyId: string;
  privateKeyPem: string;
  environment: KalshiEnvironment;
}

export function kalshiRestOrigin(environment: KalshiEnvironment): string {
  return environment === "demo"
    ? KALSHI_CONTRACT.demoRestOrigin
    : KALSHI_CONTRACT.prodRestOrigin;
}

export function kalshiWsOrigin(environment: KalshiEnvironment): string {
  return environment === "demo"
    ? KALSHI_CONTRACT.demoWsOrigin
    : KALSHI_CONTRACT.prodWsOrigin;
}

/** Official rule: sign timestamp + METHOD + path without query string. */
export function buildKalshiSignature(input: {
  privateKeyPem: string;
  timestampMs: string;
  method: string;
  pathWithOptionalQuery: string;
}): string {
  const pathWithoutQuery = input.pathWithOptionalQuery.split("?")[0] ?? "";
  const message = `${input.timestampMs}${input.method.toUpperCase()}${pathWithoutQuery}`;
  const signer = createSign("RSA-SHA256");
  signer.update(message);
  signer.end();
  return signer.sign(
    {
      key: input.privateKeyPem,
      padding: constants.RSA_PKCS1_PSS_PADDING,
      saltLength: constants.RSA_PSS_SALTLEN_DIGEST,
    },
    "base64"
  );
}

export function buildKalshiAuthHeaders(input: {
  credentials: KalshiCredentials;
  method: string;
  pathWithOptionalQuery: string;
  timestampMs?: string;
}): Record<string, string> {
  const timestampMs = input.timestampMs ?? Date.now().toString();
  const signature = buildKalshiSignature({
    privateKeyPem: input.credentials.privateKeyPem,
    timestampMs,
    method: input.method,
    pathWithOptionalQuery: input.pathWithOptionalQuery,
  });

  return {
    "KALSHI-ACCESS-KEY": input.credentials.apiKeyId,
    "KALSHI-ACCESS-TIMESTAMP": timestampMs,
    "KALSHI-ACCESS-SIGNATURE": signature,
    "Content-Type": "application/json",
  };
}

export function buildKalshiWsAuthHeaders(credentials: KalshiCredentials) {
  return buildKalshiAuthHeaders({
    credentials,
    method: "GET",
    pathWithOptionalQuery: KALSHI_CONTRACT.wsPath,
  });
}

export function sanitizeKalshiError(status: number): {
  category: "auth" | "network" | "rate_limit" | "validation" | "unknown";
  message: string;
} {
  if (status === 401 || status === 403) {
    return { category: "auth", message: "Kalshi authentication rejected" };
  }
  if (status === 429) {
    return { category: "rate_limit", message: "Kalshi rate limit exceeded" };
  }
  if (status >= 500) {
    return { category: "network", message: "Kalshi upstream error" };
  }
  return { category: "validation", message: `Kalshi request failed (${status})` };
}
