import "server-only";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import type { KeyProvider } from "@/lib/core/types";
import type { SecureKeyStatus } from "@/lib/core/key-constants";
import { decryptSecret, encryptSecret } from "@/lib/server/crypto";

const DATA_DIR = path.join(process.cwd(), "data");
const KEYS_FILE = path.join(DATA_DIR, "keys.json");

export interface StoredKeyRecord {
  id: string;
  label: string;
  provider: KeyProvider;
  maskedPreview: string;
  encryptedValue: string;
  enabled: boolean;
  environment: "demo" | "prod" | "external";
  status: SecureKeyStatus;
  updatedAt: string;
  lastTestedAt: string | null;
  quotaStatus: string | null;
  errorCategory: string | null;
}

interface KeysStoreFile {
  keys: StoredKeyRecord[];
}

export function maskSecret(value: string): string {
  if (value.length <= 4) return "****";
  return `${value.slice(0, 4)}${"*".repeat(Math.min(12, value.length - 4))}${value.slice(-4)}`;
}

async function ensureDataDir() {
  await mkdir(DATA_DIR, { recursive: true });
}

async function readStore(): Promise<KeysStoreFile> {
  await ensureDataDir();
  try {
    const raw = await readFile(KEYS_FILE, "utf8");
    return JSON.parse(raw) as KeysStoreFile;
  } catch {
    return { keys: [] };
  }
}

async function writeStore(store: KeysStoreFile) {
  await ensureDataDir();
  await writeFile(KEYS_FILE, JSON.stringify(store, null, 2), "utf8");
}

export async function listStoredKeys(): Promise<StoredKeyRecord[]> {
  const store = await readStore();
  return store.keys;
}

export async function getStoredKey(id: string): Promise<StoredKeyRecord | null> {
  const store = await readStore();
  return store.keys.find((k) => k.id === id) ?? null;
}

export async function getDecryptedSecret(id: string): Promise<string | null> {
  const key = await getStoredKey(id);
  if (!key) return null;
  try {
    return decryptSecret(key.encryptedValue);
  } catch {
    return null;
  }
}

export async function getDecryptedSecretsMap(): Promise<Map<KeyProvider, string>> {
  const store = await readStore();
  const map = new Map<KeyProvider, string>();
  for (const key of store.keys) {
    if (!key.enabled || key.status === "KEY_DISABLED") continue;
    try {
      map.set(key.provider, decryptSecret(key.encryptedValue));
    } catch {
      // skip undecryptable entries
    }
  }
  return map;
}

export async function saveStoredKey(input: {
  id?: string;
  label: string;
  provider: KeyProvider;
  value: string;
  enabled?: boolean;
  environment: "demo" | "prod" | "external";
  status: SecureKeyStatus;
  errorCategory?: string | null;
}): Promise<StoredKeyRecord> {
  const store = await readStore();
  const now = new Date().toISOString();
  const id = input.id ?? `key_${Date.now()}`;
  const idx = store.keys.findIndex((k) => k.id === id);
  const previous = idx >= 0 ? store.keys[idx] : null;

  const record: StoredKeyRecord = {
    id,
    label: input.label,
    provider: input.provider,
    maskedPreview: maskSecret(input.value),
    encryptedValue: encryptSecret(input.value),
    enabled: input.enabled ?? true,
    environment: input.environment,
    status: input.status,
    updatedAt: now,
    lastTestedAt: previous?.lastTestedAt ?? null,
    quotaStatus: previous?.quotaStatus ?? null,
    errorCategory: input.errorCategory ?? null,
  };

  if (idx >= 0) store.keys[idx] = record;
  else store.keys.push(record);

  await writeStore(store);
  return record;
}

export async function patchStoredKey(
  id: string,
  patch: Partial<
    Pick<
      StoredKeyRecord,
      | "label"
      | "enabled"
      | "status"
      | "lastTestedAt"
      | "quotaStatus"
      | "errorCategory"
    >
  >
): Promise<StoredKeyRecord | null> {
  const store = await readStore();
  const idx = store.keys.findIndex((k) => k.id === id);
  if (idx < 0) return null;
  store.keys[idx] = {
    ...store.keys[idx],
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  await writeStore(store);
  return store.keys[idx];
}

export async function deleteStoredKey(id: string): Promise<boolean> {
  const store = await readStore();
  const next = store.keys.filter((k) => k.id !== id);
  if (next.length === store.keys.length) return false;
  await writeStore({ keys: next });
  return true;
}

export function toPublicKeyRecord(key: StoredKeyRecord) {
  return {
    id: key.id,
    label: key.label,
    provider: key.provider,
    maskedPreview: key.maskedPreview,
    enabled: key.enabled,
    environment: key.environment,
    status: key.status,
    updatedAt: key.updatedAt,
    lastTestedAt: key.lastTestedAt,
    quotaStatus: key.quotaStatus,
    errorCategory: key.errorCategory,
  };
}

export async function listPublicKeys() {
  const keys = await listStoredKeys();
  return keys.map(toPublicKeyRecord);
}
