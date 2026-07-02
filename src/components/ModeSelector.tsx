"use client";

import { useCallback, useEffect, useState } from "react";
import { MAIN_EXECUTION_MODES, type ExecutionMode } from "@/lib/core/types";
import { StatusBadge } from "./StatusBadge";
import { cn } from "@/lib/utils/cn";

export function ModeSelector() {
  const [mode, setMode] = useState<ExecutionMode>("MANUAL");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/core/auto-trade");
      const data = await res.json();
      if (data.executionMode) setMode(data.executionMode);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function select(next: ExecutionMode) {
    setSaving(true);
    try {
      const res = await fetch("/api/core/auto-trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ executionMode: next }),
      });
      const data = await res.json();
      if (data.executionMode) setMode(data.executionMode);
    } finally {
      setSaving(false);
    }
  }

  const activeMode = MAIN_EXECUTION_MODES.includes(mode as (typeof MAIN_EXECUTION_MODES)[number])
    ? mode
    : "MANUAL";

  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="mr-2 text-xs text-edge-muted">Mode</span>
      {MAIN_EXECUTION_MODES.map((m) => (
        <button
          key={m}
          type="button"
          disabled={loading || saving}
          onClick={() => select(m)}
          className={cn(
            "rounded border px-2.5 py-1 text-xs font-medium transition-colors",
            activeMode === m
              ? "border-edge-accent bg-edge-accent/15 text-edge-accent"
              : "border-edge-border bg-edge-surface text-edge-muted hover:text-slate-200",
            m === "AUTO" && "ring-0"
          )}
        >
          {m}
        </button>
      ))}
      {mode === "AUTO" && (
        <StatusBadge variant="success" className="ml-1">
          AUTO_SELECTABLE
        </StatusBadge>
      )}
      {(mode === "PAPER" || mode === "SHADOW") && (
        <StatusBadge variant="muted" className="ml-1">
          {mode} (Advanced)
        </StatusBadge>
      )}
    </div>
  );
}
