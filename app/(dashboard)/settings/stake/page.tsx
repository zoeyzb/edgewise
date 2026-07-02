import { PageHeader } from "@/components/PageHeader";
import { StakePanel } from "@/components/StakePanel";
import { DataSourceBar } from "@/components/DataSourceBar";

export default function SettingsStakePage() {
  return (
    <div className="space-y-4">
      <PageHeader title="Stake Settings" description="Configure stake modes and limits." badge="SERVER_VERIFIED" />
      <DataSourceBar
        dataLabel="STAKE_ENGINE"
        status="ACTIVE"
        freshness="Recalculated server-side per trade"
        blockedReason={null}
      />
      <StakePanel />
    </div>
  );
}
