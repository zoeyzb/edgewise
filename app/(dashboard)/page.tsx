import { PageHeader } from "@/components/PageHeader";
import { ExecutionStatusCard } from "@/components/ExecutionStatusCard";
import { ProfitabilitySummary } from "@/components/ProfitabilitySummary";
import { MoneyScoreCard } from "@/components/MoneyScoreCard";
import { AutoTradePanel } from "@/components/AutoTradePanel";
import { StakePanel } from "@/components/StakePanel";
import Link from "next/link";

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Profit-first Kalshi sports edge hunter. Aggressive discovery, conservative execution."
        badge="PLACEHOLDER_UI_ONLY"
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <MoneyScoreCard title="Edge Quality Score" score="—" note="NO_REAL_DATA_CONNECTED" />
        <MoneyScoreCard title="Money Confidence" score="—" note="PROVIDER_NOT_CONFIGURED" />
        <MoneyScoreCard title="Profit Priority" score="—" note="AWAITING OPPORTUNITIES" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ExecutionStatusCard />
        <ProfitabilitySummary />
      </div>

      <AutoTradePanel />

      <StakePanel compact />

      <section className="rounded-xl border border-edge-border bg-edge-surface p-5">
        <h2 className="font-medium">Quick Links</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {[
            ["/opportunities", "Opportunities"],
            ["/best-bets", "Best Bets"],
            ["/auto-trade", "Auto Trade"],
            ["/settings/keys", "API Keys"],
            ["/health", "Health"],
          ].map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className="rounded border border-edge-border px-3 py-1.5 text-sm text-edge-muted hover:text-slate-200"
            >
              {label}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
