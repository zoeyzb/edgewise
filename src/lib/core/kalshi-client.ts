import "server-only";
import { KALSHI_CONTRACT, PROVIDER_BLOCK_CODES } from "@/lib/core/contracts";
import type { SanitizedProviderError } from "@/lib/core/contracts";
import {
  buildKalshiAuthHeaders,
  kalshiRestOrigin,
  sanitizeKalshiError,
  sanitizeKalshiErrorResponseBody,
  type KalshiCredentials,
  type KalshiEnvironment,
} from "@/lib/core/kalshi-auth";
import {
  reconstructExecutableOrderbook,
  validateBalance,
  validateExchangeStatus,
  validateMarketsResponse,
  validateOrderbookFp,
} from "@/lib/core/validators";
import { assertServerOnlyOperation } from "@/lib/server/boundary";

const DEFAULT_ORDERBOOK_MAX_AGE_MS = 5_000;

export class KalshiClient {
  constructor(
    private readonly credentials: KalshiCredentials | null,
    private readonly environment: KalshiEnvironment = "demo"
  ) {}

  static withoutCredentials(environment: KalshiEnvironment = "demo") {
    return new KalshiClient(null, environment);
  }

  private origin() {
    return kalshiRestOrigin(this.environment);
  }

  private async request<T>(
    method: "GET" | "POST" | "DELETE",
    path: string,
    options?: {
      auth?: boolean;
      query?: Record<string, string | number | undefined>;
      body?: unknown;
    }
  ): Promise<
    | { ok: true; data: T; status: number }
    | { ok: false; error: SanitizedProviderError; status: number }
  > {
    assertServerOnlyOperation("provider_keys");
    const query = options?.query ?? {};
    const queryString = Object.entries(query)
      .filter(([, v]) => v !== undefined && v !== "")
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join("&");
    const pathWithQuery = queryString ? `${path}?${queryString}` : path;
    const url = `${this.origin()}${pathWithQuery}`;

    const headers: Record<string, string> = { Accept: "application/json" };
    if (options?.auth) {
      if (!this.credentials) {
        return {
          ok: false,
          status: 401,
          error: {
            provider: "kalshi",
            category: "not_configured",
            message: PROVIDER_BLOCK_CODES.PROVIDER_NOT_CONFIGURED,
          },
        };
      }
      Object.assign(
        headers,
        buildKalshiAuthHeaders({
          credentials: this.credentials,
          method,
          pathWithOptionalQuery: pathWithQuery.startsWith("/")
            ? pathWithQuery
            : `/${pathWithQuery}`,
        })
      );
    }

    try {
      const res = await fetch(url, {
        method,
        headers,
        body: options?.body != null ? JSON.stringify(options.body) : undefined,
        cache: "no-store",
      });
      const text = await res.text();
      let json: unknown = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        return {
          ok: false,
          status: res.status,
          error: {
            provider: "kalshi",
            category: "validation",
            message: "Kalshi returned non-JSON response",
            httpStatus: res.status,
          },
        };
      }

      if (!res.ok) {
        const err = sanitizeKalshiError(res.status);
        const responseBody = sanitizeKalshiErrorResponseBody(json, text);
        return {
          ok: false,
          status: res.status,
          error: {
            provider: "kalshi",
            category: err.category,
            message: responseBody || err.message,
            httpStatus: res.status,
            responseBody,
          },
        };
      }

      return { ok: true, data: json as T, status: res.status };
    } catch {
      return {
        ok: false,
        status: 0,
        error: {
          provider: "kalshi",
          category: "network",
          message: "Kalshi network error",
        },
      };
    }
  }

  getExchangeStatus() {
    return this.request<unknown>("GET", KALSHI_CONTRACT.endpoints.exchangeStatus, {
      auth: false,
    }).then((res) => {
      if (!res.ok) return res;
      const validated = validateExchangeStatus(res.data);
      if (!validated.ok) return { ok: false as const, error: validated.error, status: res.status };
      return { ok: true as const, data: validated.data, status: res.status };
    });
  }

  getBalance() {
    return this.request<unknown>("GET", KALSHI_CONTRACT.endpoints.portfolioBalance, {
      auth: true,
    }).then((res) => {
      if (!res.ok) return res;
      const validated = validateBalance(res.data);
      if (!validated.ok) return { ok: false as const, error: validated.error, status: res.status };
      return { ok: true as const, data: validated.data, status: res.status };
    });
  }

  getPositions(limit = 100) {
    return this.request<{ market_positions?: unknown[]; event_positions?: unknown[] }>(
      "GET",
      KALSHI_CONTRACT.endpoints.portfolioPositions,
      { auth: true, query: { limit } }
    ).then((res) => {
      if (!res.ok) return res;
      const positions = Array.isArray(res.data.market_positions)
        ? res.data.market_positions
        : [];
      return { ok: true as const, data: { positions, count: positions.length }, status: res.status };
    });
  }

  searchMarkets(query: {
    status?: string;
    event_ticker?: string;
    series_ticker?: string;
    limit?: number;
    cursor?: string;
  }) {
    return this.request<unknown>("GET", KALSHI_CONTRACT.endpoints.markets, {
      auth: false,
      query: query,
    }).then((res) => {
      if (!res.ok) return res;
      const validated = validateMarketsResponse(res.data);
      if (!validated.ok) return { ok: false as const, error: validated.error, status: res.status };
      return {
        ok: true as const,
        data: { markets: validated.markets, cursor: validated.cursor },
        status: res.status,
      };
    });
  }

  getMarket(ticker: string) {
    const path = KALSHI_CONTRACT.endpoints.marketByTicker.replace("{ticker}", ticker);
    return this.request<{ market?: Record<string, unknown> }>("GET", path, { auth: false });
  }

  getOrderbook(ticker: string, depth = 10) {
    const path = KALSHI_CONTRACT.endpoints.marketOrderbook.replace("{ticker}", ticker);
    return this.request<unknown>("GET", path, {
      auth: false,
      query: { depth },
    }).then((res) => {
      if (!res.ok) return res;
      const validated = validateOrderbookFp(res.data);
      if (!validated.ok) return { ok: false as const, error: validated.error, status: res.status };
      const fetchedAtMs = Date.now();
      const executable = reconstructExecutableOrderbook({
        ticker,
        yesLevels: validated.yesLevels,
        noLevels: validated.noLevels,
        fetchedAtMs,
        maxAgeMs: DEFAULT_ORDERBOOK_MAX_AGE_MS,
        source: "REST",
      });
      return { ok: true as const, data: executable, status: res.status };
    });
  }

  getEvent(eventTicker: string) {
    const path = KALSHI_CONTRACT.endpoints.eventByTicker.replace(
      "{event_ticker}",
      eventTicker
    );
    return this.request<{ event?: Record<string, unknown> }>("GET", path, { auth: false });
  }

  /** Exists but blocked until execution gates pass — no real orders in Prompt 3. */
  placeOrder(input: Record<string, unknown>) {
    void input;
    assertServerOnlyOperation("order_placement");
    return Promise.resolve({
      ok: false as const,
      status: "EXECUTION_BLOCKED",
      reason: "EXECUTION_GATES_NOT_PASSED",
      orderPlaced: false,
      note: "Use submitLimitOrder via manual execution service after gates pass",
    });
  }

  submitLimitOrder(input: {
    ticker: string;
    side: "yes" | "no";
    action: "buy" | "sell";
    count: number;
    limitPriceDollars: string;
    clientOrderId: string;
  }) {
    assertServerOnlyOperation("order_placement");
    if (!this.credentials) {
      return Promise.resolve({
        ok: false as const,
        error: {
          provider: "kalshi" as const,
          category: "not_configured" as const,
          message: "PROVIDER_NOT_CONFIGURED",
        },
        status: 401,
      });
    }

    const body = {
      ticker: input.ticker,
      action: input.action,
      side: input.side,
      count: input.count,
      type: "limit",
      client_order_id: input.clientOrderId,
      ...(input.side === "yes"
        ? { yes_price_dollars: input.limitPriceDollars }
        : { no_price_dollars: input.limitPriceDollars }),
    };

    return this.request<{ order?: Record<string, unknown> }>(
      "POST",
      KALSHI_CONTRACT.endpoints.portfolioOrders,
      { auth: true, body }
    ).then((res) => {
      if (!res.ok) return res;
      const order = res.data.order;
      return {
        ok: true as const,
        status: res.status,
        data: {
          status: typeof order?.status === "string" ? order.status : "submitted",
          orderId: typeof order?.order_id === "string" ? order.order_id : null,
        },
      };
    });
  }
}

export async function createKalshiClientFromStore(
  environment: KalshiEnvironment,
  resolveCredentials: () => Promise<KalshiCredentials | null>
) {
  const credentials = await resolveCredentials();
  return credentials
    ? new KalshiClient(credentials, environment)
    : KalshiClient.withoutCredentials(environment);
}
