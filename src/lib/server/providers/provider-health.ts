import "server-only";
import { getAppConfigReport } from "@/lib/core/config";
import type { ProviderHealthColor } from "@/lib/core/contracts";
import { KalshiClient } from "@/lib/core/kalshi-client";
import type { KalshiCredentials, KalshiEnvironment } from "@/lib/core/kalshi-auth";
import { getOddsQuotaState, oddsApiClient } from "@/lib/core/odds-client";
import { getDecryptedSecretsMap } from "@/lib/server/keys/key-store";
import { getAppState } from "@/lib/storage/store";

export async function resolveKalshiCredentials(
  environment: KalshiEnvironment
): Promise<KalshiCredentials | null> {
  const secrets = await getDecryptedSecretsMap();
  const apiProvider =
    environment === "demo" ? "kalshi_demo_api" : "kalshi_prod_api";
  const privateProvider =
    environment === "demo" ? "kalshi_demo_private" : "kalshi_prod_private";

  const apiKeyId = secrets.get(apiProvider);
  const privateKeyPem = secrets.get(privateProvider);
  if (!apiKeyId || !privateKeyPem) return null;

  return { apiKeyId, privateKeyPem, environment };
}

export async function buildProviderHealthReport() {
  const config = getAppConfigReport();
  const appState = await getAppState();
  const demoCreds = await resolveKalshiCredentials("demo");
  const prodCreds = await resolveKalshiCredentials("prod");
  const activeEnv: KalshiEnvironment = prodCreds ? "prod" : demoCreds ? "demo" : "demo";
  const creds = prodCreds ?? demoCreds;
  const kalshi = creds ? new KalshiClient(creds, activeEnv) : KalshiClient.withoutCredentials(activeEnv);

  const [exchange, balance, positions, oddsSports, quota] = await Promise.all([
    kalshi.getExchangeStatus(),
    creds ? kalshi.getBalance() : Promise.resolve({ ok: false as const, error: { provider: "kalshi" as const, category: "not_configured" as const, message: "PROVIDER_NOT_CONFIGURED" }, status: 401 }),
    creds ? kalshi.getPositions(20) : Promise.resolve({ ok: false as const, error: { provider: "kalshi" as const, category: "not_configured" as const, message: "PROVIDER_NOT_CONFIGURED" }, status: 401 }),
    oddsApiClient.getSports(),
    Promise.resolve(getOddsQuotaState()),
  ]);

  const kalshiAuthStatus = creds
    ? balance.ok
      ? "AUTH_OK"
      : "AUTH_FAILED"
    : "PROVIDER_NOT_CONFIGURED";
  const kalshiExchangeStatus = exchange.ok
    ? exchange.data.trading_active
      ? "TRADING_ACTIVE"
      : "EXCHANGE_UP_TRADING_DOWN"
    : "UNREACHABLE";
  const oddsConfigured = oddsSports.ok;
  const oddsFreshness = oddsConfigured ? "READY_FOR_FETCH" : "NOT_CONFIGURED";
  const scoreAvailability = "UNCONFIRMED — SCORE_COVERAGE_UNSUPPORTED";

  let executionReadiness: ProviderHealthColor = "RED";
  if (creds && exchange.ok && balance.ok && oddsConfigured && quota.status !== "EXHAUSTED") {
    executionReadiness = "GREEN";
  } else if (exchange.ok || oddsConfigured) {
    executionReadiness = "YELLOW";
  }

  return {
    keyStatus: creds || oddsConfigured ? "CONFIGURED" : "NOT_CONFIGURED",
    secretScanStatus: config.secretSafety,
    kalshiAuthStatus,
    kalshiMode: activeEnv.toUpperCase(),
    kalshiExchangeStatus,
    kalshiAccountStatus: balance.ok ? "ACCOUNT_OK" : kalshiAuthStatus,
    kalshiWebSocketStatus: "DISCONNECTED",
    kalshiOrderbookAvailability: exchange.ok ? "REST_AVAILABLE" : "UNAVAILABLE",
    oddsApiQuota: quota,
    oddsApiOddsFreshness: oddsFreshness,
    oddsApiScoreAvailability: scoreAvailability,
    providerErrorCategory:
      !exchange.ok && "error" in exchange
        ? exchange.error.category
        : !oddsSports.ok && "error" in oddsSports
          ? oddsSports.error.category
          : null,
    executionReadiness,
    executionReadinessNote:
      executionReadiness === "GREEN"
        ? "Eligible for per-trade validation — not auto-execute"
        : executionReadiness === "YELLOW"
          ? "Watch/display only"
          : "Execution blocked",
    autoStatus: appState.executionMode === "AUTO" ? "AUTO_SELECTED" : "AUTO_SELECTABLE",
    profitabilityStatus: "UNPROVEN",
    kalshi: {
      exchange: exchange.ok ? exchange.data : null,
      balance: balance.ok ? { balance: balance.data.balance } : null,
      positions: positions.ok ? positions.data : null,
    },
    odds: {
      sportsCount: oddsSports.ok ? oddsSports.data.length : 0,
      quota,
    },
  };
}

export async function buildGamesResponse(sport = "basketball_nba") {
  const odds = await oddsApiClient.getEvents(sport);
  if (!odds.ok) {
    return {
      dataLabel: "NO_REAL_DATA_CONNECTED",
      providerStatus: odds.error.message,
      items: [],
      errorCategory: odds.error.category,
    };
  }

  const events = Array.isArray(odds.data) ? odds.data : [];
  return {
    dataLabel: "LIVE_PROVIDER_DATA",
    providerStatus: "CONNECTED",
    sport,
    count: events.length,
    items: events
      .filter((e) => typeof e === "object" && e !== null)
      .map((e) => {
        const row = e as Record<string, unknown>;
        return {
          id: typeof row.id === "string" ? row.id : null,
          sportKey: typeof row.sport_key === "string" ? row.sport_key : sport,
          commenceTime:
            typeof row.commence_time === "string" ? row.commence_time : null,
          homeTeam: typeof row.home_team === "string" ? row.home_team : null,
          awayTeam: typeof row.away_team === "string" ? row.away_team : null,
        };
      }),
  };
}

export async function buildPortfolioResponse() {
  const creds = (await resolveKalshiCredentials("prod")) ??
    (await resolveKalshiCredentials("demo"));
  if (!creds) {
    return {
      providerStatus: "PROVIDER_NOT_CONFIGURED",
      balance: null,
      positions: [],
    };
  }
  const client = new KalshiClient(creds, creds.environment);
  const [balance, positions] = await Promise.all([
    client.getBalance(),
    client.getPositions(50),
  ]);
  return {
    providerStatus: balance.ok ? "CONNECTED" : "ERROR",
    environment: creds.environment,
    balance: balance.ok ? { value: balance.data.balance } : null,
    positions: positions.ok ? positions.data.positions : [],
    errorCategory: balance.ok ? null : balance.error.category,
  };
}

export async function buildAccountResponseFromProviders() {
  const portfolio = await buildPortfolioResponse();
  if (portfolio.balance) {
    return {
      dataLabel: "LIVE_PROVIDER_DATA",
      bankroll: {
        label: "KALSHI_BALANCE",
        value: portfolio.balance.value,
        note: "Sanitized Kalshi balance — cents/fixed-point normalization pending",
      },
      environment: portfolio.environment,
      openTrades: Array.isArray(portfolio.positions) ? portfolio.positions.length : 0,
    };
  }
  return null;
}
