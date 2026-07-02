import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { KalshiMarketsTabs } from "@/components/KalshiMarketsTabs";
import { OpportunityTable } from "@/components/OpportunityTable";
import {
  buildKalshiMarketsResponse,
  buildOpportunityScanResponse,
} from "@/lib/server/opportunities/opportunity-service";
import { getKeyReadinessReport } from "@/lib/server/keys/key-service";

export const dynamic = "force-dynamic";

export default async function KalshiMarketsPage({
  searchParams,
}: {
  searchParams: Promise<{ oddsEdge?: string }>;
}) {
  const { oddsEdge } = await searchParams;
  const includeOddsEdge = oddsEdge === "1";
  const [data, readiness] = await Promise.all([
    buildKalshiMarketsResponse(),
    getKeyReadinessReport(),
  ]);
  const oddsScan = includeOddsEdge
    ? await buildOpportunityScanResponse({ includeOddsEdge: true })
    : null;
  const diag = data.scanDiagnostics;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Kalshi Markets"
        description="Kalshi-only ranking — review markets before optional sportsbook edge matching."
        badge={data.dataLabel}
      />

      <section className="rounded-lg border border-edge-border bg-edge-surface/50 px-4 py-3 text-sm space-y-2">
        <p className="font-medium">{data.message}</p>
        {diag ? (
          <>
            <p className="text-xs font-mono text-edge-muted">
              Kalshi {diag.kalshiRequestPath}?limit={diag.kalshiQueryUsed.limit} —{" "}
              {diag.kalshiActiveMarkets} tradeable markets ({diag.kalshiQueryUsed.pagesFetched ?? "?"} pages)
            </p>
            <p className="text-xs">
              Odds edge: <strong>{diag.oddsEdgeStatus}</strong>
            </p>
          </>
        ) : null}
        <div className="flex flex-wrap gap-2 pt-1">
          {includeOddsEdge ? (
            <Link
              href="/kalshi-markets"
              className="rounded border border-edge-border px-3 py-1.5 text-sm text-edge-muted hover:text-slate-200"
            >
              Back to Kalshi-only
            </Link>
          ) : (
            <Link
              href="/kalshi-markets?oddsEdge=1"
              className="rounded border border-edge-accent px-3 py-1.5 text-sm text-edge-accent"
            >
              Find sportsbook edge
            </Link>
          )}
          {!readiness.oddsConfigured && !includeOddsEdge ? (
            <span className="text-xs text-edge-muted self-center">
              Odds API key optional — Kalshi-only mode works without it.
            </span>
          ) : null}
        </div>
      </section>

      {diag?.first20MarketTitles && diag.first20MarketTitles.length > 0 ? (
        <details className="rounded-lg border border-edge-border bg-edge-surface/50 px-4 py-3 text-xs">
          <summary className="cursor-pointer text-edge-muted">
            First {diag.first20MarketTitles.length} Kalshi market titles returned
          </summary>
          <ol className="mt-2 list-decimal space-y-1 pl-4 font-mono">
            {diag.first20MarketTitles.map((t, i) => (
              <li key={`${i}-${t}`}>{t}</li>
            ))}
          </ol>
        </details>
      ) : null}

      <KalshiMarketsTabs markets={data.markets} dataLabel={data.dataLabel} />

      {includeOddsEdge ? (
        <section className="space-y-3">
          <h2 className="text-sm font-medium">Sportsbook edge (Odds API)</h2>
          {!readiness.oddsConfigured ? (
            <p className="text-sm text-amber-300">
              Odds API key not configured — add one in Settings to run sportsbook edge matching.
            </p>
          ) : (
            <>
              <p className="text-sm text-edge-muted">{oddsScan?.message}</p>
              <OpportunityTable
                items={oddsScan?.items ?? []}
                dataLabel={oddsScan?.dataLabel ?? "ODDS_NOT_USED_KALSHI_FIRST"}
                message={oddsScan?.message}
              />
            </>
          )}
        </section>
      ) : null}
    </div>
  );
}
