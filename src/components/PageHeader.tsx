import { StatusBadge } from "./StatusBadge";

export function PageHeader({
  title,
  description,
  badge,
}: {
  title: string;
  description?: string;
  badge?: string;
}) {
  return (
    <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && (
          <p className="mt-1 max-w-2xl text-sm text-edge-muted">{description}</p>
        )}
      </div>
      {badge && <StatusBadge variant="muted">{badge}</StatusBadge>}
    </div>
  );
}
