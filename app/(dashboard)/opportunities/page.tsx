import { PageHeader } from "@/components/PageHeader";
import { OpportunityTable } from "@/components/OpportunityTable";
import { DataSourceBar } from "@/components/DataSourceBar";
import { buildOpportunityScanResponse } from "@/lib/server/opportunities/opportunity-service";

export default async function OpportunitiesPage() {
  const data = await buildOpportunityScanResponse();
  return (
    <div className="space-y-4">
      <PageHeader
        title="Opportunities"
        description="Ranked edge opportunities — verified only when providers connected."
        badge={data.dataLabel}
      />
      <DataSourceBar
        dataLabel={data.dataLabel}
        status={data.providerStatus}
        freshness={data.scannedAt}
        blockedReason={data.dataLabel === "PROVIDER_NOT_CONFIGURED" ? "Configure Kalshi + Odds keys" : null}
      />
      <OpportunityTable items={data.items} dataLabel={data.dataLabel} message={data.message} />
    </div>
  );
}
