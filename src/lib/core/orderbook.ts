/**
 * Executable orderbook metrics — never midpoint.
 */

import type { KalshiExecutableOrderbook } from "@/lib/core/contracts";

export interface OrderbookMetrics {
  ticker: string;
  executableYesAsk: string | null;
  executableNoAsk: string | null;
  spreadDollars: string | null;
  fillableNotionalYes: number | null;
  fillableNotionalNo: number | null;
  orderbookAgeMs: number | null;
  freshnessState: "FRESH" | "STALE" | "UNKNOWN";
  source: "REST" | "WEBSOCKET";
  blockedReason: string | null;
}

export function metricsFromExecutableOrderbook(
  ob: KalshiExecutableOrderbook & { blockedReason?: string | null }
): OrderbookMetrics {
  return {
    ticker: ob.ticker,
    executableYesAsk: ob.executableYesAsk,
    executableNoAsk: ob.executableNoAsk,
    spreadDollars: ob.spreadDollars,
    fillableNotionalYes: parseFp(ob.fillableNotionalYes),
    fillableNotionalNo: parseFp(ob.fillableNotionalNo),
    orderbookAgeMs: ob.orderbookAgeMs,
    freshnessState: ob.freshnessState,
    source: ob.source,
    blockedReason: ob.blockedReason ?? null,
  };
}

function parseFp(value: string | null | undefined): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function pickExecutableAsk(
  side: "YES" | "NO",
  metrics: OrderbookMetrics
): number | null {
  const raw = side === "YES" ? metrics.executableYesAsk : metrics.executableNoAsk;
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 && n < 1 ? n : null;
}

export function spreadAsFraction(metrics: OrderbookMetrics): number {
  const spread = metrics.spreadDollars != null ? Number(metrics.spreadDollars) : null;
  if (spread == null || !Number.isFinite(spread)) return 0.01;
  return Math.max(0, Math.min(0.05, spread));
}
