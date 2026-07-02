import { PageHeader } from "@/components/PageHeader";
import { TotalsWatchTable } from "@/components/TotalsWatchTable";
import { DataSourceBar } from "@/components/DataSourceBar";
import { buildTotalsWatchlistResponse } from "@/lib/server/opportunities/opportunity-service";

export default async function TotalsWatchlistPage() {
  const data = await buildTotalsWatchlistResponse();
  return (
    <div className="space-y-4">
      <PageHeader
        title="Totals Watchlist"
        description="Over/under and score-pace monitoring — exact settlement scope only."
        badge={data.dataLabel}
      />
      <DataSourceBar
        dataLabel={data.dataLabel}
        status={data.providerStatus}
        freshness={data.scannedAt}
        blockedReason={data.dataLabel === "PROVIDER_NOT_CONFIGURED" ? "Configure Kalshi + Odds keys" : null}
      />
      <TotalsWatchTable items={data.items} dataLabel={data.dataLabel} message={data.message} />
    </div>
  );
}
