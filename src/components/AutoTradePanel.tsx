"use client";

import { useCallback, useEffect, useState } from "react";
import { AUTO_LEVELS, type AutoLevel } from "@/lib/core/types";
import { StatusBadge } from "./StatusBadge";
import { cn } from "@/lib/utils/cn";

interface AutoValidation {
  status: string;
  failedGate: string | null;
  blockedReason: string | null;
  stakeDecision: {
    userRequestedStake: number;
    aiRecommendedStake: number;
    finalAllowedStake: number;
    reason: string;
  } | null;
}

interface AutoDecision {
  id: string;
  at: string;
  autoLevel: AutoLevel;
  tradeStatus: string;
  opportunityId: string | null;
  market: string | null;
  reason: string;
  failedGate: string | null;
  simulationLabel?: string;
}

interface AutoState {
  executionMode: string;
  autoLevel: AutoLevel;
  runtimeState: string;
  autoSelected: boolean;
  autoActive: boolean;
  scanning: boolean;
  scanningStatus: string;
  tradeStatus: string;
  pauseReason: string | null;
  latestCandidate: {
    id: string;
    market: string;
    game: string;
    netEdge: number;
    state: string;
  } | null;
  latestValidation: AutoValidation | null;
  lastSubmitted: AutoDecision | null;
  lastBlocked: AutoDecision | null;
  stakeLimits: {
    userMaxStake: number;
    aiRecommendedStake: number | null;
    finalAllowedStake: number | null;
    maxStakePercent: number;
    maxDailyLossPercent: number;
  };
  counters: {
    autoTradesToday: number;
    openAutoTrades: number;
    maxAutoTradesPerDay: number;
    maxOpenAutoTrades: number;
    tradesToday: number;
    dailyRealizedLoss: number;
  };
  paperLabel: string;
  shadowStats: { captured: number; missed: number; label: string };
  logs: AutoDecision[];
  autoStatus: Record<string, string> | null;
  note: string;
}

export function AutoTradePanel() {
  const [state, setState] = useState<AutoState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/core/auto-trade");
      setState(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 20_000);
    return () => clearInterval(interval);
  }, [load]);

  async function post(body: Record<string, unknown>) {
    setSaving(true);
    try {
      const res = await fetch("/api/core/auto-trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setState(await res.json());
    } finally {
      setSaving(false);
    }
  }

  async function setLevel(level: AutoLevel) {
    await post({ autoLevel: level, executionMode: "AUTO" });
  }

  async function activateAuto() {
    await post({ executionMode: "AUTO" });
  }

  if (loading) return <p className="text-sm text-edge-muted">Loading auto status...</p>;
  if (!state) return <p className="text-sm text-edge-danger">Failed to load auto status</p>;

  const isAuto = state.executionMode === "AUTO";
  const badgeVariant =
    state.runtimeState === "AUTO_EMERGENCY_STOP"
      ? "danger"
      : state.runtimeState === "AUTO_PAUSED"
        ? "warn"
        : isAuto
          ? "success"
          : "info";

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-edge-border bg-edge-surface p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-medium">Auto Trade System</h3>
          <StatusBadge variant={badgeVariant}>{state.runtimeState}</StatusBadge>
        </div>

        <p className="text-xs text-edge-muted">{state.note}</p>

        {!isAuto && (
          <button
            type="button"
            disabled={saving}
            onClick={activateAuto}
            className="rounded border border-edge-accent bg-edge-accent/15 px-4 py-2 text-sm text-edge-accent hover:bg-edge-accent/25"
          >
            Activate Auto Mode
          </button>
        )}

        <div>
          <p className="mb-2 text-xs text-edge-muted">Auto level (always selectable)</p>
          <div className="flex flex-wrap gap-2">
            {AUTO_LEVELS.map((level) => (
              <button
                key={level}
                type="button"
                disabled={saving}
                onClick={() => setLevel(level)}
                className={cn(
                  "rounded border px-3 py-1.5 text-xs",
                  state.autoLevel === level
                    ? "border-edge-accent bg-edge-accent/15 text-edge-accent"
                    : "border-edge-border text-edge-muted hover:text-slate-200"
                )}
              >
                {level}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={() => post({ action: "scan" })}
            className="rounded border border-edge-border px-3 py-1.5 text-xs hover:text-slate-200"
          >
            Scan Now
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => post({ action: state.pauseReason ? "resume" : "pause" })}
            className="rounded border border-edge-border px-3 py-1.5 text-xs hover:text-slate-200"
          >
            {state.pauseReason ? "Resume Auto" : "Pause Auto"}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => post({ action: "emergency_stop" })}
            className="rounded border border-red-800/50 bg-red-950/30 px-3 py-1.5 text-xs text-red-300 hover:bg-red-950/50"
          >
            Emergency Stop
          </button>
          {state.runtimeState === "AUTO_EMERGENCY_STOP" && (
            <button
              type="button"
              disabled={saving}
              onClick={() => post({ action: "clear_emergency" })}
              className="rounded border border-edge-border px-3 py-1.5 text-xs hover:text-slate-200"
            >
              Clear Emergency Stop
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-edge-border bg-edge-surface p-5 space-y-3">
          <h4 className="text-sm font-medium">Scanning & Status</h4>
          <dl className="space-y-2 text-xs">
            <Row label="Active" value={state.autoActive ? "YES" : "NO"} />
            <Row label="Scanning" value={state.scanning ? "AUTO_SCANNING" : state.scanningStatus} />
            <Row label="Trade status" value={state.tradeStatus} />
            {state.pauseReason && <Row label="Pause reason" value={state.pauseReason} />}
          </dl>
        </div>

        <div className="rounded-xl border border-edge-border bg-edge-surface p-5 space-y-3">
          <h4 className="text-sm font-medium">Auto Stake Limits</h4>
          <dl className="space-y-2 text-xs">
            <Row label="User max stake" value={`$${state.stakeLimits.userMaxStake}`} />
            <Row label="AI recommended" value={fmtStake(state.stakeLimits.aiRecommendedStake)} />
            <Row label="Final allowed" value={fmtStake(state.stakeLimits.finalAllowedStake)} />
            <Row label="Max stake %" value={`${state.stakeLimits.maxStakePercent}% bankroll`} />
            <Row label="Max daily loss" value={`${state.stakeLimits.maxDailyLossPercent}% bankroll`} />
          </dl>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-edge-border bg-edge-surface p-5 space-y-3">
          <h4 className="text-sm font-medium">Latest Candidate</h4>
          {state.latestCandidate ? (
            <dl className="space-y-2 text-xs">
              <Row label="Market" value={state.latestCandidate.market} />
              <Row label="Game" value={state.latestCandidate.game} />
              <Row label="Net edge" value={`${(state.latestCandidate.netEdge * 100).toFixed(2)}%`} />
              <Row label="State" value={state.latestCandidate.state} />
            </dl>
          ) : (
            <p className="text-xs text-edge-muted">AUTO_WAITING_FOR_VALID_TRADE</p>
          )}
        </div>

        <div className="rounded-xl border border-edge-border bg-edge-surface p-5 space-y-3">
          <h4 className="text-sm font-medium">Latest Validation</h4>
          {state.latestValidation ? (
            <dl className="space-y-2 text-xs">
              <Row label="Status" value={state.latestValidation.status} />
              {state.latestValidation.failedGate && (
                <Row label="Failed gate" value={state.latestValidation.failedGate} />
              )}
              {state.latestValidation.blockedReason && (
                <Row label="Reason" value={state.latestValidation.blockedReason} />
              )}
            </dl>
          ) : (
            <p className="text-xs text-edge-muted">No validation run yet</p>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <DecisionCard title="Last Submitted Auto Trade" decision={state.lastSubmitted} />
        <DecisionCard title="Last Blocked Auto Trade" decision={state.lastBlocked} />
      </div>

      <div className="rounded-xl border border-edge-border bg-edge-surface p-5 space-y-3">
        <h4 className="text-sm font-medium">Counters</h4>
        <dl className="grid gap-2 text-xs sm:grid-cols-2">
          <Row label="Auto trades today" value={String(state.counters.autoTradesToday)} />
          <Row label="Max Auto trades/day" value={String(state.counters.maxAutoTradesPerDay)} />
          <Row label="Open Auto trades" value={String(state.counters.openAutoTrades)} />
          <Row label="Max open Auto trades" value={String(state.counters.maxOpenAutoTrades)} />
          <Row label="All trades today" value={String(state.counters.tradesToday)} />
          <Row label="Daily realized loss" value={`$${state.counters.dailyRealizedLoss.toFixed(2)}`} />
        </dl>
        <p className="text-xs text-edge-muted">{state.paperLabel}</p>
        <p className="text-xs text-edge-muted">
          {state.shadowStats.label} — captured {state.shadowStats.captured}, missed{" "}
          {state.shadowStats.missed}
        </p>
      </div>

      {state.logs.length > 0 && (
        <div className="rounded-xl border border-edge-border bg-edge-surface p-5 space-y-3">
          <h4 className="text-sm font-medium">Auto Decision Logs</h4>
          <div className="max-h-64 overflow-y-auto space-y-2">
            {state.logs.map((log) => (
              <div key={log.id} className="rounded border border-edge-border px-3 py-2 text-xs">
                <div className="flex justify-between text-edge-muted">
                  <span>{new Date(log.at).toLocaleString()}</span>
                  <span>{log.tradeStatus}</span>
                </div>
                <p className="mt-1 font-mono text-slate-200">{log.market ?? "—"}</p>
                <p className="text-edge-muted">{log.reason}</p>
                {log.failedGate && (
                  <p className="text-edge-danger">Gate: {log.failedGate}</p>
                )}
                {log.simulationLabel && (
                  <p className="text-edge-accent">{log.simulationLabel}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-edge-muted">{label}</dt>
      <dd className="font-mono text-slate-200 text-right">{value}</dd>
    </div>
  );
}

function fmtStake(v: number | null) {
  return v != null ? `$${v.toFixed(2)}` : "—";
}

function DecisionCard({
  title,
  decision,
}: {
  title: string;
  decision: AutoDecision | null;
}) {
  return (
    <div className="rounded-xl border border-edge-border bg-edge-surface p-5 space-y-3">
      <h4 className="text-sm font-medium">{title}</h4>
      {decision ? (
        <dl className="space-y-2 text-xs">
          <Row label="Time" value={new Date(decision.at).toLocaleString()} />
          <Row label="Market" value={decision.market ?? "—"} />
          <Row label="Status" value={decision.tradeStatus} />
          <Row label="Reason" value={decision.reason} />
          {decision.failedGate && <Row label="Failed gate" value={decision.failedGate} />}
          {decision.simulationLabel && <Row label="Label" value={decision.simulationLabel} />}
        </dl>
      ) : (
        <p className="text-xs text-edge-muted">None yet</p>
      )}
    </div>
  );
}
