"use client";

import { useEffect, useState } from "react";
import { StatusBadge } from "./StatusBadge";

export function ExecutionStatusCard() {
  const [status, setStatus] = useState({
    manualExecution: "PROVIDER_NOT_CONFIGURED",
    autoMode: "SELECTABLE",
    autoTradeValidation: "PER_TRADE",
  });

  useEffect(() => {
    fetch("/api/core/health")
      .then((r) => r.json())
      .then((d) =>
        setStatus({
          manualExecution: d.manualExecution,
          autoMode: d.autoMode,
          autoTradeValidation: d.autoTradeValidation,
        })
      )
      .catch(() => {});
  }, []);

  return (
    <div className="rounded-xl border border-edge-border bg-edge-surface p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-edge-muted">Execution</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <StatusBadge variant="warn">Manual: {status.manualExecution}</StatusBadge>
        <StatusBadge variant="info">Auto: {status.autoMode}</StatusBadge>
        <StatusBadge variant="success">Validation: {status.autoTradeValidation}</StatusBadge>
      </div>
    </div>
  );
}
