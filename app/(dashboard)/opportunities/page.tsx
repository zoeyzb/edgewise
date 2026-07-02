import { PageHeader } from "@/components/PageHeader";
import { OpportunityTable } from "@/components/OpportunityTable";
import { buildOpportunityScanResponse } from "@/lib/server/opportunities/opportunity-service";

export default async function OpportunitiesPage() {
  const data = await buildOpportunityScanResponse();
  const diag = data.scanDiagnostics;
  const sportsList = diag?.kalshiSportsMarketsList ?? [];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Opportunities"
        description="Kalshi sports markets first — Odds edge only after Kalshi markets are visible."
        badge={data.dataLabel}
      />

      <section className="rounded-lg border border-edge-border bg-edge-surface/50 px-4 py-3 text-sm space-y-2">
        <p className="font-medium">{data.message}</p>
        {diag ? (
          <>
            <p className="text-xs font-mono text-edge-muted">
              Status: {(diag.phaseStatuses ?? [diag.phaseStatus]).filter(Boolean).join(" · ")}
            </p>
            <p className="text-xs font-mono text-edge-muted">
              Kalshi {diag.kalshiRequestPath}?status={diag.kalshiQueryUsed.status}&amp;limit=
              {diag.kalshiQueryUsed.limit} — checked {diag.kalshiActiveMarkets} markets (
              {diag.kalshiQueryUsed.pagesFetched ?? "?"} pages)
            </p>
            <p className="text-xs">
              Kalshi sports markets found: <strong>{diag.kalshiSportsMarkets}</strong>
              {diag.oddsUsed === false ? " · Odds API not used (Kalshi-first)" : ""}
              {diag.matchedMarkets > 0 ? ` · ${diag.matchedMarkets} Odds-matched` : ""}
            </p>
            {diag.primaryBlockReason ? (
              <p className="text-xs text-amber-300">Blocker: {diag.primaryBlockReason.replaceAll("_", " ")}</p>
            ) : null}
          </>
        ) : null}
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

      {sportsList.length > 0 ? (
        <section className="rounded-xl border border-edge-border overflow-hidden">
          <div className="border-b border-edge-border bg-edge-surface px-4 py-3">
            <h2 className="text-sm font-medium">Kalshi sports markets ({sportsList.length})</h2>
            <p className="text-xs text-edge-muted mt-1">
              {data.items.length === 0
                ? "No Odds edge yet — markets visible, matching/EV pending or blocked."
                : `${data.items.length} opportunity candidates from Odds matching.`}
            </p>
          </div>
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 border-b border-edge-border bg-edge-bg text-edge-muted uppercase">
                <tr>
                  <th className="px-3 py-2">Ticker</th>
                  <th className="px-3 py-2">Title</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Vol / OI</th>
                  <th className="px-3 py-2">Hint</th>
                </tr>
              </thead>
              <tbody>
                {sportsList.map((m) => (
                  <tr key={m.ticker} className="border-b border-edge-border/40">
                    <td className="px-3 py-2 font-mono">{m.ticker}</td>
                    <td className="px-3 py-2">{m.title}</td>
                    <td className="px-3 py-2">{m.status ?? "—"}</td>
                    <td className="px-3 py-2 font-mono">
                      {m.volumeFp ?? "—"} / {m.openInterestFp ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-edge-muted">{m.matchedHint ?? "sports"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {diag?.kalshiAllMarketsSample && diag.kalshiActiveMarkets > 0 && sportsList.length === 0 ? (
        <details className="rounded-lg border border-edge-border bg-edge-surface/50 px-4 py-3 text-xs">
          <summary className="cursor-pointer text-edge-muted">
            All Kalshi markets sample — classification diagnostics
          </summary>
          <div className="mt-2 max-h-64 overflow-y-auto space-y-1 font-mono">
            {diag.kalshiAllMarketsSample.slice(0, 50).map((m) => (
              <p key={m.ticker}>
                {m.ticker} · {m.category}
                {m.rejectReason ? ` · ${m.rejectReason}` : ""} · {m.title}
              </p>
            ))}
          </div>
        </details>
      ) : null}

      <OpportunityTable items={data.items} dataLabel={data.dataLabel} message={undefined} />
    </div>
  );
}
