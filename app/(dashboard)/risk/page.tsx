"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { RiskPanel } from "@/components/RiskPanel";
import { StakePanel } from "@/components/StakePanel";
import { HealthCard } from "@/components/HealthCard";
import { DataSourceBar } from "@/components/DataSourceBar";

export default function RiskPage() {
  const [profitability, setProfitability] = useState<string>("UNPROVEN");

  useEffect(() => {
    fetch("/api/core/profitability")
      .then((r) => r.json())
      .then((d) => setProfitability(d.profitabilityStatus ?? "UNPROVEN"));
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader title="Risk" description="Bankroll protection limits and exposure caps." badge="SERVER_ENFORCED" />
      <DataSourceBar
        dataLabel="RISK_ENGINE"
        status="ACTIVE"
        freshness="Live exposure snapshot"
        blockedReason={null}
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <HealthCard label="Profitability status" value={profitability} variant="warn" />
        <HealthCard label="Win rate claim" value="TRACKED ONLY" variant="info" />
        <HealthCard label="Guarantee" value="NONE" variant="muted" />
      </div>
      <RiskPanel />
      <StakePanel />
    </div>
  );
}
