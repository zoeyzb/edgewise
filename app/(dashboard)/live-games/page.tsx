import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { DataSourceBar } from "@/components/DataSourceBar";

export default function LiveGamesPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Live Games"
        description="Live sports events awaiting Kalshi market matching."
        badge="PROVIDER_NOT_CONFIGURED"
      />
      <DataSourceBar
        dataLabel="PROVIDER_NOT_CONFIGURED"
        status="BLOCKED"
        freshness="—"
        blockedReason="Configure Kalshi and Odds API keys"
      />
      <EmptyState
        title="No live games connected"
        message="Configure Kalshi and Odds API keys to load live game feeds."
      />
    </div>
  );
}
