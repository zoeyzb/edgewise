"use client";

import { useEffect, useState } from "react";
import { EmptyState } from "./EmptyState";
import { StatusBadge } from "./StatusBadge";

interface TrackedTrade {
  id: string;
  marketTicker: string;
  mode: string;
  lifecycle: string;
  side: string;
  finalAllowedStake: number;
  placedPrice: number | null;
  unrealizedPnl: number | null;
  realizedPnl: number | null;
  dataLabel: string;
}

interface TrackerData {
  dataLabel: string;
  openPositions: TrackedTrade[];
  closedTrades: TrackedTrade[];
  paperTrades: TrackedTrade[];
  shadowTrades: TrackedTrade[];
  liveTrades: TrackedTrade[];
  paperLabel: string;
  shadowLabel: string;
  message: string;
}

export function TrackerPanel() {
  const [data, setData] = useState<TrackerData | null>(null);
  const [exits, setExits] = useState<Array<{ marketTicker: string; exitState: string; reason: string }>>([]);

  useEffect(() => {
    Promise.all([
      fetch("/api/core/tracker").then((r) => r.json()),
      fetch("/api/core/exit").then((r) => r.json()),
    ]).then(([tracker, exit]) => {
      setData(tracker);
      setExits(exit.recommendations ?? []);
    });
  }, []);

  if (!data) return <p className="text-sm text-edge-muted">Loading tracker…</p>;

  const hasAny =
    data.openPositions.length > 0 ||
    data.closedTrades.length > 0 ||
    data.paperTrades.length > 0 ||
    data.shadowTrades.length > 0;

  if (!hasAny) {
    return (
      <EmptyState
        title="No tracked positions"
        message={data.message}
        label={data.dataLabel}
      />
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-xs text-edge-muted">{data.message}</p>

      <TradeSection title="Open Positions (Live)" trades={data.openPositions.filter((t) => t.mode === "LIVE")} />
      <TradeSection title="Paper (Simulated)" trades={data.paperTrades} label={data.paperLabel} />
      <TradeSection title="Shadow (Would-Have-Traded)" trades={data.shadowTrades} label={data.shadowLabel} />
      <TradeSection title="Closed Trades" trades={data.closedTrades} />

      {exits.length > 0 && (
        <div className="rounded-xl border border-edge-border bg-edge-surface p-5 space-y-3">
          <h3 className="text-sm font-medium">Exit Recommendations</h3>
          {exits.map((e) => (
            <div key={e.marketTicker} className="flex items-center justify-between text-xs border-b border-edge-border/50 pb-2">
              <span className="font-mono">{e.marketTicker}</span>
              <StatusBadge variant={e.exitState === "EXIT_NOW" ? "danger" : "warn"}>{e.exitState}</StatusBadge>
              <span className="text-edge-muted">{e.reason}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TradeSection({
  title,
  trades,
  label,
}: {
  title: string;
  trades: TrackedTrade[];
  label?: string;
}) {
  if (trades.length === 0) return null;

  return (
    <div className="rounded-xl border border-edge-border bg-edge-surface p-5 space-y-3">
      <h3 className="text-sm font-medium">{title}</h3>
      {label && <p className="text-xs text-edge-muted">{label}</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="text-edge-muted">
            <tr>
              <th className="py-2">Market</th>
              <th className="py-2">Side</th>
              <th className="py-2">Stake</th>
              <th className="py-2">Price</th>
              <th className="py-2">P&amp;L</th>
              <th className="py-2">Mode</th>
            </tr>
          </thead>
          <tbody>
            {trades.slice(0, 20).map((t) => (
              <tr key={t.id} className="border-t border-edge-border/50">
                <td className="py-2 font-mono">{t.marketTicker}</td>
                <td className="py-2">{t.side}</td>
                <td className="py-2">${t.finalAllowedStake.toFixed(2)}</td>
                <td className="py-2">{t.placedPrice?.toFixed(4) ?? "—"}</td>
                <td className="py-2">
                  {t.realizedPnl != null
                    ? `$${t.realizedPnl.toFixed(2)}`
                    : t.unrealizedPnl != null
                      ? `$${t.unrealizedPnl.toFixed(2)} (unrealized)`
                      : "—"}
                </td>
                <td className="py-2">{t.mode}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
