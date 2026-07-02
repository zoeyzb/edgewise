export function MoneyScoreCard({
  title,
  score,
  note,
}: {
  title: string;
  score: string;
  note: string;
}) {
  return (
    <div className="rounded-xl border border-edge-border bg-edge-surface p-4">
      <p className="text-xs text-edge-muted">{title}</p>
      <p className="mt-2 text-2xl font-semibold font-mono">{score}</p>
      <p className="mt-2 text-xs text-edge-muted">{note}</p>
    </div>
  );
}
