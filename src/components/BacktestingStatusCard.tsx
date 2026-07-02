"use client";

import { useEffect, useState } from "react";

interface BacktestStatus {
  status: string;
  dataLabel: string;
  blockCode: string | null;
  message: string;
  requirementsMet: string[];
  requirementsMissing: string[];
  requirementsTotal: number;
  profitabilityClaimAllowed: boolean;
  note: string;
}

export function BacktestingStatusCard() {
  const [data, setData] = useState<BacktestStatus | null>(null);

  useEffect(() => {
    fetch("/api/core/backtesting-status")
      .then((r) => r.json())
      .then(setData);
  }, []);

  if (!data) return <p className="text-sm text-edge-muted">Loading backtesting status…</p>;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-edge-border bg-edge-surface p-5">
        <h3 className="font-medium">Backtesting</h3>
        <p className="mt-2 font-mono text-sm text-amber-300">{data.status}</p>
        <p className="mt-2 text-xs text-edge-muted">{data.message}</p>
        <p className="mt-2 text-xs text-edge-muted">{data.note}</p>
        <dl className="mt-4 grid gap-2 text-xs sm:grid-cols-2">
          <div>
            <dt className="text-edge-muted">Data label</dt>
            <dd className="font-mono">{data.dataLabel}</dd>
          </div>
          <div>
            <dt className="text-edge-muted">Profit claim allowed</dt>
            <dd className="font-mono">{data.profitabilityClaimAllowed ? "YES" : "NO"}</dd>
          </div>
          <div>
            <dt className="text-edge-muted">Requirements met</dt>
            <dd className="font-mono">{data.requirementsMet.length} / {data.requirementsTotal}</dd>
          </div>
        </dl>
      </div>
      {data.requirementsMissing.length > 0 && (
        <div className="rounded-xl border border-edge-border bg-edge-surface p-5">
          <h4 className="text-sm font-medium">Missing requirements (sample)</h4>
          <ul className="mt-2 list-inside list-disc text-xs text-edge-muted">
            {data.requirementsMissing.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
