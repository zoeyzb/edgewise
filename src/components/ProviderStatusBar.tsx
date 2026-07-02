"use client";

import { useEffect, useState } from "react";
import { StatusBadge } from "./StatusBadge";

export function ProviderStatusBar() {
  const [status, setStatus] = useState({
    keyPair: "—",
    exchange: "—",
    balance: "—",
    odds: "—",
  });

  useEffect(() => {
    fetch("/api/core/health")
      .then((r) => r.json())
      .then((d) => {
        const providers = d.providers;
        const odds = providers?.oddsDiagnostics;
        setStatus({
          keyPair: providers?.kalshiKeyPairStatus ?? providers?.kalshiAuthStatus ?? "—",
          exchange: providers?.kalshiExchangeStatus ?? "—",
          balance: providers?.kalshiBalanceStatus ?? "—",
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
      <StatusBadge variant="muted">Key pair: {status.keyPair}</StatusBadge>
      <StatusBadge variant="muted">Exchange: {status.exchange}</StatusBadge>
      <StatusBadge variant={status.balance === "KALSHI_BALANCE_OK" ? "success" : "warn"}>
        Balance: {status.balance}
      </StatusBadge>
      <StatusBadge variant={status.odds === "USABLE" ? "success" : "warn"}>
        Odds: {status.odds}
      </StatusBadge>
    </div>
  );
}
