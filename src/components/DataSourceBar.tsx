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
  if (!blockedReason && !status && !freshness) return null;

  return (
    <div className="rounded-lg border border-edge-border bg-edge-surface/50 px-4 py-3 text-xs">
      {blockedReason ? (
        <p className="text-amber-300">{blockedReason}</p>
      ) : (
        <p className="font-mono text-edge-muted">
          {dataLabel}
          {status ? ` · ${status}` : ""}
          {freshness ? ` · ${freshness}` : ""}
        </p>
      )}
    </div>
  );
}
