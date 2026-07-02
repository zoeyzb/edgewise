import { PageHeader } from "@/components/PageHeader";
import { StakePanel } from "@/components/StakePanel";
import { DataSourceBar } from "@/components/DataSourceBar";
import { buildAccountResponse } from "@/lib/api/responses";

export default async function AccountPage() {
  const account = await buildAccountResponse();
  return (
    <div className="space-y-6">
      <PageHeader
        title="Account"
        description="Bankroll and stake overview."
        badge={account.dataLabel ?? "PLACEHOLDER_UI_ONLY"}
      />
      <DataSourceBar
        dataLabel={account.dataLabel ?? "PLACEHOLDER_UI_ONLY"}
        status={account.bankroll?.value != null ? "CONNECTED" : "PLACEHOLDER"}
        freshness="—"
        blockedReason={account.bankroll?.value == null ? "Bankroll from Kalshi when keys configured" : null}
      />
      <div className="rounded-xl border border-edge-border bg-edge-surface p-5">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-edge-muted">Bankroll</dt>
            <dd className="font-mono">
              {account.bankroll?.value != null ? `$${account.bankroll.value}` : "—"}
            </dd>
            <p className="text-xs text-edge-muted mt-1">{account.bankroll?.note ?? "Placeholder bankroll for stake math"}</p>
          </div>
          <div>
            <dt className="text-xs text-edge-muted">Profitability status</dt>
            <dd className="font-mono text-amber-300">UNPROVEN</dd>
          </div>
        </dl>
      </div>
      <StakePanel />
    </div>
  );
}
