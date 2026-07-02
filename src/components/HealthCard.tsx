import { StatusBadge } from "./StatusBadge";

export function HealthCard({
  label,
  value,
  variant = "default",
}: {
  label: string;
  value: string;
  variant?: "default" | "success" | "warn" | "danger" | "info" | "muted";
}) {
  return (
    <div className="rounded-xl border border-edge-border bg-edge-surface p-4">
      <p className="text-xs text-edge-muted">{label}</p>
      <div className="mt-2">
        <StatusBadge variant={variant}>{value}</StatusBadge>
      </div>
    </div>
  );
}
