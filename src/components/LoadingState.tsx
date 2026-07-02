export function LoadingState({ message = "Loading..." }: { message?: string }) {
  return (
    <div className="flex items-center justify-center rounded-xl border border-edge-border bg-edge-surface px-6 py-16">
      <div className="flex items-center gap-3 text-sm text-edge-muted">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-edge-muted border-t-edge-accent" />
        {message}
      </div>
    </div>
  );
}
