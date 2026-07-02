import "server-only";
import type { KeyProvider } from "@/lib/core/types";
import type { SecureKeyStatus } from "@/lib/core/key-constants";
import { KEY_BLOCK_CODES } from "@/lib/core/key-constants";

export interface KeyFormatValidation {
  valid: boolean;
  status: SecureKeyStatus;
  errorCategory?: string;
  blockCode?: string;
}

const PEM_PRIVATE_KEY =
  /-----BEGIN (?:RSA )?PRIVATE KEY-----[\s\S]+-----END (?:RSA )?PRIVATE KEY-----/;

export function providerEnvironment(
  provider: KeyProvider
): "demo" | "prod" | "external" {
  if (provider.startsWith("kalshi_demo")) return "demo";
  if (provider.startsWith("kalshi_prod")) return "prod";
  return "external";
}

/** Preserve PEM newlines; only trim outer whitespace. */
export function normalizePrivateKeyPem(value: string): string {
  let normalized = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!normalized.includes("\n") && normalized.includes("\\n")) {
    normalized = normalized.replace(/\\n/g, "\n");
  }
  return normalized.trim();
}

export function normalizeApiKeyValue(value: string): string {
  return value.trim();
}

export function normalizeSecretForProvider(
  provider: KeyProvider,
  value: string
): string {
  if (provider.endsWith("_private")) return normalizePrivateKeyPem(value);
  return normalizeApiKeyValue(value);
}

export function validatePrivateKeyPemFormat(value: string): KeyFormatValidation {
  const normalized = normalizePrivateKeyPem(value);
  if (!normalized) {
    return {
      valid: false,
      status: "KEY_MISSING",
      errorCategory: "missing_value",
    };
  }
  if (!PEM_PRIVATE_KEY.test(normalized)) {
    return {
      valid: false,
      status: "KEY_INVALID",
      errorCategory: KEY_BLOCK_CODES.KALSHI_PRIVATE_KEY_FORMAT_ERROR,
      blockCode: KEY_BLOCK_CODES.KALSHI_PRIVATE_KEY_FORMAT_ERROR,
    };
  }
  return { valid: true, status: "NOT_CONFIGURED" };
}

export function validateKeyFormat(
  provider: KeyProvider,
  value: string,
  requestedEnvironment: "demo" | "prod" | "external"
): KeyFormatValidation {
  const normalized = normalizeSecretForProvider(provider, value);
  if (!normalized) {
    return {
      valid: false,
      status: "KEY_MISSING",
      errorCategory: "missing_value",
    };
  }

  const providerEnv = providerEnvironment(provider);
  if (providerEnv !== "external" && providerEnv !== requestedEnvironment) {
    return {
      valid: false,
      status: "KEY_INVALID",
      errorCategory: KEY_BLOCK_CODES.DEMO_PROD_KEY_MISMATCH,
      blockCode: KEY_BLOCK_CODES.DEMO_PROD_KEY_MISMATCH,
    };
  }

  if (provider.endsWith("_private")) {
    return validatePrivateKeyPemFormat(normalized);
  }

  if (provider.includes("api") && normalized.length < 8) {
    return {
      valid: false,
      status: "KEY_INVALID",
      errorCategory: "api_key_too_short",
    };
  }

  return { valid: true, status: "NOT_CONFIGURED" };
}

export function resolveKeyPresentStatus(provider: KeyProvider): SecureKeyStatus {
  if (provider === "odds_api") return "ODDS_API_CONFIGURED";
  if (provider === "kalshi_demo_api") return "KALSHI_DEMO_API_KEY_PRESENT";
  if (provider === "kalshi_demo_private") return "KALSHI_DEMO_PRIVATE_KEY_PRESENT";
  if (provider === "kalshi_prod_api") return "KALSHI_PROD_API_KEY_PRESENT";
  if (provider === "kalshi_prod_private") return "KALSHI_PROD_PRIVATE_KEY_PRESENT";
  return "NOT_CONFIGURED";
}

/** @deprecated use resolveKeyPresentStatus */
export function resolveConfiguredStatus(provider: KeyProvider): SecureKeyStatus {
  return resolveKeyPresentStatus(provider);
}

export function assertProviderEnvironmentMatch(
  provider: KeyProvider,
  environment: "demo" | "prod" | "external"
) {
  const expected = providerEnvironment(provider);
  if (expected !== "external" && expected !== environment) {
    return KEY_BLOCK_CODES.DEMO_PROD_KEY_MISMATCH;
  }
  return null;
}

export function kalshiPairProviders(environment: "demo" | "prod"): {
  api: KeyProvider;
  privateKey: KeyProvider;
} {
  return environment === "demo"
    ? { api: "kalshi_demo_api", privateKey: "kalshi_demo_private" }
    : { api: "kalshi_prod_api", privateKey: "kalshi_prod_private" };
}

export interface KalshiPairSummary {
  environment: "demo" | "prod";
  apiPresent: boolean;
  privatePresent: boolean;
  pairComplete: boolean;
  pairStatus:
    | "INCOMPLETE"
    | "READY_TO_TEST"
    | "KALSHI_DEMO_PAIR_CONFIGURED"
    | "KALSHI_PROD_PAIR_CONFIGURED"
    | "KALSHI_AUTH_TEST_PASSED"
    | "KALSHI_AUTH_TEST_FAILED";
  lastTestedAt: string | null;
  errorCategory: string | null;
  message: string;
}

export function summarizeKalshiPair(
  keys: Array<{
    provider: KeyProvider;
    enabled: boolean;
    status: SecureKeyStatus;
    lastTestedAt: string | null;
    errorCategory: string | null;
  }>,
  environment: "demo" | "prod"
): KalshiPairSummary {
  const { api, privateKey } = kalshiPairProviders(environment);
  const apiKey = keys.find((k) => k.provider === api && k.enabled);
  const privKey = keys.find((k) => k.provider === privateKey && k.enabled);
  const apiPresent = Boolean(apiKey);
  const privatePresent = Boolean(privKey);
  const pairComplete = apiPresent && privatePresent;

  if (!pairComplete) {
    return {
      environment,
      apiPresent,
      privatePresent,
      pairComplete: false,
      pairStatus: "INCOMPLETE",
      lastTestedAt: null,
      errorCategory: KEY_BLOCK_CODES.KALSHI_KEY_PAIR_INCOMPLETE,
      message: "Kalshi API key and private key must both be saved to test as a pair",
    };
  }

  const bothPassed =
    apiKey!.status === "KALSHI_AUTH_TEST_PASSED" &&
    privKey!.status === "KALSHI_AUTH_TEST_PASSED";
  const eitherFailed =
    apiKey!.status === "KALSHI_AUTH_TEST_FAILED" ||
    privKey!.status === "KALSHI_AUTH_TEST_FAILED";
  const pairConfiguredStatus =
    environment === "demo" ? "KALSHI_DEMO_PAIR_CONFIGURED" : "KALSHI_PROD_PAIR_CONFIGURED";

  const lastTestedAt = [apiKey!.lastTestedAt, privKey!.lastTestedAt]
    .filter(Boolean)
    .sort()
    .pop() ?? null;
  const errorCategory = eitherFailed
    ? apiKey!.errorCategory ?? privKey!.errorCategory
    : null;

  if (bothPassed) {
    return {
      environment,
      apiPresent,
      privatePresent,
      pairComplete: true,
      pairStatus: "KALSHI_AUTH_TEST_PASSED",
      lastTestedAt,
      errorCategory: null,
      message: `${environment} Kalshi pair authenticated successfully`,
    };
  }

  if (eitherFailed) {
    return {
      environment,
      apiPresent,
      privatePresent,
      pairComplete: true,
      pairStatus: "KALSHI_AUTH_TEST_FAILED",
      lastTestedAt,
      errorCategory,
      message: "Kalshi pair test failed — see sanitized error category",
    };
  }

  return {
    environment,
    apiPresent,
    privatePresent,
    pairComplete: true,
    pairStatus: pairConfiguredStatus,
    lastTestedAt,
    errorCategory: null,
    message: `${environment} pair saved — run Test Kalshi Pair to verify authentication`,
  };
}
