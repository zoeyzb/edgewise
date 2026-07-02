import type { PlaceholderOpportunity } from "@/lib/core/types";
import { StatusBadge } from "./StatusBadge";

export function OpportunityCard({ item }: { item: PlaceholderOpportunity }) {
  return (
    <div className="rounded-xl border border-edge-border bg-edge-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-medium">{item.market}</h3>
        <StatusBadge variant="muted">{item.dataLabel}</StatusBadge>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div>
          <dt className="text-edge-muted">Side</dt>
          <dd>{item.side}</dd>
        </div>
        <div>
          <dt className="text-edge-muted">Edge</dt>
          <dd className="font-mono">
            {item.edgePercent != null ? `${item.edgePercent}%` : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-edge-muted">Exp. Profit</dt>
          <dd className="font-mono">
            {item.expectedProfit != null ? `$${item.expectedProfit}` : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-edge-muted">Status</dt>
          <dd>{item.status}</dd>
        </div>
      </dl>
    </div>
  );
}
