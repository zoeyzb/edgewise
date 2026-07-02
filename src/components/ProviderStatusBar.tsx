"use client";

import { useEffect, useState } from "react";
import { StatusBadge } from "./StatusBadge";

export function ProviderStatusBar() {
  const [status, setStatus] = useState({
    kalshi: "—",
    odds: "—",
  });

  useEffect(() => {
    fetch("/api/core/health")
      .then((r) => r.json())
      .then((d) => {
        const odds = d.providers?.oddsDiagnostics;
        setStatus({
          kalshi: d.providers?.kalshiAuthStatus ?? "—",
          odds:
            odds?.status === "USABLE"
              ? "USABLE"
              : odds?.status === "NOT_RUN"
                ? "optional / not run"
                : odds?.failureReason ?? odds?.authStatus ?? "—",
        });
      })
      .catch(() => {});
  }, []);

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <StatusBadge variant="muted">Kalshi: {status.kalshi}</StatusBadge>
      <StatusBadge variant={status.odds === "USABLE" ? "success" : "warn"}>
        Odds: {status.odds}
      </StatusBadge>
    </div>
  );
}
