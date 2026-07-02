import { PageHeader } from "@/components/PageHeader";
import { BacktestingStatusCard } from "@/components/BacktestingStatusCard";
import { DataSourceBar } from "@/components/DataSourceBar";

export default function BacktestingStatusPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Backtesting Status"
        description="Backtest engine — no fake backtests."
        badge="BLOCKED"
      />
      <DataSourceBar
        dataLabel="HISTORICAL_DATA_NOT_CONFIGURED"
        status="BLOCKED"
        blockedReason="BLOCKED — HISTORICAL_DATA_NOT_CONFIGURED"
      />
      <BacktestingStatusCard />
    </div>
  );
}
