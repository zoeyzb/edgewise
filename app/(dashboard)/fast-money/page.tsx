import { PageHeader } from "@/components/PageHeader";
import { OpportunityTable } from "@/components/OpportunityTable";
import { MoneyScoreCard } from "@/components/MoneyScoreCard";
import { DataSourceBar } from "@/components/DataSourceBar";
import { buildFastMoneyResponse } from "@/lib/server/opportunities/opportunity-service";
import { buildProfitabilityResponse } from "@/lib/server/tracking/tracking-service";

export default async function FastMoneyPage() {
  const [data, profitability] = await Promise.all([
    buildFastMoneyResponse(),
    buildProfitabilityResponse(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="Fast Money" description="Fast-decay, near-BETTABLE opportunities." badge={data.dataLabel} />
      <DataSourceBar
        dataLabel={data.dataLabel}
        status={data.providerStatus}
        freshness={data.scannedAt}
        blockedReason={data.dataLabel === "PROVIDER_NOT_CONFIGURED" ? "Configure Kalshi + Odds keys" : null}
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <MoneyScoreCard
          title="Fast Money Realism"
          score={String(profitability.moneyScores.fastMoneyRealismScore)}
          note="Data freshness, liquidity, execution quality"
        />
        <MoneyScoreCard
          title="Money Pressure"
          score={String(profitability.moneyScores.moneyPressureScore)}
          note="Opportunity density vs risk budget"
        />
        <MoneyScoreCard
          title="Money Per Hour"
          score={String(profitability.moneyScores.moneyPerHourScore)}
          note="Expected capture rate estimate"
        />
      </div>
      <OpportunityTable items={data.items} dataLabel={data.dataLabel} message={data.message} />
    </div>
  );
}
