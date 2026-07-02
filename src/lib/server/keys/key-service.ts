import "server-only";
import { getAppConfigReport, getEnvSecret } from "@/lib/core/config";
import { KEY_BLOCK_CODES } from "@/lib/core/key-constants";
import type { KeyProvider } from "@/lib/core/types";
import { assertServerSideSecretsSafe } from "@/lib/server/crypto";
import {
  kalshiApiProvider,
  kalshiPrivateProvider,
  pairConfiguredStatus,
  testKalshiCredentialPair,
  testProviderKey,
} from "@/lib/server/keys/key-auth-test";
import {
  deleteStoredKey,
  getDecryptedSecret,
  getDecryptedSecretsMap,
  getStoredKey,
  listPublicKeys,
  patchStoredKey,
  saveStoredKey,
  toPublicKeyRecord,
} from "@/lib/server/keys/key-store";
import {
  assertProviderEnvironmentMatch,
  normalizeSecretForProvider,
  providerEnvironment,
  resolveKeyPresentStatus,
  summarizeKalshiPair,
  validateKeyFormat,
} from "@/lib/server/keys/key-validator";

export async function listKeysSafe() {
  assertServerSideSecretsSafe();
  const keys = await listPublicKeys();
  return {
    keys,
    kalshiPairs: {
      demo: summarizeKalshiPair(keys, "demo"),
      prod: summarizeKalshiPair(keys, "prod"),
    },
  };
}

export async function upsertKeySafe(input: {
  id?: string;
  label: string;
  provider: KeyProvider;
  value?: string;
  enabled?: boolean;
  environment: "demo" | "prod" | "external";
  generate?: boolean;
}) {
  assertServerSideSecretsSafe();

  if (input.generate) {
    return {
      ok: false as const,
      code: KEY_BLOCK_CODES.PROVIDER_KEYS_MUST_BE_CREATED_IN_PROVIDER_DASHBOARD,
    };
  }

  if (!input.value?.trim()) {
    return {
      ok: false as const,
      code: "KEY_MISSING",
      message: "Key value required",
    };
  }

  const normalized = normalizeSecretForProvider(input.provider, input.value);
  const format = validateKeyFormat(input.provider, normalized, input.environment);
  if (!format.valid) {
    return {
      ok: false as const,
      code: format.status,
      blockCode: format.blockCode,
      errorCategory: format.errorCategory,
    };
  }

  const record = await saveStoredKey({
    id: input.id,
    label: input.label,
    provider: input.provider,
    value: normalized,
    enabled: input.enabled,
    environment: input.environment,
    status: resolveKeyPresentStatus(input.provider),
    errorCategory: null,
  });

  return { ok: true as const, key: toPublicKeyRecord(record) };
}

export async function disableKeySafe(id: string) {
  assertServerSideSecretsSafe();
  const key = await patchStoredKey(id, {
    enabled: false,
    status: "KEY_DISABLED",
    errorCategory: "disabled_by_user",
  });
  if (!key) return { ok: false as const, message: "Key not found" };
  return { ok: true as const, key: toPublicKeyRecord(key) };
}

export async function enableKeySafe(id: string) {
  assertServerSideSecretsSafe();
  const existing = await getStoredKey(id);
  if (!existing) return { ok: false as const, message: "Key not found" };
  const key = await patchStoredKey(id, {
    enabled: true,
    status: resolveKeyPresentStatus(existing.provider),
    errorCategory: null,
  });
  if (!key) return { ok: false as const, message: "Key not found" };
  return { ok: true as const, key: toPublicKeyRecord(key) };
}

export async function removeKeySafe(id: string) {
  assertServerSideSecretsSafe();
  const removed = await deleteStoredKey(id);
  return { ok: removed };
}

export async function updateKeyLabelSafe(id: string, label: string) {
  assertServerSideSecretsSafe();
  const key = await patchStoredKey(id, { label });
  if (!key) return { ok: false as const, message: "Key not found" };
  return { ok: true as const, key: toPublicKeyRecord(key) };
}

async function patchKalshiPairTestResult(input: {
  environment: "demo" | "prod";
  result: Awaited<ReturnType<typeof testKalshiCredentialPair>>;
}) {
  const apiProvider = kalshiApiProvider(input.environment);
  const privateProvider = kalshiPrivateProvider(input.environment);
  const keys = await listPublicKeys();
  const apiMeta = keys.find((k) => k.provider === apiProvider && k.enabled);
  const privMeta = keys.find((k) => k.provider === privateProvider && k.enabled);
  const testedAt = new Date().toISOString();
  const status = input.result.ok ? "KALSHI_AUTH_TEST_PASSED" : "KALSHI_AUTH_TEST_FAILED";
  const errorCategory = input.result.ok ? null : input.result.errorCategory ?? null;

  if (apiMeta) {
    await patchStoredKey(apiMeta.id, {
      status,
      lastTestedAt: testedAt,
      quotaStatus: input.result.quotaStatus ?? null,
      errorCategory,
    });
  }
  if (privMeta) {
    await patchStoredKey(privMeta.id, {
      status,
      lastTestedAt: testedAt,
      quotaStatus: input.result.quotaStatus ?? null,
      errorCategory,
    });
  }
}

export async function testKalshiPairSafe(environment: "demo" | "prod") {
  assertServerSideSecretsSafe();

  const keys = await listPublicKeys();
  const apiProvider = kalshiApiProvider(environment);
  const privateProvider = kalshiPrivateProvider(environment);
  const apiMeta = keys.find((k) => k.provider === apiProvider && k.enabled);
  const privMeta = keys.find((k) => k.provider === privateProvider && k.enabled);

  if (!apiMeta || !privMeta) {
    return {
      ok: false,
      status: "KALSHI_AUTH_TEST_FAILED" as const,
      message: "Kalshi credential pair incomplete — save both API key and private key",
      errorCategory: KEY_BLOCK_CODES.KALSHI_KEY_PAIR_INCOMPLETE,
      environment,
      pairStatus: pairConfiguredStatus(environment),
      quotaStatus: null,
    };
  }

  if (
    providerEnvironment(apiMeta.provider) !== environment ||
    providerEnvironment(privMeta.provider) !== environment
  ) {
    return {
      ok: false,
      status: "KALSHI_AUTH_TEST_FAILED" as const,
      message: "Demo/production environment mismatch in saved Kalshi keys",
      errorCategory: KEY_BLOCK_CODES.DEMO_PROD_KEY_MISMATCH,
      environment,
      pairStatus: pairConfiguredStatus(environment),
      quotaStatus: null,
    };
  }

  await patchStoredKey(apiMeta.id, { status: "TEST_PENDING", errorCategory: "testing" });
  await patchStoredKey(privMeta.id, { status: "TEST_PENDING", errorCategory: "testing" });

  const allSecrets = await getDecryptedSecretsMap();
  const result = await testKalshiCredentialPair({
    environment,
    apiKey: allSecrets.get(apiProvider),
    privateKeyPem: allSecrets.get(privateProvider),
  });

  await patchKalshiPairTestResult({ environment, result });

  return result;
}

export async function testKeySafe(id: string) {
  assertServerSideSecretsSafe();
  const secretValue = await getDecryptedSecret(id);
  if (!secretValue) {
    return {
      ok: false,
      status: "KEY_MISSING" as const,
      message: "Key not found",
      errorCategory: "missing_key",
    };
  }

  const keys = await listPublicKeys();
  const meta = keys.find((k) => k.id === id);
  if (!meta) {
    return {
      ok: false,
      status: "KEY_MISSING" as const,
      message: "Key not found",
      errorCategory: "missing_key",
    };
  }

  if (!meta.enabled) {
    return {
      ok: false,
      status: "KEY_DISABLED" as const,
      message: "Key disabled",
      errorCategory: "disabled",
    };
  }

  if (meta.provider.startsWith("kalshi_")) {
    const environment = meta.provider.startsWith("kalshi_demo") ? "demo" : "prod";
    return {
      ok: false,
      status: "KALSHI_AUTH_TEST_FAILED" as const,
      message: "Kalshi keys must be tested together — use Test Kalshi Pair",
      errorCategory: KEY_BLOCK_CODES.KALSHI_KEY_PAIR_INCOMPLETE,
      environment,
      quotaStatus: null,
    };
  }

  await patchStoredKey(id, { status: "TEST_PENDING", errorCategory: "testing" });

  const allSecrets = await getDecryptedSecretsMap();
  const result = await testProviderKey({
    provider: meta.provider,
    secretValue,
    allSecrets,
  });

  await patchStoredKey(id, {
    status: result.status,
    lastTestedAt: new Date().toISOString(),
    quotaStatus: result.quotaStatus ?? null,
    errorCategory: result.errorCategory ?? null,
  });

  return result;
}

export async function getKeyReadinessReport() {
  assertServerSideSecretsSafe();
  const keys = await listPublicKeys();
  const config = getAppConfigReport();

  const hasDemoApi =
    keys.some((k) => k.provider === "kalshi_demo_api" && k.enabled) ||
    Boolean(getEnvSecret("KALSHI_DEMO_API_KEY"));
  const hasDemoPrivate =
    keys.some((k) => k.provider === "kalshi_demo_private" && k.enabled) ||
    Boolean(getEnvSecret("KALSHI_DEMO_PRIVATE_KEY"));
  const hasProdApi =
    keys.some((k) => k.provider === "kalshi_prod_api" && k.enabled) ||
    Boolean(getEnvSecret("KALSHI_PROD_API_KEY"));
  const hasProdPrivate =
    keys.some((k) => k.provider === "kalshi_prod_private" && k.enabled) ||
    Boolean(getEnvSecret("KALSHI_PROD_PRIVATE_KEY"));
  const hasOdds =
    keys.some((k) => k.provider === "odds_api" && k.enabled) ||
    Boolean(getEnvSecret("ODDS_API_KEY"));

  return {
    kalshiDemoConfigured: hasDemoApi && hasDemoPrivate,
    kalshiProdConfigured: hasProdApi && hasProdPrivate,
    oddsConfigured: hasOdds,
    kalshiPairs: {
      demo: summarizeKalshiPair(keys, "demo"),
      prod: summarizeKalshiPair(keys, "prod"),
    },
    config,
    blockers: [
      !hasOdds ? KEY_BLOCK_CODES.ODDS_API_KEY_MISSING : null,
      !hasProdApi ? KEY_BLOCK_CODES.KALSHI_PROD_KEY_MISSING : null,
      !hasProdPrivate ? KEY_BLOCK_CODES.KALSHI_PRIVATE_KEY_MISSING : null,
      config.secretSafety === "EXPOSED_BY_MISTAKE"
        ? KEY_BLOCK_CODES.SECRET_EXPOSED_CLIENT_SIDE
        : null,
    ].filter(Boolean),
  };
}

export { assertProviderEnvironmentMatch };
