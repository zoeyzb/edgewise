import { PageHeader } from "@/components/PageHeader";
import { OpportunityTable } from "@/components/OpportunityTable";
import { DataSourceBar } from "@/components/DataSourceBar";
import { buildHighMarginResponse } from "@/lib/server/opportunities/opportunity-service";

export default async function HighMarginPage() {
  const data = await buildHighMarginResponse();
  return (
    <div className="space-y-4">
      <PageHeader
        title="High Margin"
        description="30%+ apparent edges with extra verification — never guaranteed profit."
        badge={data.dataLabel}
      />
      <DataSourceBar
        dataLabel={data.dataLabel}
        status={data.providerStatus}
        freshness={data.scannedAt}
        blockedReason={data.dataLabel === "PROVIDER_NOT_CONFIGURED" ? "Configure Kalshi + Odds keys" : "High-margin edges require extra verification"}
      />
      <OpportunityTable items={data.items} dataLabel={data.dataLabel} message={data.message} />
    </div>
  );
}
