"use client";

import { useCallback, useEffect, useState } from "react";
import { StatusBadge } from "./StatusBadge";

export function KillSwitchControl() {
  const [state, setState] = useState<{
    engaged: boolean;
    envKillSwitch: boolean;
    appKillSwitch: boolean;
    message: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch("/api/core/kill-switch");
    setState(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function toggle(enabled: boolean) {
    setLoading(true);
    await fetch("/api/core/kill-switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    await load();
  }

  if (loading || !state) {
    return <StatusBadge variant="muted">Kill switch loading…</StatusBadge>;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <StatusBadge variant={state.engaged ? "danger" : "success"}>
        Kill switch: {state.engaged ? "ON" : "OFF"}
      </StatusBadge>
      <button
        type="button"
        onClick={() => toggle(!state.appKillSwitch)}
        className="rounded border border-edge-border px-2 py-0.5 text-[10px] font-mono text-edge-muted"
      >
        Toggle app kill switch
      </button>
      {state.engaged ? (
        <span className="text-[10px] text-red-300">BLOCKED — KILL_SWITCH_ENABLED</span>
      ) : null}
    </div>
  );
}
