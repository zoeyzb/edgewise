import { PageHeader } from "@/components/PageHeader";
import { StakePanel } from "@/components/StakePanel";
import { DataSourceBar } from "@/components/DataSourceBar";
import { buildAccountResponse } from "@/lib/api/responses";
import { buildAccountResponseFromProviders } from "@/lib/server/providers/provider-health";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const [live, account] = await Promise.all([
    buildAccountResponseFromProviders(),
    buildAccountResponse(),
  ]);

  const dataLabel = live?.dataLabel ?? account.dataLabel ?? "PLACEHOLDER_UI_ONLY";
  const bankroll = live?.bankroll ?? account.bankroll;
  const connected = live?.bankroll?.label === "KALSHI_BALANCE";
  const bankrollValue =
    bankroll?.value != null && typeof bankroll.value === "number"
      ? `$${bankroll.value.toFixed(2)}`
      : "—";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Account"
        description="Bankroll and stake overview."
        badge={dataLabel}
      />
      <DataSourceBar
        dataLabel={dataLabel}
        status={connected ? "Connected to Kalshi" : "Not connected to Kalshi"}
        freshness={connected ? "Live production balance" : "—"}
        blockedReason={
          connected
            ? null
            : "Configure production Kalshi API + private key in Settings"
        }
      />
      <div className="rounded-xl border border-edge-border bg-edge-surface p-5">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-edge-muted">Bankroll</dt>
            <dd className="font-mono">{bankrollValue}</dd>
            <p className="text-xs text-edge-muted mt-1">
              {connected
                ? "Sanitized Kalshi production balance"
                : bankroll?.note ?? "Placeholder bankroll for stake math"}
            </p>
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
