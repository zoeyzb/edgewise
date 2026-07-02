"use client";

import { useState } from "react";
import type { ScoredOpportunity } from "@/lib/core/types";
import { StatusBadge } from "./StatusBadge";

function canExecute(item: ScoredOpportunity): boolean {
  return (
    item.state === "BETTABLE" ||
    item.highMarginStatus === "URGENT_BETTABLE_HIGH_MARGIN"
  );
}

export function ExecuteOpportunityButton({ item }: { item: ScoredOpportunity }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  if (!canExecute(item)) return null;

  async function execute() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/core/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opportunityId: item.id }),
      });
      const data = await res.json();
      setResult(data);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-2 space-y-2">
      <button
        type="button"
        disabled={loading}
        onClick={execute}
        className="rounded border border-edge-accent bg-edge-accent/15 px-2 py-1 text-[10px] font-mono uppercase text-edge-accent disabled:opacity-50"
      >
        {loading ? "Validating…" : "Execute (manual)"}
      </button>
      {result ? (
        <div className="rounded border border-edge-border bg-edge-bg/60 p-2 text-xs">
          <p className="font-mono">{String(result.status)}</p>
          {result.reason ? <p className="text-edge-muted">{String(result.reason)}</p> : null}
          {result.failedGate ? (
            <p className="font-mono text-red-300">Gate: {String(result.failedGate)}</p>
          ) : null}
          {result.orderPlaced === true ? (
            <p className="text-edge-accent">Order submitted — {String(result.finalOrderStatus)}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function StakeSummaryRow({ item }: { item: ScoredOpportunity }) {
  return (
    <div className="mt-1 space-y-0.5 text-[10px] text-edge-muted">
      <p>Req: ${item.userRequestedStake.toFixed(2)} · AI: ${item.aiRecommendedStake.toFixed(2)}</p>
      <p>Allowed: ${item.finalAllowedStake.toFixed(2)} · Max loss: ${item.maxLoss.toFixed(2)}</p>
    </div>
  );
}

export function ExecuteReadinessBadge({ item }: { item: ScoredOpportunity }) {
  const variant =
    item.executeReadiness === "PER_TRADE_VALIDATION_REQUIRED" ? "success" : "muted";
  return <StatusBadge variant={variant}>{item.executeReadiness}</StatusBadge>;
}
