import type { ScoredOpportunity } from "@/lib/core/types";
import { StatusBadge } from "./StatusBadge";
import { EmptyState } from "./EmptyState";
import {
  ExecuteOpportunityButton,
  ExecuteReadinessBadge,
  StakeSummaryRow,
} from "./ExecuteOpportunityButton";

function pct(n: number | null | undefined, digits = 1): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(digits)}%`;
}

function money(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `$${n.toFixed(2)}`;
}

function stateVariant(state: string): "success" | "warn" | "danger" | "muted" {
  if (state === "BETTABLE") return "success";
  if (state === "WATCH") return "warn";
  if (state === "BLOCKED") return "danger";
  return "muted";
}

export function OpportunityTable({
  items,
  dataLabel,
  message,
}: {
  items: ScoredOpportunity[];
  dataLabel: string;
  message?: string;
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        title="No opportunities loaded"
        message={
          message ??
          (dataLabel === "PROVIDER_NOT_CONFIGURED"
            ? "Provider not configured. Connect Kalshi and Odds API keys to begin edge discovery."
            : "No verified matches found. Edgewise does not inject fake opportunities.")
        }
        label={dataLabel}
      />
    );
  }

  return (
    <div className="space-y-4">
      {message ? (
        <p className="text-sm text-edge-muted">{message}</p>
      ) : null}
      <div className="overflow-x-auto rounded-xl border border-edge-border">
        <table className="w-full min-w-[960px] text-left text-sm">
          <thead className="border-b border-edge-border bg-edge-surface text-xs uppercase text-edge-muted">
            <tr>
              <th className="px-3 py-3">Game / Market</th>
              <th className="px-3 py-3">State</th>
              <th className="px-3 py-3">Exp. $</th>
              <th className="px-3 py-3">Net Edge</th>
              <th className="px-3 py-3">EQS</th>
              <th className="px-3 py-3">MCS</th>
              <th className="px-3 py-3">PPS</th>
              <th className="px-3 py-3">Liquidity</th>
              <th className="px-3 py-3">Match</th>
              <th className="px-3 py-3">Settlement</th>
              <th className="px-3 py-3">Execute</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-edge-border/50 align-top hover:bg-edge-surface/50">
                <td className="px-3 py-3">
                  <div className="font-medium">{item.game}</div>
                  <div className="text-xs text-edge-muted">{item.kalshiMarket}</div>
                  <div className="mt-1 font-mono text-xs text-edge-muted">{item.kalshiTicker}</div>
                </td>
                <td className="px-3 py-3">
                  <StatusBadge variant={stateVariant(item.state)}>{item.state}</StatusBadge>
                  <p className="mt-1 max-w-[200px] text-xs text-edge-muted">{item.reason}</p>
                </td>
                <td className="px-3 py-3 font-mono">{money(item.expectedDollarProfit)}</td>
                <td className="px-3 py-3">
                  <div className="font-mono">{pct(item.edgeBreakdown.netEdge)}</div>
                  <div className="text-xs text-edge-muted">{item.edgeBreakdown.edgeTier}</div>
                </td>
                <td className="px-3 py-3 font-mono">{item.edgeQualityScore}</td>
                <td className="px-3 py-3 font-mono">{item.moneyConfidenceScore}</td>
                <td className="px-3 py-3 font-mono">{item.profitPriorityScore}</td>
                <td className="px-3 py-3">
                  <div>{item.liquidity}</div>
                  <div className="text-xs text-edge-muted">{money(item.fillableNotional)}</div>
                  <div className="text-xs text-edge-muted">OB: {item.orderbookFreshness}</div>
                </td>
                <td className="px-3 py-3">
                  <div>{item.matchConfidence}</div>
                  <div className="text-xs text-edge-muted">{item.marketTypeLevel.replace("LEVEL_", "L")}</div>
                </td>
                <td className="px-3 py-3">
                  <div>{item.settlementConfidence}</div>
                  <div className="text-xs text-edge-muted">{item.scopePeriod}</div>
                </td>
                <td className="px-3 py-3">
                  <ExecuteReadinessBadge item={item} />
                  <StakeSummaryRow item={item} />
                  <div className="mt-1 text-xs text-edge-muted">Ask: {pct(item.executableKalshiAsk, 2)}</div>
                  <ExecuteOpportunityButton item={item} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
