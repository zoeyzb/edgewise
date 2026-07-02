import { PageHeader } from "@/components/PageHeader";
import { TrackerPanel } from "@/components/TrackerPanel";
import { DataSourceBar } from "@/components/DataSourceBar";

export default function TrackerPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Tracker"
        description="Real orders, fills, positions — paper/shadow clearly separated."
        badge="TRACKER"
      />
      <DataSourceBar
        dataLabel="TRACKED_TRADES"
        status="LIVE"
        freshness="Updated on execution"
        blockedReason={null}
      />
      <TrackerPanel />
    </div>
  );
}
