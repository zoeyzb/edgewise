import { ODDS_API_CONTRACT } from "@/lib/core/contracts";
import type { SecureKeyStatus } from "@/lib/core/key-constants";

const ODDS_API_BASE = `${ODDS_API_CONTRACT.origin}${ODDS_API_CONTRACT.basePath}`;

export async function testOddsApiKey(apiKey: string): Promise<{
  ok: boolean;
  status: SecureKeyStatus;
  message: string;
  errorCategory?: string;
  quotaStatus?: string | null;
}> {
  try {
    const url = `${ODDS_API_BASE}/sports/?apiKey=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url);
    const remaining = res.headers.get("x-requests-remaining");
    const quotaStatus = remaining ? `remaining:${remaining}` : null;

    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        status: "KEY_EXPIRED_OR_REVOKED",
        message: "Odds API authentication failed",
        errorCategory: "auth_rejected",
        quotaStatus,
      };
    }

    if (res.status === 429) {
      return {
        ok: false,
        status: "KEY_QUOTA_EXHAUSTED",
        message: "Odds API quota exhausted",
        errorCategory: "quota_exhausted",
        quotaStatus,
      };
    }

    if (!res.ok) {
      return {
        ok: false,
        status: "KEY_PERMISSION_ERROR",
        message: `Odds API test failed with status ${res.status}`,
        errorCategory: "auth_http_error",
        quotaStatus,
      };
    }

    if (remaining !== null && Number(remaining) <= 50) {
      return {
        ok: true,
        status: "KEY_QUOTA_LOW",
        message: "Odds API authenticated — quota low",
        errorCategory: "quota_low",
        quotaStatus,
      };
    }

    return {
      ok: true,
      status: "ODDS_API_CONFIGURED",
      message: "Odds API authentication succeeded",
      quotaStatus,
    };
  } catch {
    return {
      ok: false,
      status: "KEY_PERMISSION_ERROR",
      message: "Odds API test network error",
      errorCategory: "network_error",
    };
  }
}
