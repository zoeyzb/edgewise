import { PageHeader } from "@/components/PageHeader";
import { ProviderStatusBar } from "@/components/ProviderStatusBar";
import { HealthCard } from "@/components/HealthCard";
import { DataSourceBar } from "@/components/DataSourceBar";
import { buildHealthSnapshot } from "@/lib/api/responses";

export default async function SettingsProvidersPage() {
  const health = await buildHealthSnapshot();

  return (
    <div className="space-y-6">
      <PageHeader title="Providers" description="Kalshi and Odds API connection status." badge="PROVIDER_NOT_CONFIGURED" />
      <DataSourceBar
        dataLabel={health.dataLabel}
        status={health.kalshiStatus}
        freshness="Provider health snapshot"
        blockedReason="Configure keys to connect providers"
      />
      <ProviderStatusBar />
      <div className="grid gap-3 sm:grid-cols-2">
        <HealthCard label="Kalshi" value={health.kalshiStatus} variant="warn" />
        <HealthCard label="Odds API" value={health.oddsApiStatus} variant="warn" />
      </div>
      <p className="text-sm text-edge-muted">
        Configure keys in{" "}
        <a href="/settings/keys" className="text-edge-accent underline">
          API Keys
        </a>
        . Provider test calls are placeholders until integration is built.
      </p>
    </div>
  );
}
