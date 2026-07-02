export function ErrorState({
  title = "Something went wrong",
  message,
}: {
  title?: string;
  message: string;
}) {
  return (
    <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-6 py-8">
      <h3 className="font-medium text-red-200">{title}</h3>
      <p className="mt-2 text-sm text-edge-muted">{message}</p>
    </div>
  );
}
