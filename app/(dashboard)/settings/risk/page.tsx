import { PageHeader } from "@/components/PageHeader";
import { RiskPanel } from "@/components/RiskPanel";
import { DataSourceBar } from "@/components/DataSourceBar";

export default function SettingsRiskPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Risk Settings" description="Configure exposure and loss limits." badge="SERVER_ENFORCED" />
      <DataSourceBar
        dataLabel="RISK_LIMITS"
        status="ACTIVE"
        freshness="Enforced on every execution"
        blockedReason={null}
      />
      <RiskPanel />
    </div>
  );
}
