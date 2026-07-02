import "server-only";
import {
  buildKalshiAuthHeaders,
  buildKalshiSignature,
  kalshiRestOrigin,
  type KalshiCredentials,
} from "@/lib/core/kalshi-auth";
import { KALSHI_CONTRACT } from "@/lib/core/contracts";
import { KEY_BLOCK_CODES, type SecureKeyStatus } from "@/lib/core/key-constants";
import type { KeyProvider } from "@/lib/core/types";
import {
  normalizeApiKeyValue,
  normalizePrivateKeyPem,
  validatePrivateKeyPemFormat,
} from "@/lib/server/keys/key-validator";
import { testOddsApiKey as testOddsKeyInternal } from "@/lib/server/keys/odds-auth-test";

export interface AuthTestResult {
  ok: boolean;
  status: SecureKeyStatus;
  message: string;
  errorCategory?: string;
  quotaStatus?: string | null;
  environment?: "demo" | "prod";
  pairStatus?: SecureKeyStatus;
}

function kalshiApiProvider(environment: "demo" | "prod"): KeyProvider {
  return environment === "demo" ? "kalshi_demo_api" : "kalshi_prod_api";
}

function kalshiPrivateProvider(environment: "demo" | "prod"): KeyProvider {
  return environment === "demo" ? "kalshi_demo_private" : "kalshi_prod_private";
}

function pairConfiguredStatus(environment: "demo" | "prod"): SecureKeyStatus {
  return environment === "demo"
    ? "KALSHI_DEMO_PAIR_CONFIGURED"
    : "KALSHI_PROD_PAIR_CONFIGURED";
}

function signingPreflight(privateKeyPem: string): AuthTestResult | null {
  try {
    buildKalshiSignature({
      privateKeyPem,
      timestampMs: Date.now().toString(),
      method: "GET",
      pathWithOptionalQuery: KALSHI_CONTRACT.endpoints.exchangeStatus,
    });
    return null;
  } catch {
    return {
      ok: false,
      status: "KALSHI_AUTH_TEST_FAILED",
      message: "Kalshi private key could not be used for signing",
      errorCategory: KEY_BLOCK_CODES.KALSHI_SIGNING_ERROR,
    };
  }
}

async function kalshiSignedRequest(
  credentials: KalshiCredentials,
  method: "GET" | "POST" | "DELETE",
  path: string
): Promise<Response> {
  const origin = kalshiRestOrigin(credentials.environment);
  if (!origin) {
    throw new Error(KEY_BLOCK_CODES.KALSHI_BASE_URL_UNCONFIRMED);
  }

  const headers = buildKalshiAuthHeaders({
    credentials,
    method,
    pathWithOptionalQuery: path,
  });

  return fetch(`${origin}${path}`, {
    method,
    headers,
  });
}

export async function testKalshiCredentialPair(input: {
  environment: "demo" | "prod";
  apiKey?: string;
  privateKeyPem?: string;
}): Promise<AuthTestResult> {
  const pairStatus = pairConfiguredStatus(input.environment);

  if (!input.apiKey?.trim()) {
    return {
      ok: false,
      status: "KALSHI_AUTH_TEST_FAILED",
      message: "Kalshi API key missing from credential pair",
      errorCategory: KEY_BLOCK_CODES.KALSHI_KEY_PAIR_INCOMPLETE,
      environment: input.environment,
      pairStatus,
    };
  }

  if (!input.privateKeyPem?.trim()) {
    return {
      ok: false,
      status: "KALSHI_AUTH_TEST_FAILED",
      message: "Kalshi private key missing from credential pair",
      errorCategory: KEY_BLOCK_CODES.KALSHI_KEY_PAIR_INCOMPLETE,
      environment: input.environment,
      pairStatus,
    };
  }

  const pemValidation = validatePrivateKeyPemFormat(input.privateKeyPem);
  if (!pemValidation.valid) {
    return {
      ok: false,
      status: "KALSHI_AUTH_TEST_FAILED",
      message: "Kalshi private key format invalid",
      errorCategory: KEY_BLOCK_CODES.KALSHI_PRIVATE_KEY_FORMAT_ERROR,
      environment: input.environment,
      pairStatus,
    };
  }

  const credentials: KalshiCredentials = {
    apiKeyId: normalizeApiKeyValue(input.apiKey),
    privateKeyPem: normalizePrivateKeyPem(input.privateKeyPem),
    environment: input.environment,
  };

  const signingError = signingPreflight(credentials.privateKeyPem);
  if (signingError) {
    return {
      ...signingError,
      environment: input.environment,
      pairStatus,
    };
  }

  try {
    const authRes = await kalshiSignedRequest(
      credentials,
      "GET",
      KALSHI_CONTRACT.endpoints.exchangeStatus
    );

    if (authRes.status === 401 || authRes.status === 403) {
      return {
        ok: false,
        status: "KALSHI_AUTH_TEST_FAILED",
        message: "Kalshi rejected the credential pair",
        errorCategory: KEY_BLOCK_CODES.KALSHI_AUTH_REJECTED,
        environment: input.environment,
        pairStatus,
      };
    }

    if (!authRes.ok) {
      return {
        ok: false,
        status: "KALSHI_AUTH_TEST_FAILED",
        message: `Kalshi auth test failed with HTTP ${authRes.status}`,
        errorCategory: KEY_BLOCK_CODES.KALSHI_AUTH_REJECTED,
        environment: input.environment,
        pairStatus,
      };
    }

    return {
      ok: true,
      status: "KALSHI_AUTH_TEST_PASSED",
      message: "Kalshi credential pair authenticated successfully",
      environment: input.environment,
      pairStatus,
      quotaStatus: null,
    };
  } catch (error) {
    const message =
      error instanceof Error &&
      error.message === KEY_BLOCK_CODES.KALSHI_BASE_URL_UNCONFIRMED
        ? "Kalshi endpoint not verified for this environment"
        : "Cannot reach Kalshi API";

    return {
      ok: false,
      status: "KALSHI_AUTH_TEST_FAILED",
      message,
      errorCategory:
        error instanceof Error &&
        error.message === KEY_BLOCK_CODES.KALSHI_BASE_URL_UNCONFIRMED
          ? KEY_BLOCK_CODES.KALSHI_BASE_URL_UNCONFIRMED
          : KEY_BLOCK_CODES.KALSHI_NETWORK_ERROR,
      environment: input.environment,
      pairStatus,
    };
  }
}

export async function testOddsApiKey(apiKey: string): Promise<AuthTestResult> {
  return testOddsKeyInternal(apiKey);
}

export async function testProviderKey(input: {
  provider: KeyProvider;
  secretValue: string;
  allSecrets: Map<KeyProvider, string>;
}): Promise<AuthTestResult> {
  if (input.provider === "odds_api") {
    return testOddsApiKey(input.secretValue);
  }

  const environment = input.provider.startsWith("kalshi_demo") ? "demo" : "prod";
  const apiKey = input.allSecrets.get(kalshiApiProvider(environment));
  const privateKey = input.allSecrets.get(kalshiPrivateProvider(environment));

  if (!apiKey || !privateKey) {
    return {
      ok: false,
      status: "KALSHI_AUTH_TEST_FAILED",
      message: "Kalshi API key and private key must be tested together as a pair",
      errorCategory: KEY_BLOCK_CODES.KALSHI_KEY_PAIR_INCOMPLETE,
      environment,
    };
  }

  return testKalshiCredentialPair({
    environment,
    apiKey,
    privateKeyPem: privateKey,
  });
}

export { kalshiApiProvider, kalshiPrivateProvider, pairConfiguredStatus };
