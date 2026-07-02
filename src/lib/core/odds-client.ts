import "server-only";
import { ODDS_API_CONTRACT, PROVIDER_BLOCK_CODES } from "@/lib/core/contracts";
import type { ProviderQuotaSnapshot, SanitizedProviderError } from "@/lib/core/contracts";
import { getEnvSecret } from "@/lib/core/config";
import { oddsFreshnessFromLastUpdate, validateOddsSports } from "@/lib/core/validators";
import { getDecryptedSecretsMap } from "@/lib/server/keys/key-store";
import { assertServerOnlyOperation } from "@/lib/server/boundary";

const ODDS_ORIGIN = ODDS_API_CONTRACT.origin;
const DEFAULT_ODDS_MAX_AGE_MS = 120_000;
const BACKOFF_MS = 2_000;

export interface OddsQuotaState extends ProviderQuotaSnapshot {
  lastUpdatedAt: string | null;
  backoffUntil: string | null;
}

let quotaState: OddsQuotaState = {
  remaining: null,
  used: null,
  lastCost: null,
  status: "UNKNOWN",
  lastUpdatedAt: null,
  backoffUntil: null,
};

export function getOddsQuotaState() {
  return quotaState;
}

async function resolveOddsApiKey(): Promise<string | null> {
  const fromEnv = getEnvSecret("ODDS_API_KEY");
  if (fromEnv) return fromEnv;
  const secrets = await getDecryptedSecretsMap();
  return secrets.get("odds_api") ?? null;
}

function parseQuotaHeaders(headers: Headers): ProviderQuotaSnapshot {
  const remainingRaw = headers.get("x-requests-remaining");
  const usedRaw = headers.get("x-requests-used");
  const lastRaw = headers.get("x-requests-last");
  const remaining = remainingRaw !== null ? Number(remainingRaw) : null;
  const used = usedRaw !== null ? Number(usedRaw) : null;
  const lastCost = lastRaw !== null ? Number(lastRaw) : null;

  let status: ProviderQuotaSnapshot["status"] = "UNKNOWN";
  if (remaining === 0) status = "EXHAUSTED";
  else if (remaining !== null && remaining <= 50) status = "LOW";
  else if (remaining !== null) status = "OK";

  return { remaining, used, lastCost, status };
}

function updateQuota(headers: Headers) {
  const parsed = parseQuotaHeaders(headers);
  quotaState = {
    ...parsed,
    lastUpdatedAt: new Date().toISOString(),
    backoffUntil:
      parsed.status === "EXHAUSTED" ? new Date(Date.now() + BACKOFF_MS).toISOString() : null,
  };
}

function oddsError(
  status: number,
  message: string,
  category: SanitizedProviderError["category"]
) {
  return {
    ok: false as const,
    status,
    error: { provider: "odds_api" as const, category, message, httpStatus: status },
  };
}

async function oddsFetch(path: string, query: Record<string, string | number | undefined> = {}) {
  assertServerOnlyOperation("provider_keys");

  if (quotaState.backoffUntil && Date.parse(quotaState.backoffUntil) > Date.now()) {
    return oddsError(429, "Odds API backoff active", "rate_limit");
  }

  const apiKey = await resolveOddsApiKey();
  if (!apiKey) {
    return oddsError(401, PROVIDER_BLOCK_CODES.PROVIDER_NOT_CONFIGURED, "not_configured");
  }

  const params = new URLSearchParams({ apiKey });
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== "") params.set(k, String(v));
  }
  const url = `${ODDS_ORIGIN}${path}?${params.toString()}`;

  try {
    const res = await fetch(url, { cache: "no-store" });
    updateQuota(res.headers);

    if (res.status === 429) {
      quotaState.backoffUntil = new Date(Date.now() + BACKOFF_MS).toISOString();
      return oddsError(429, "Odds API rate limited", "rate_limit");
    }
    if (res.status === 401 || res.status === 403) {
      return oddsError(res.status, "Odds API authentication failed", "auth");
    }
    if (!res.ok) {
      return oddsError(res.status, `Odds API request failed (${res.status})`, "validation");
    }

    const json = (await res.json()) as unknown;
    return { ok: true as const, data: json, status: res.status, quota: getOddsQuotaState() };
  } catch {
    return oddsError(0, "Odds API network error", "network");
  }
}

export class OddsApiClient {
  getSports() {
    return oddsFetch(ODDS_API_CONTRACT.endpoints.sports).then((res) => {
      if (!res.ok) return res;
      const validated = validateOddsSports(res.data);
      if (!validated.ok) return { ok: false as const, error: validated.error, status: res.status };
      return {
        ok: true as const,
        data: validated.sports,
        status: res.status,
        quota: res.quota,
      };
    });
  }

  getEvents(sport: string) {
    return oddsFetch(ODDS_API_CONTRACT.endpoints.events.replace("{sport}", sport));
  }

  getOdds(
    sport: string,
    query?: { regions?: string; markets?: string; oddsFormat?: string; dateFormat?: string }
  ) {
    return oddsFetch(ODDS_API_CONTRACT.endpoints.odds.replace("{sport}", sport), query).then(
      (res) => {
        if (!res.ok) return res;
        const events = Array.isArray(res.data) ? res.data : [];
        const staleFlags = events.map((event) => {
          if (typeof event !== "object" || event === null) return { stale: true };
          const bookmakers = Array.isArray((event as Record<string, unknown>).bookmakers)
            ? ((event as Record<string, unknown>).bookmakers as unknown[])
            : [];
          if (bookmakers.length === 0) {
            return { stale: true, reason: "missing_bookmaker_data" };
          }
          const lastUpdates = bookmakers
            .filter((b) => typeof b === "object" && b !== null)
            .map((b) => (b as Record<string, unknown>).last_update)
            .filter((v): v is string => typeof v === "string");
          const freshest = lastUpdates
            .map((iso) => oddsFreshnessFromLastUpdate(iso, DEFAULT_ODDS_MAX_AGE_MS))
            .some((f) => f.fresh);
          return {
            stale: !freshest,
            reason: freshest ? null : PROVIDER_BLOCK_CODES.STALE_ODDS,
          };
        });
        return {
          ok: true as const,
          data: events,
          status: res.status,
          quota: res.quota,
          staleFlags,
        };
      }
    );
  }

  getScores(sport: string, daysFrom = 1) {
    return oddsFetch(ODDS_API_CONTRACT.endpoints.scores.replace("{sport}", sport), {
      daysFrom,
    }).then((res) => {
      if (!res.ok) {
        if (res.status === 404 || res.error.category === "validation") {
          return {
            ok: false as const,
            error: {
              provider: "odds_api" as const,
              category: "unsupported" as const,
              message: PROVIDER_BLOCK_CODES.SCORE_COVERAGE_UNSUPPORTED,
              httpStatus: res.status,
            },
            status: res.status,
          };
        }
        return res;
      }
      return {
        ok: true as const,
        data: Array.isArray(res.data) ? res.data : [],
        status: res.status,
        quota: res.quota,
      };
    });
  }

  getEventOdds(sport: string, eventId: string, query?: { regions?: string; markets?: string }) {
    const path = ODDS_API_CONTRACT.endpoints.eventOdds
      .replace("{sport}", sport)
      .replace("{eventId}", eventId);
    return oddsFetch(path, query);
  }

  getHistorical() {
    return Promise.resolve({
      ok: false as const,
      error: {
        provider: "odds_api" as const,
        category: "unsupported" as const,
        message: "UNCONFIRMED — NEEDS_PROVIDER_CONTRACT_VERIFICATION",
      },
      status: 501,
    });
  }
}

export const oddsApiClient = new OddsApiClient();
