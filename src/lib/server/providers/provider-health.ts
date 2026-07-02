import "server-only";

import { getAppConfigReport } from "@/lib/core/config";
import type { ProviderHealthColor } from "@/lib/core/contracts";
import { ODDS_API_CONTRACT } from "@/lib/core/contracts";
import { KalshiClient } from "@/lib/core/kalshi-client";
import type { KalshiCredentials, KalshiEnvironment } from "@/lib/core/kalshi-auth";
import { getOddsQuotaState, oddsApiClient } from "@/lib/core/odds-client";
import { isAllowedOddsSportKey } from "@/lib/core/market-types";
import { getDecryptedSecretsMap } from "@/lib/server/keys/key-store";
import { getKeyReadinessReport } from "@/lib/server/keys/key-service";
import { getAppState } from "@/lib/storage/store";
import { listSupportedOddsSportKeys } from "@/lib/server/opportunities/sport-mapping";

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

export async function resolveProductionKalshiClient(): Promise<{
  client: KalshiClient;
  creds: KalshiCredentials | null;
  configured: boolean;
}> {
  const creds = await resolveKalshiCredentials("prod");
  return {
    creds,
    configured: creds != null,
    client: creds ? new KalshiClient(creds, "prod") : KalshiClient.withoutCredentials("prod"),
  };
}

async function buildOddsDiagnostics() {
  const sportsRes = await oddsApiClient.getSports();
  const quota = getOddsQuotaState();

  if (!sportsRes.ok) {
    return {
      status: "NOT_USABLE",
      authStatus: sportsRes.error.category === "auth" ? "AUTH_FAILED" : "NOT_CONFIGURED",
      quota,
      sportsAvailable: 0,
      sportsScanned: [] as string[],
      eventsReturned: 0,
      bookmakersReturned: 0,
      usableMarkets: 0,
      failureReason:
        sportsRes.error.category === "auth"
          ? "ODDS_API_AUTH_FAILED"
          : sportsRes.error.category === "network"
            ? "ODDS_API_NETWORK_ERROR"
            : "ODDS_API_NOT_CONFIGURED",
    };
  }

  const activeSports = sportsRes.data
    .filter((s) => s.active)
    .map((s) => s.key)
    .filter((key) => isAllowedOddsSportKey(key));

  let eventsReturned = 0;
  let bookmakersReturned = 0;
  let usableMarkets = 0;
  const sportsScanned: string[] = [];
  let failureReason: string | null = null;

  for (const sportKey of activeSports.slice(0, 8)) {
    const oddsRes = await oddsApiClient.getOdds(sportKey, {
      regions: "us",
      markets: "h2h",
      oddsFormat: "american",
    });
    sportsScanned.push(sportKey);
    if (!oddsRes.ok) {
      failureReason = failureReason ?? "ODDS_API_FETCH_FAILED";
      continue;
    }
    const events = oddsRes.data.filter((e) => typeof e === "object" && e !== null) as Record<
      string,
      unknown
    >[];
    eventsReturned += events.length;
    if (events.length === 0) {
      failureReason = failureReason ?? "ODDS_API_NO_EVENTS";
      continue;
    }
    for (const event of events) {
      const bookmakers = Array.isArray(event.bookmakers) ? event.bookmakers : [];
      if (bookmakers.length === 0) {
        failureReason = failureReason ?? "ODDS_API_NO_BOOKMAKERS";
        continue;
      }
      bookmakersReturned += bookmakers.length;
      usableMarkets += 1;
    }
  }

  const authStatus = "AUTH_OK";
  const status =
    eventsReturned > 0 && bookmakersReturned > 0 && usableMarkets > 0
      ? "USABLE"
      : "NOT_USABLE";

  return {
    status,
    authStatus,
    quota,
    sportsAvailable: sportsRes.data.length,
    sportsScanned,
    eventsReturned,
    bookmakersReturned,
    usableMarkets,
    failureReason:
      status === "USABLE"
        ? null
        : failureReason ?? (quota.status === "EXHAUSTED" ? "ODDS_API_QUOTA_EXHAUSTED" : "ODDS_API_NOT_USABLE"),
    supportedSportKeys: listSupportedOddsSportKeys(),
    contractBasePath: ODDS_API_CONTRACT.basePath,
  };
}

export async function buildProviderHealthReport(options?: { probeOdds?: boolean }) {
  const config = getAppConfigReport();
  const appState = await getAppState();
  const prodCreds = await resolveKalshiCredentials("prod");
  const activeEnv: KalshiEnvironment = "prod";
  const creds = prodCreds;
  const kalshi = creds ? new KalshiClient(creds, activeEnv) : KalshiClient.withoutCredentials(activeEnv);
  const readiness = await getKeyReadinessReport();

  const prodPair = readiness.kalshiPairs.prod;

  const [exchange, balance, positions] = await Promise.all([
    kalshi.getExchangeStatus(),
    creds ? kalshi.getBalance() : Promise.resolve({ ok: false as const, error: { provider: "kalshi" as const, category: "not_configured" as const, message: "PROVIDER_NOT_CONFIGURED" }, status: 401 }),
    creds ? kalshi.getPositions(20) : Promise.resolve({ ok: false as const, error: { provider: "kalshi" as const, category: "not_configured" as const, message: "PROVIDER_NOT_CONFIGURED" }, status: 401 }),
  ]);

  const oddsDiagnostics = options?.probeOdds
    ? await buildOddsDiagnostics()
    : {
        status: readiness.oddsConfigured ? "NOT_RUN" : "NOT_CONFIGURED",
        authStatus: readiness.oddsConfigured ? "KEY_CONFIGURED" : "NOT_CONFIGURED",
        quota: getOddsQuotaState(),
        sportsAvailable: 0,
        sportsScanned: [] as string[],
        eventsReturned: 0,
        bookmakersReturned: 0,
        usableMarkets: 0,
        failureReason: readiness.oddsConfigured ? null : "ODDS_API_KEY_MISSING",
        supportedSportKeys: listSupportedOddsSportKeys(),
        contractBasePath: ODDS_API_CONTRACT.basePath,
      };

  const kalshiKeyPairStatus = !creds
    ? "PROVIDER_NOT_CONFIGURED"
    : prodPair.pairStatus === "KALSHI_AUTH_TEST_PASSED"
      ? "KALSHI_KEY_PAIR_PASSED"
      : prodPair.pairComplete
        ? prodPair.pairStatus
        : "KALSHI_KEY_PAIR_INCOMPLETE";

  const kalshiBalanceStatus = !creds
    ? "NOT_CHECKED"
    : balance.ok
      ? "KALSHI_BALANCE_OK"
      : "KALSHI_BALANCE_FAILED";

  const keyPairPassed = prodPair.pairStatus === "KALSHI_AUTH_TEST_PASSED";
  let kalshiAuthStatus: string;
  if (!creds) {
    kalshiAuthStatus = "PROVIDER_NOT_CONFIGURED";
  } else if (keyPairPassed && balance.ok) {
    kalshiAuthStatus = "KALSHI_CONNECTED";
  } else if (keyPairPassed) {
    kalshiAuthStatus = "KALSHI_KEY_PAIR_PASSED";
  } else if (prodPair.pairStatus === "KALSHI_AUTH_TEST_FAILED") {
    kalshiAuthStatus = "KALSHI_AUTH_TEST_FAILED";
  } else if (!prodPair.pairComplete) {
    kalshiAuthStatus = "KALSHI_KEY_PAIR_INCOMPLETE";
  } else {
    kalshiAuthStatus = "KALSHI_AUTH_UNTESTED";
  }

  if (
    !keyPairPassed &&
    !balance.ok &&
    !exchange.ok &&
    prodPair.pairComplete &&
    prodPair.pairStatus === "KALSHI_AUTH_TEST_FAILED"
  ) {
    kalshiAuthStatus = "AUTH_FAILED";
  }

  const kalshiExchangeStatus = exchange.ok
    ? exchange.data.trading_active
      ? "TRADING_ACTIVE"
      : "EXCHANGE_UP_TRADING_DOWN"
    : "UNREACHABLE";
  const oddsConfigured = readiness.oddsConfigured;
  const oddsUsable = oddsDiagnostics.status === "USABLE";
  const scoreAvailability = "UNCONFIRMED — SCORE_COVERAGE_UNSUPPORTED";

  let executionReadiness: ProviderHealthColor = "RED";
  if (creds && exchange.ok && balance.ok) {
    executionReadiness = oddsUsable && oddsDiagnostics.quota.status !== "EXHAUSTED" ? "GREEN" : "YELLOW";
  } else if (exchange.ok || oddsConfigured) {
    executionReadiness = "YELLOW";
  }

  return {
    keyStatus: creds ? "CONFIGURED" : "NOT_CONFIGURED",
    secretScanStatus: config.secretSafety,
    kalshiAuthStatus,
    kalshiKeyPairStatus,
    kalshiBalanceStatus,
    kalshiMode: "PRODUCTION",
    kalshiExchangeStatus,
    kalshiAccountStatus: balance.ok ? "ACCOUNT_OK" : kalshiBalanceStatus,
    kalshiWebSocketStatus: "DISCONNECTED",
    kalshiOrderbookAvailability: exchange.ok ? "REST_AVAILABLE" : "UNAVAILABLE",
    oddsApiQuota: oddsDiagnostics.quota,
    oddsApiOddsFreshness: oddsUsable ? "USABLE" : "NOT_USABLE",
    oddsApiScoreAvailability: scoreAvailability,
    oddsDiagnostics,
    providerErrorCategory:
      !exchange.ok && "error" in exchange
        ? exchange.error.category
        : oddsDiagnostics.failureReason,
    executionReadiness,
    executionReadinessNote:
      executionReadiness === "GREEN"
        ? "Kalshi connected with validated Odds edge path available"
        : executionReadiness === "YELLOW"
          ? creds && exchange.ok && balance.ok
            ? "Kalshi-only review mode — Odds edge optional until requested"
            : "Watch/display only — missing production Kalshi pair"
          : "Execution blocked",
    autoStatus: appState.executionMode === "AUTO" ? "AUTO_SELECTED" : "AUTO_SELECTABLE",
    profitabilityStatus: "UNPROVEN",
    kalshi: {
      exchange: exchange.ok ? exchange.data : null,
      balance: balance.ok ? { balance: balance.data.balance } : null,
      positions: positions.ok ? positions.data : null,
    },
    odds: {
      sportsCount: oddsDiagnostics.sportsAvailable,
      quota: oddsDiagnostics.quota,
      diagnostics: oddsDiagnostics,
    },
  };
}

export async function buildGamesResponse(sport?: string) {
  const readiness = await getKeyReadinessReport();
  const health = await buildProviderHealthReport();

  if (!readiness.oddsConfigured) {
    return {
      dataLabel: "PROVIDER_NOT_CONFIGURED",
      providerStatus: "PROVIDER_NOT_CONFIGURED",
      message: "Odds API key missing — add in Settings",
      primaryBlocker: "Odds API key not configured",
      nextAction: "Add Odds API key in Settings → API Keys",
      items: [],
    };
  }

  if (health.oddsDiagnostics.status !== "USABLE") {
    return {
      dataLabel: "NO_REAL_DATA_CONNECTED",
      providerStatus: health.oddsDiagnostics.status,
      message: health.oddsDiagnostics.failureReason ?? "Odds API not usable",
      primaryBlocker: health.oddsDiagnostics.failureReason ?? "ODDS_API_NOT_USABLE",
      nextAction: "Verify Odds API key and quota in Settings",
      items: [],
    };
  }

  const sportsToFetch = sport
    ? [sport]
    : (health.oddsDiagnostics.supportedSportKeys as string[] | undefined) ??
      listSupportedOddsSportKeys().slice();

  const items: Array<{
    id: string | null;
    sportKey: string | null;
    commenceTime: string | null;
    homeTeam: string | null;
    awayTeam: string | null;
    live: boolean;
  }> = [];

  for (const sportKey of sportsToFetch) {
    const odds = await oddsApiClient.getEvents(sportKey);
    if (!odds.ok) continue;
    const events = Array.isArray(odds.data) ? odds.data : [];
    for (const e of events) {
      if (typeof e !== "object" || e === null) continue;
      const row = e as Record<string, unknown>;
      const commenceTime =
        typeof row.commence_time === "string" ? row.commence_time : null;
      const live = commenceTime ? Date.parse(commenceTime) < Date.now() : false;
      items.push({
        id: typeof row.id === "string" ? row.id : null,
        sportKey: typeof row.sport_key === "string" ? row.sport_key : sportKey,
        commenceTime,
        homeTeam: typeof row.home_team === "string" ? row.home_team : null,
        awayTeam: typeof row.away_team === "string" ? row.away_team : null,
        live,
      });
    }
  }

  const liveCount = items.filter((i) => i.live).length;

  return {
    dataLabel: items.length > 0 ? "LIVE_PROVIDER_DATA" : "NO_MATCHES_FOUND",
    providerStatus: "CONNECTED",
    message:
      items.length > 0
        ? `${items.length} events (${liveCount} live) from Odds API across ${sportsToFetch.length} sport(s)`
        : "Odds API connected but no events returned for requested sports",
    primaryBlocker: items.length === 0 ? "odds_api_no_events" : null,
    nextAction:
      items.length === 0
        ? "Check Odds API sport coverage or try again closer to game time"
        : "Use Kalshi Markets → Find sportsbook edge for Odds matching",
    sport: sport ?? "all_supported",
    count: items.length,
    liveCount,
    items,
  };
}

export async function buildPortfolioResponse() {
  const creds = await resolveKalshiCredentials("prod");
  if (!creds) {
    return {
      providerStatus: "PROVIDER_NOT_CONFIGURED",
      balance: null,
      positions: [],
      environment: "prod" as const,
    };
  }
  const client = new KalshiClient(creds, "prod");
  const [balance, positions] = await Promise.all([
    client.getBalance(),
    client.getPositions(50),
  ]);
  return {
    providerStatus: balance.ok ? "CONNECTED" : "ERROR",
    environment: "prod" as const,
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
        note: "Sanitized Kalshi production balance",
      },
      environment: portfolio.environment,
      openTrades: Array.isArray(portfolio.positions) ? portfolio.positions.length : 0,
    };
  }
  return null;
}
