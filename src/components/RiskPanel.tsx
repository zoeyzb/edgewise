"use client";

import { useEffect, useState } from "react";
import { RISK_CONFIG } from "@/lib/core/risk-config";
import { HealthCard } from "./HealthCard";

interface RiskSummary {
  dailyLossUsed: number;
  dailyLossCap: number;
  openExposure: number;
  openExposureCap: number;
  openTrades: number;
  tradesToday: number;
  cooldownActive: boolean;
  cooldownReason: string | null;
}

export function RiskPanel() {
  const [summary, setSummary] = useState<RiskSummary | null>(null);

  useEffect(() => {
    fetch("/api/core/risk")
      .then((r) => r.json())
      .then((d) => setSummary(d.riskSummary ?? null));
  }, []);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <HealthCard label="Max manual stake" value={`${RISK_CONFIG.maxManualStakePercent}%`} />
        <HealthCard label="Conservative stake" value={`${RISK_CONFIG.conservativeStakePercent}%`} variant="info" />
        <HealthCard label="Max daily loss" value={`${RISK_CONFIG.maxDailyRealizedLossPercent}%`} variant="warn" />
        <HealthCard label="Max daily exposure" value={`${RISK_CONFIG.maxDailyExposurePercent}%`} variant="warn" />
        <HealthCard label="Max per game" value={`${RISK_CONFIG.maxExposurePerGamePercent}%`} />
        <HealthCard label="Max per league" value={`${RISK_CONFIG.maxExposurePerLeaguePercent}%`} />
        <HealthCard label="Max open trades" value={String(RISK_CONFIG.maxOpenTrades)} />
        <HealthCard label="Max trades / day" value={String(RISK_CONFIG.maxTradesPerDay)} />
      </div>

      {summary ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <HealthCard
            label="Daily loss used"
            value={`$${summary.dailyLossUsed.toFixed(2)} / $${summary.dailyLossCap.toFixed(2)}`}
            variant="warn"
          />
          <HealthCard
            label="Open exposure"
            value={`$${summary.openExposure.toFixed(2)} / $${summary.openExposureCap.toFixed(2)}`}
          />
          <HealthCard label="Open trades" value={String(summary.openTrades)} />
          <HealthCard label="Trades today" value={String(summary.tradesToday)} />
          {summary.cooldownActive ? (
            <HealthCard label="Cooldown" value={summary.cooldownReason ?? "active"} variant="danger" />
          ) : null}
        </div>
      ) : null}

      <p className="text-xs text-edge-muted">
        No martingale. No chasing. 100% bankroll trades blocked. Cooldowns: loss 10m, rejected 5m, failed 5m.
      </p>
    </div>
  );
}
