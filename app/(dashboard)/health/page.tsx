import { PageHeader } from "@/components/PageHeader";
import { HealthCard } from "@/components/HealthCard";
import { KillSwitchControl } from "@/components/KillSwitchControl";
import { DataSourceBar } from "@/components/DataSourceBar";
import { buildHealthSnapshot } from "@/lib/api/responses";
import { getManualExecutionStatus } from "@/lib/server/execution/manual-execution";

export default async function HealthPage() {
  const [health, manual] = await Promise.all([
    buildHealthSnapshot(),
    getManualExecutionStatus(),
  ]);

  const cards: Array<{ label: string; value: string; variant?: "default" | "success" | "warn" | "info" | "muted" | "danger" }> = [
    { label: "App status", value: health.appStatus, variant: "success" },
    { label: "Provider key status", value: health.providerKeyStatus, variant: "warn" },
    { label: "Secret safety", value: health.secretSafetyStatus, variant: "success" },
    { label: "Kalshi", value: health.kalshiStatus, variant: "warn" },
    { label: "Odds API", value: health.oddsApiStatus, variant: "warn" },
    {
      label: "Manual execution",
      value: manual.enabled ? "ENABLED (gates required)" : "BLOCKED",
      variant: manual.enabled ? "success" : "danger",
    },
    {
      label: "Kill switch",
      value: manual.killSwitchActive ? "ON — BLOCKED" : "OFF",
      variant: manual.killSwitchActive ? "danger" : "success",
    },
    {
      label: "Real money flag",
      value: manual.realMoneyTradingEnabled ? "ENABLED" : "DISABLED",
      variant: manual.realMoneyTradingEnabled ? "success" : "warn",
    },
    { label: "Execution health", value: manual.healthColor, variant: manual.healthColor === "GREEN" ? "success" : "warn" },
    { label: "Auto mode", value: health.autoMode, variant: "info" },
    { label: "Profitability", value: health.profitability, variant: "warn" },
    { label: "Fake data status", value: health.fakeDataStatus, variant: "success" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Health" description="System and provider health dashboard." badge={health.dataLabel} />
      <DataSourceBar
        dataLabel={health.dataLabel}
        status={health.appStatus}
        freshness="Live health snapshot"
        blockedReason={manual.killSwitchActive ? "Kill switch active" : null}
      />
      <KillSwitchControl />
      {!manual.enabled && manual.blockedReasons.length > 0 ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm">
          <p className="font-medium text-red-200">Manual execution blocked:</p>
          <ul className="mt-2 list-inside list-disc text-red-200/80">
            {manual.blockedReasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <HealthCard key={c.label} label={c.label} value={c.value} variant={c.variant} />
        ))}
      </div>
    </div>
  );
}
