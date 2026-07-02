import type { TotalsWatchEntry } from "@/lib/core/types";
import { EmptyState } from "./EmptyState";
import { StatusBadge } from "./StatusBadge";

export function TotalsWatchTable({
  items,
  dataLabel,
  message,
}: {
  items: TotalsWatchEntry[];
  dataLabel: string;
  message?: string;
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        title="No totals watchlist entries"
        message={
          message ??
          (dataLabel === "PROVIDER_NOT_CONFIGURED"
            ? "Configure providers to monitor totals markets."
            : "No totals markets matched with exact settlement scope.")
        }
        label={dataLabel}
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-edge-border">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="border-b border-edge-border bg-edge-surface text-xs uppercase text-edge-muted">
          <tr>
            <th className="px-4 py-3">Game</th>
            <th className="px-4 py-3">Ticker</th>
            <th className="px-4 py-3">State</th>
            <th className="px-4 py-3">Score</th>
            <th className="px-4 py-3">Projected</th>
            <th className="px-4 py-3">Freshness</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b border-edge-border/50 hover:bg-edge-surface/50">
              <td className="px-4 py-3">{item.game}</td>
              <td className="px-4 py-3 font-mono text-xs">{item.kalshiMarketTicker}</td>
              <td className="px-4 py-3">
                <StatusBadge variant={item.state === "WATCH" ? "warn" : "muted"}>{item.state}</StatusBadge>
                <p className="mt-1 text-xs text-edge-muted">{item.reason}</p>
              </td>
              <td className="px-4 py-3 font-mono">{item.currentScore ?? "—"}</td>
              <td className="px-4 py-3 font-mono">
                {item.projectedTotal != null ? item.projectedTotal.toFixed(1) : "—"}
              </td>
              <td className="px-4 py-3 text-xs text-edge-muted">
                score: {item.scoreFresh ? "FRESH" : "STALE"} / clock: {item.clockFresh ? "FRESH" : "STALE"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
