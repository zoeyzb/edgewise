import { PageHeader } from "@/components/PageHeader";
import { buildPageProviderStatus } from "@/lib/server/providers/scan-status";
import { buildAccountResponseFromProviders } from "@/lib/server/providers/provider-health";
import Link from "next/link";

export default async function DashboardPage() {
  const [status, account] = await Promise.all([
    buildPageProviderStatus(),
    buildAccountResponseFromProviders(),
  ]);

  const bankrollLabel = account?.bankroll?.label === "KALSHI_BALANCE"
    ? `$${account.bankroll.value.toFixed(2)} (Kalshi)`
    : account?.bankroll?.value != null
      ? `$${account.bankroll.value.toFixed(2)}`
      : "Not connected";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Provider status and scanner summary."
        badge={status.providersReady ? "PRODUCTION" : "SETUP_REQUIRED"}
      />

      <section className="rounded-xl border border-edge-border bg-edge-surface p-5 space-y-4">
        <h2 className="font-medium">Status</h2>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <Row label="Kalshi" value={`${status.kalshiAuth} (${status.kalshiMode})`} />
          <Row label="Odds API" value={status.oddsStatus} />
          <Row label="Kalshi sports markets" value={String(status.kalshiSportsMarkets)} />
          <Row label="Event matches" value={String(status.matchedMarkets)} />
          <Row label="BETTABLE opportunities" value={String(status.bettableCount)} />
          <Row label="Bankroll" value={bankrollLabel} />
        </dl>
        {status.primaryBlocker ? (
          <p className="text-sm text-amber-300">
            Blocker: {status.primaryBlocker}
          </p>
        ) : null}
        <p className="text-sm text-edge-muted">Next: {status.nextAction}</p>
        <div className="flex flex-wrap gap-2 pt-2">
          <Link
            href="/opportunities"
            className="rounded border border-edge-accent px-3 py-1.5 text-sm text-edge-accent"
          >
            View Opportunities
          </Link>
          <Link
            href="/settings/keys"
            className="rounded border border-edge-border px-3 py-1.5 text-sm text-edge-muted hover:text-slate-200"
          >
            Settings
          </Link>
          {status.bettableCount > 0 ? (
            <Link
              href="/auto-trade"
              className="rounded border border-edge-border px-3 py-1.5 text-sm text-edge-muted hover:text-slate-200"
            >
              Auto
            </Link>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-edge-muted">{label}</dt>
      <dd className="font-mono text-sm">{value}</dd>
    </div>
  );
}
