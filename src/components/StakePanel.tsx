"use client";

import { useCallback, useEffect, useState } from "react";
import { STAKE_MODES, type StakeMode } from "@/lib/core/types";
import { StatusBadge } from "./StatusBadge";
import { cn } from "@/lib/utils/cn";

interface StakePreview {
  userRequestedStake: number;
  aiRecommendedStake: number;
  finalAllowedStake: number;
  maxLoss: number;
  expectedDollarProfit: number;
  decision: "ALLOWED" | "REDUCED" | "BLOCKED";
  reason: string;
}

interface StakeSettings {
  mode: StakeMode;
  fixedDollarAmount: number;
  fixedPercentAmount: number;
  userMaxStake: number;
  dailyMaxLoss: number;
  sessionMaxLoss: number;
  maxOpenExposure: number;
  maxTradesPerDay: number;
  maxAutoTradesPerDay: number;
  bankrollPlaceholder: number;
}

export function StakePanel({ compact = false }: { compact?: boolean }) {
  const [settings, setSettings] = useState<StakeSettings | null>(null);
  const [preview, setPreview] = useState<StakePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/core/risk");
      const data = await res.json();
      setSettings(data.stakeSettings);
      setPreview(data.stakePreview);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save(patch: Partial<StakeSettings>) {
    if (!settings) return;
    setSaving(true);
    try {
      const res = await fetch("/api/core/risk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stakeSettings: { ...settings, ...patch } }),
      });
      const data = await res.json();
      setSettings(data.stakeSettings);
      setPreview(data.stakePreview);
    } finally {
      setSaving(false);
    }
  }

  if (loading || !settings) {
    return <p className="text-sm text-edge-muted">Loading stake settings...</p>;
  }

  return (
    <div className={cn("space-y-4 rounded-xl border border-edge-border bg-edge-surface p-5", compact && "p-4")}>
      <div className="flex items-center justify-between">
        <h3 className="font-medium">Stake Control</h3>
        <StatusBadge variant="muted">RISK ENGINE</StatusBadge>
      </div>

      <div className="flex flex-wrap gap-2">
        {STAKE_MODES.map((mode) => (
          <button
            key={mode}
            type="button"
            disabled={saving}
            onClick={() => save({ mode })}
            className={cn(
              "rounded border px-2 py-1 text-[10px] font-mono",
              settings.mode === mode
                ? "border-edge-accent bg-edge-accent/15 text-edge-accent"
                : "border-edge-border text-edge-muted"
            )}
          >
            {mode}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Fixed dollar" type="number" value={settings.fixedDollarAmount}
          onChange={(v) => save({ fixedDollarAmount: v })} />
        <Field label="Fixed percent" type="number" value={settings.fixedPercentAmount}
          onChange={(v) => save({ fixedPercentAmount: v })} step={0.1} />
        <Field label="User max stake" type="number" value={settings.userMaxStake}
          onChange={(v) => save({ userMaxStake: v })} />
        <Field label="Bankroll (placeholder)" type="number" value={settings.bankrollPlaceholder}
          onChange={(v) => save({ bankrollPlaceholder: v })} />
        <Field label="Daily max loss %" type="number" value={settings.dailyMaxLoss}
          onChange={(v) => save({ dailyMaxLoss: v })} step={0.1} />
        <Field label="Session max loss %" type="number" value={settings.sessionMaxLoss}
          onChange={(v) => save({ sessionMaxLoss: v })} step={0.1} />
        <Field label="Max open exposure %" type="number" value={settings.maxOpenExposure}
          onChange={(v) => save({ maxOpenExposure: v })} step={0.1} />
        <Field label="Max trades / day" type="number" value={settings.maxTradesPerDay}
          onChange={(v) => save({ maxTradesPerDay: v })} />
        <Field label="Max Auto trades / day" type="number" value={settings.maxAutoTradesPerDay}
          onChange={(v) => save({ maxAutoTradesPerDay: v })} />
      </div>

      {preview && (
        <div className="rounded-lg border border-edge-border bg-edge-bg/50 p-4">
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-edge-muted">
            Stake Preview
          </p>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <PreviewRow label="User requested stake" value={`$${preview.userRequestedStake}`} />
            <PreviewRow label="AI recommended stake" value={`$${preview.aiRecommendedStake}`} />
            <PreviewRow label="Final allowed stake" value={`$${preview.finalAllowedStake}`} />
            <PreviewRow label="Max loss" value={`$${preview.maxLoss}`} />
            <PreviewRow label="Expected dollar profit" value={`$${preview.expectedDollarProfit}`} />
            <PreviewRow label="Stake reason" value={preview.reason} />
          </dl>
          {preview.decision === "BLOCKED" && (
            <p className="mt-3 font-mono text-xs text-red-300">STAKE_BLOCKED_BY_RISK_ENGINE</p>
          )}
          {preview.decision === "REDUCED" && (
            <p className="mt-3 font-mono text-xs text-amber-300">STAKE_REDUCED_BY_RISK_ENGINE</p>
          )}
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  step,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  type?: string;
  step?: number;
}) {
  return (
    <label className="block text-xs">
      <span className="text-edge-muted">{label}</span>
      <input
        type={type}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full rounded border border-edge-border bg-edge-bg px-3 py-2 text-sm text-slate-100"
      />
    </label>
  );
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-edge-muted">{label}</dt>
      <dd className="font-mono text-sm">{value}</dd>
    </div>
  );
}
