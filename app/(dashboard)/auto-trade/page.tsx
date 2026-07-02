import { PageHeader } from "@/components/PageHeader";
import { AutoTradePanel } from "@/components/AutoTradePanel";
import { StakePanel } from "@/components/StakePanel";
import { DataSourceBar } from "@/components/DataSourceBar";

export default function AutoTradePage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Auto Trade"
        description="Auto is selectable. Every live order passes per-trade validation."
        badge="AUTO_SELECTABLE"
      />
      <DataSourceBar
        dataLabel="AUTO_ENGINE"
        status="SELECTABLE"
        freshness="Per-trade validation on each scan"
        blockedReason={null}
      />
      <AutoTradePanel />
      <StakePanel />
    </div>
  );
}
