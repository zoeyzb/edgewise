export function EmptyState({
  title,
  message,
  label = "NO_REAL_DATA_CONNECTED",
}: {
  title: string;
  message: string;
  label?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-edge-border bg-edge-surface/50 px-6 py-16 text-center">
      <p className="font-mono text-[10px] uppercase tracking-widest text-edge-muted">
        {label}
      </p>
      <h3 className="mt-3 text-base font-medium">{title}</h3>
      <p className="mt-2 max-w-md text-sm text-edge-muted">{message}</p>
    </div>
  );
}
