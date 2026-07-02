import type { RankedKalshiMarket } from "@/lib/core/types";
import { EmptyState } from "./EmptyState";
import { StatusBadge } from "./StatusBadge";

function money(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `$${n.toFixed(2)}`;
}

function spread(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `$${n.toFixed(4)}`;
}

function labelVariant(label: string): "success" | "warn" | "danger" | "muted" {
  if (label === "REVIEW" || label === "CLEAN_SINGLE_MARKET") return "success";
  if (label === "WATCH" || label === "CLOSING_SOON") return "warn";
  if (label === "AVOID" || label === "LOW_LIQUIDITY" || label === "WIDE_SPREAD") return "danger";
  return "muted";
}

export function KalshiMarketsTable({
  markets,
  dataLabel,
  message,
}: {
  markets: RankedKalshiMarket[];
  dataLabel: string;
  message?: string;
}) {
  if (markets.length === 0) {
    return (
      <EmptyState
        title="No Kalshi markets loaded"
        message={
          message ??
          (dataLabel === "PROVIDER_NOT_CONFIGURED"
            ? "Configure Kalshi production keys to scan markets."
            : "Kalshi returned no tradeable markets for ranking.")
        }
        label={dataLabel}
      />
    );
  }

  return (
    <div className="space-y-4">
      {message ? <p className="text-sm text-edge-muted">{message}</p> : null}
      <div className="overflow-x-auto rounded-xl border border-edge-border">
        <table className="w-full min-w-[1200px] text-left text-sm">
          <thead className="border-b border-edge-border bg-edge-surface text-xs uppercase text-edge-muted">
            <tr>
              <th className="px-3 py-3">#</th>
              <th className="px-3 py-3">Title / Ticker</th>
              <th className="px-3 py-3">Category</th>
              <th className="px-3 py-3">Type</th>
              <th className="px-3 py-3">YES bid/ask</th>
              <th className="px-3 py-3">NO bid/ask</th>
              <th className="px-3 py-3">Spread</th>
              <th className="px-3 py-3">Liquidity</th>
              <th className="px-3 py-3">Volume</th>
              <th className="px-3 py-3">OI</th>
              <th className="px-3 py-3">Close</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">Labels</th>
              <th className="px-3 py-3">Why ranked</th>
            </tr>
          </thead>
          <tbody>
            {markets.map((m) => (
              <tr key={m.ticker} className="border-b border-edge-border/50 align-top hover:bg-edge-surface/50">
                <td className="px-3 py-3 font-mono text-xs">{m.rankPosition}</td>
                <td className="px-3 py-3">
                  <p className="font-medium">{m.title}</p>
                  <p className="font-mono text-xs text-edge-muted">{m.ticker}</p>
                  {m.isCombo ? (
                    <p className="mt-1 text-xs text-amber-300">combo/multivariate</p>
                  ) : null}
                </td>
                <td className="px-3 py-3 text-xs">{m.categorySport}</td>
                <td className="px-3 py-3 text-xs font-mono">{m.marketType}</td>
                <td className="px-3 py-3 font-mono text-xs">
                  {m.yesBid ?? "—"} / {m.yesAsk ?? "—"}
                </td>
                <td className="px-3 py-3 font-mono text-xs">
                  {m.noBid ?? "—"} / {m.noAsk ?? "—"}
                </td>
                <td className="px-3 py-3 font-mono text-xs">{spread(m.spreadDollars)}</td>
                <td className="px-3 py-3 font-mono text-xs">{money(m.liquidityDollars)}</td>
                <td className="px-3 py-3 font-mono text-xs">{m.volumeFp ?? "—"}</td>
                <td className="px-3 py-3 font-mono text-xs">{m.openInterestFp ?? "—"}</td>
                <td className="px-3 py-3 text-xs">
                  {m.closeTime ? new Date(m.closeTime).toLocaleString() : "—"}
                </td>
                <td className="px-3 py-3 text-xs">{m.status ?? "—"}</td>
                <td className="px-3 py-3">
                  <div className="flex flex-wrap gap-1">
                    {m.labels.map((label) => (
                      <StatusBadge key={label} variant={labelVariant(label)}>
                        {label}
                      </StatusBadge>
                    ))}
                  </div>
                  <p className="mt-1 text-[10px] text-edge-muted">score {m.rankScore}</p>
                </td>
                <td className="px-3 py-3 text-xs text-edge-muted max-w-xs">{m.rankReason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
