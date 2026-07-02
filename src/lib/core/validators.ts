import "server-only";
import type {
  KalshiBalance,
  KalshiExchangeStatus,
  KalshiMarketSummary,
  KalshiOrderbookLevelFp,
  SanitizedProviderError,
} from "@/lib/core/contracts";
import { PROVIDER_BLOCK_CODES } from "@/lib/core/contracts";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseFixedPointLevel(value: unknown): KalshiOrderbookLevelFp | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const priceDollars = String(value[0]);
  const countFp = String(value[1]);
  if (!priceDollars || !countFp) return null;
  return { priceDollars, countFp };
}

export function validateExchangeStatus(payload: unknown):
  | { ok: true; data: KalshiExchangeStatus }
  | { ok: false; error: SanitizedProviderError } {
  if (!isRecord(payload)) {
    return validationError("Invalid exchange status payload");
  }
  if (typeof payload.exchange_active !== "boolean") {
    return validationError("Missing exchange_active");
  }
  if (typeof payload.trading_active !== "boolean") {
    return validationError("Missing trading_active");
  }
  return {
    ok: true,
    data: {
      exchange_active: payload.exchange_active,
      trading_active: payload.trading_active,
    },
  };
}

export function validateBalance(payload: unknown):
  | { ok: true; data: KalshiBalance }
  | { ok: false; error: SanitizedProviderError } {
  if (!isRecord(payload)) return validationError("Invalid balance payload");
  const balanceRaw = payload.balance;
  const balance =
    typeof balanceRaw === "number"
      ? balanceRaw
      : typeof balanceRaw === "string"
        ? Number(balanceRaw)
        : NaN;
  if (!Number.isFinite(balance)) {
    return validationError("Missing balance");
  }
  return {
    ok: true,
    data: {
      balance,
      portfolio_value:
        typeof payload.portfolio_value === "number"
          ? payload.portfolio_value
          : undefined,
      updated_ts:
        typeof payload.updated_ts === "number" ? payload.updated_ts : undefined,
    },
  };
}

export function validateMarketsResponse(payload: unknown):
  | { ok: true; markets: KalshiMarketSummary[]; cursor: string | null }
  | { ok: false; error: SanitizedProviderError } {
  if (!isRecord(payload) || !Array.isArray(payload.markets)) {
    return validationError("Invalid markets payload");
  }
  const markets: KalshiMarketSummary[] = [];
  for (const item of payload.markets) {
    if (!isRecord(item) || typeof item.ticker !== "string") continue;
    markets.push({
      ticker: item.ticker,
      event_ticker:
        typeof item.event_ticker === "string" ? item.event_ticker : undefined,
      title: typeof item.title === "string" ? item.title : undefined,
      status: typeof item.status === "string" ? item.status : undefined,
      yes_bid_dollars:
        typeof item.yes_bid_dollars === "string" ? item.yes_bid_dollars : undefined,
      yes_ask_dollars:
        typeof item.yes_ask_dollars === "string" ? item.yes_ask_dollars : undefined,
      no_bid_dollars:
        typeof item.no_bid_dollars === "string" ? item.no_bid_dollars : undefined,
      no_ask_dollars:
        typeof item.no_ask_dollars === "string" ? item.no_ask_dollars : undefined,
      volume_fp: typeof item.volume_fp === "string" ? item.volume_fp : undefined,
      open_interest_fp:
        typeof item.open_interest_fp === "string" ? item.open_interest_fp : undefined,
    });
  }
  const cursor = typeof payload.cursor === "string" ? payload.cursor : null;
  return { ok: true, markets, cursor };
}

export function validateOrderbookFp(payload: unknown):
  | {
      ok: true;
      yesLevels: KalshiOrderbookLevelFp[];
      noLevels: KalshiOrderbookLevelFp[];
    }
  | { ok: false; error: SanitizedProviderError } {
  if (!isRecord(payload)) return validationError("Invalid orderbook payload");
  const fp = isRecord(payload.orderbook_fp) ? payload.orderbook_fp : null;
  if (!fp) return validationError("Missing orderbook_fp");

  const yesRaw = fp.yes_dollars;
  const noRaw = fp.no_dollars;
  if (!Array.isArray(yesRaw) || !Array.isArray(noRaw)) {
    return validationError("Missing yes_dollars/no_dollars arrays");
  }

  const yesLevels = yesRaw
    .map(parseFixedPointLevel)
    .filter((v): v is KalshiOrderbookLevelFp => v !== null);
  const noLevels = noRaw
    .map(parseFixedPointLevel)
    .filter((v): v is KalshiOrderbookLevelFp => v !== null);

  return { ok: true, yesLevels, noLevels };
}

export function reconstructExecutableOrderbook(input: {
  ticker: string;
  yesLevels: KalshiOrderbookLevelFp[];
  noLevels: KalshiOrderbookLevelFp[];
  fetchedAtMs: number;
  maxAgeMs: number;
  source: "REST" | "WEBSOCKET";
}) {
  const bestYesBid = input.yesLevels.at(-1) ?? null;
  const bestNoBid = input.noLevels.at(-1) ?? null;

  const executableYesAsk =
    bestNoBid !== null ? subtractOneDollar(bestNoBid.priceDollars) : null;
  const executableNoAsk =
    bestYesBid !== null ? subtractOneDollar(bestYesBid.priceDollars) : null;

  const ageMs = Date.now() - input.fetchedAtMs;
  const freshnessState =
    ageMs <= input.maxAgeMs ? ("FRESH" as const) : ("STALE" as const);

  const spreadDollars =
    executableYesAsk !== null && bestYesBid !== null
      ? subtractDollars(executableYesAsk, bestYesBid.priceDollars)
      : null;

  return {
    ticker: input.ticker,
    bestYesBid,
    bestNoBid,
    executableYesAsk,
    executableNoAsk,
    spreadDollars,
    depthAtExecutableYesAsk: bestNoBid?.countFp ?? null,
    depthAtExecutableNoAsk: bestYesBid?.countFp ?? null,
    fillableNotionalYes: multiplyFp(bestNoBid?.priceDollars, bestNoBid?.countFp),
    fillableNotionalNo: multiplyFp(bestYesBid?.priceDollars, bestYesBid?.countFp),
    orderbookAgeMs: ageMs,
    freshnessState,
    source: input.source,
    blockedReason:
      freshnessState === "STALE" ? PROVIDER_BLOCK_CODES.STALE_ORDERBOOK : null,
    priceUnknownReason:
      executableYesAsk === null || executableNoAsk === null
        ? PROVIDER_BLOCK_CODES.EXECUTABLE_PRICE_UNKNOWN
        : null,
  };
}

function subtractOneDollar(priceDollars: string): string | null {
  const n = Number(priceDollars);
  if (!Number.isFinite(n)) return null;
  return (1 - n).toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
}

function subtractDollars(a: string, b: string): string | null {
  const left = Number(a);
  const right = Number(b);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
  return (left - right).toFixed(4);
}

function multiplyFp(price?: string, count?: string): string | null {
  if (!price || !count) return null;
  const p = Number(price);
  const c = Number(count);
  if (!Number.isFinite(p) || !Number.isFinite(c)) return null;
  return (p * c).toFixed(4);
}

function validationError(message: string): { ok: false; error: SanitizedProviderError } {
  return {
    ok: false,
    error: {
      provider: "kalshi",
      category: "validation",
      message,
    },
  };
}

export function validateOddsSports(payload: unknown):
  | { ok: true; sports: Array<{ key: string; title?: string; active?: boolean }> }
  | { ok: false; error: SanitizedProviderError } {
  if (!Array.isArray(payload)) {
    return {
      ok: false,
      error: {
        provider: "odds_api",
        category: "validation",
        message: "Invalid sports payload",
      },
    };
  }
  const sports = payload
    .filter(isRecord)
    .filter((s) => typeof s.key === "string")
    .map((s) => ({
      key: s.key as string,
      title: typeof s.title === "string" ? s.title : undefined,
      active: typeof s.active === "boolean" ? s.active : undefined,
    }));
  return { ok: true, sports };
}

export function oddsFreshnessFromLastUpdate(lastUpdateIso: string | undefined, maxAgeMs: number) {
  if (!lastUpdateIso) return { fresh: false, ageMs: null as number | null };
  const ts = Date.parse(lastUpdateIso);
  if (!Number.isFinite(ts)) return { fresh: false, ageMs: null };
  const ageMs = Date.now() - ts;
  return { fresh: ageMs <= maxAgeMs, ageMs };
}
