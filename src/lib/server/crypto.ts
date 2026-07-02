import "server-only";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";
import { getAppConfigReport } from "@/lib/core/config";
import { KEY_BLOCK_CODES } from "@/lib/core/key-constants";

const DEV_FALLBACK_SALT = "edgewise-dev-only-not-for-production";

function deriveKey(secret: string): Buffer {
  return scryptSync(secret, DEV_FALLBACK_SALT, 32);
}

function resolveEncryptionSecret(): { secret: string; mode: "env" | "dev_fallback" } {
  const envSecret = process.env.EDGEWISE_SECRET_KEY?.trim();
  if (envSecret && envSecret.length >= 16) {
    return { secret: envSecret, mode: "env" };
  }
  return { secret: "edgewise-dev-fallback-key", mode: "dev_fallback" };
}

export function getEncryptionMode(): "env" | "dev_fallback" {
  return resolveEncryptionSecret().mode;
}

export function encryptSecret(plaintext: string): string {
  const { secret } = resolveEncryptionSecret();
  const key = deriveKey(secret);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decryptSecret(payload: string): string {
  const { secret } = resolveEncryptionSecret();
  const key = deriveKey(secret);
  const [, ivB64, tagB64, dataB64] = payload.split(":");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Invalid encrypted payload format");
  }
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const data = Buffer.from(dataB64, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString("utf8");
}

export function assertServerSideSecretsSafe(): void {
  const report = getAppConfigReport();
  if (report.secretSafety === "EXPOSED_BY_MISTAKE") {
    throw new Error(KEY_BLOCK_CODES.SECRET_EXPOSED_CLIENT_SIDE);
  }
}
