import { PageHeader } from "@/components/PageHeader";
import { OpportunityTable } from "@/components/OpportunityTable";
import { DataSourceBar } from "@/components/DataSourceBar";
import { buildBestBetsResponse } from "@/lib/server/opportunities/opportunity-service";

export default async function BestBetsPage() {
  const data = await buildBestBetsResponse();
  return (
    <div className="space-y-4">
      <PageHeader title="Best Bets" description="Highest-confidence verified edges." badge={data.dataLabel} />
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
