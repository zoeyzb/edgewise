import { PageHeader } from "@/components/PageHeader";
import { ProfitabilitySummary, ProfitabilityMoneyScores } from "@/components/ProfitabilitySummary";
import { DataSourceBar } from "@/components/DataSourceBar";

export default function ProfitabilityPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Profitability"
        description="Verified performance metrics only — never from theoretical EV alone."
        badge="UNPROVEN"
      />
      <DataSourceBar
        dataLabel="TRACKED_RESULTS_ONLY"
        status="UNPROVEN"
        freshness="Requires closed tracked trades"
        blockedReason="No profitability claim without tracked evidence"
      />
      <ProfitabilitySummary />
      <div className="grid gap-4 sm:grid-cols-3">
        <ProfitabilityMoneyScores />
      </div>
    </div>
  );
}
