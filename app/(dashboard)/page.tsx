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
      : status.kalshiBalanceStatus === "KALSHI_BALANCE_FAILED"
        ? "Balance unavailable"
        : "Not connected";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Kalshi-first review — sportsbook edge is optional."
        badge={status.providersReady ? "PRODUCTION" : "SETUP_REQUIRED"}
      />

      <section className="rounded-xl border border-edge-border bg-edge-surface p-5 space-y-4">
        <h2 className="font-medium">Status</h2>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <Row label="Production key pair test" value={status.kalshiKeyPairStatus} />
          <Row label="Exchange status" value={status.kalshiExchangeStatus} />
          <Row label="Balance status" value={status.kalshiBalanceStatus} />
          <Row label="Market scan status" value={status.kalshiMarketScanStatus} />
          <Row label="Kalshi markets found" value={String(status.kalshiMarketsFound)} />
          <Row label="Balance" value={bankrollLabel} />
          <Row label="Odds edge" value={status.oddsEdgeStatus} />
        </dl>
        {status.topReviewMarkets.length > 0 ? (
          <div>
            <p className="text-xs text-edge-muted mb-2">Best Kalshi markets to review</p>
            <ul className="space-y-1 text-sm font-mono">
              {status.topReviewMarkets.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {status.primaryBlocker ? (
          <p className="text-sm text-amber-300">
            Blocker: {status.primaryBlocker}
          </p>
        ) : null}
        <p className="text-sm text-edge-muted">Next action: {status.nextAction}</p>
        <div className="flex flex-wrap gap-2 pt-2">
          <Link
            href="/kalshi-markets"
            className="rounded border border-edge-accent px-3 py-1.5 text-sm text-edge-accent"
          >
            Kalshi Markets
          </Link>
          <Link
            href="/settings/keys"
            className="rounded border border-edge-border px-3 py-1.5 text-sm text-edge-muted hover:text-slate-200"
          >
            Settings
          </Link>
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
