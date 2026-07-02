import { cn } from "@/lib/utils/cn";

const variants = {
  default: "bg-slate-700/50 text-slate-200 border-edge-border",
  success: "bg-edge-accent/10 text-edge-accent border-edge-accent/30",
  warn: "bg-amber-500/10 text-amber-300 border-amber-500/30",
  danger: "bg-red-500/10 text-red-300 border-red-500/30",
  info: "bg-sky-500/10 text-sky-300 border-sky-500/30",
  muted: "bg-edge-surface text-edge-muted border-edge-border",
} as const;

export function StatusBadge({
  children,
  variant = "default",
  className,
}: {
  children: React.ReactNode;
  variant?: keyof typeof variants;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide",
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
