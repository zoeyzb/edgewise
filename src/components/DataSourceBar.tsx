export function DataSourceBar({
  dataLabel,
  status,
  freshness,
  blockedReason,
}: {
  dataLabel: string;
  status?: string;
  freshness?: string;
  blockedReason?: string | null;
}) {
  return (
    <div className="rounded-lg border border-edge-border bg-edge-surface/50 px-4 py-3 text-xs">
      <dl className="flex flex-wrap gap-x-6 gap-y-1">
        <div className="flex gap-2">
          <dt className="text-edge-muted">Data source</dt>
          <dd className="font-mono text-slate-200">{dataLabel}</dd>
        </div>
        {status ? (
          <div className="flex gap-2">
            <dt className="text-edge-muted">Status</dt>
            <dd className="font-mono text-slate-200">{status}</dd>
          </div>
        ) : null}
        {freshness ? (
          <div className="flex gap-2">
            <dt className="text-edge-muted">Freshness</dt>
            <dd className="font-mono text-slate-200">{freshness}</dd>
          </div>
        ) : null}
        {blockedReason ? (
          <div className="flex gap-2">
            <dt className="text-edge-muted">Blocked</dt>
            <dd className="font-mono text-amber-300">{blockedReason}</dd>
          </div>
        ) : null}
      </dl>
      <p className="mt-2 text-edge-muted">No fake real-money claims. No guaranteed win rate.</p>
    </div>
  );
}
