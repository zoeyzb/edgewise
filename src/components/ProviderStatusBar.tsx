"use client";

import { useEffect, useState } from "react";
import { StatusBadge } from "./StatusBadge";

export function ProviderStatusBar() {
  const [status, setStatus] = useState({
    kalshi: "PROVIDER_NOT_CONFIGURED",
    odds: "PROVIDER_NOT_CONFIGURED",
  });

  useEffect(() => {
    fetch("/api/core/health")
      .then((r) => r.json())
      .then((d) =>
        setStatus({ kalshi: d.kalshiStatus, odds: d.oddsApiStatus })
      )
      .catch(() => {});
  }, []);

  return (
    <div className="flex flex-wrap items-center gap-3 text-xs">
      <span className="text-edge-muted">Providers</span>
      <StatusBadge variant="muted">Kalshi: {status.kalshi}</StatusBadge>
      <StatusBadge variant="muted">Odds API: {status.odds}</StatusBadge>
    </div>
  );
}
