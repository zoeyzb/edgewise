import { PageHeader } from "@/components/PageHeader";
import { StakePanel } from "@/components/StakePanel";
import { DataSourceBar } from "@/components/DataSourceBar";
import { buildAccountResponseFromProviders } from "@/lib/server/providers/provider-health";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const live = await buildAccountResponseFromProviders();

  const dataLabel = live?.dataLabel ?? "PROVIDER_NOT_CONFIGURED";
  const connected = live?.bankroll?.label === "KALSHI_BALANCE";
  const bankrollValue =
    connected && live?.bankroll?.value != null && typeof live.bankroll.value === "number"
      ? `$${live.bankroll.value.toFixed(2)}`
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
                : "Configure production Kalshi API + private key in Settings"}
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
