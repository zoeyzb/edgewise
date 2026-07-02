"use client";

import { useCallback, useEffect, useState } from "react";
import { RISK_CONFIG } from "@/lib/core/risk-config";
import { StatusBadge } from "./StatusBadge";
import { cn } from "@/lib/utils/cn";

interface StakePreview {
  userRequestedStake: number;
  aiRecommendedStake: number;
  suggestedStake?: number;
  finalAllowedStake: number;
  maxLoss: number;
  expectedDollarProfit: number;
  decision: "ALLOWED" | "REDUCED" | "BLOCKED";
  reason: string;
}

interface StakeSettings {
  mode: string;
  manualStakeMode: "DOLLAR" | "PERCENT" | "SUGGESTED";
  fixedDollarAmount: number;
  fixedPercentAmount: number;
  autoFixedDollarAmount: number;
  autoFixedPercentAmount: number;
  autoMaxDollarAmount: number;
  autoMaxPercentAmount: number;
  userMaxStake: number;
  bankrollPlaceholder: number;
}

export function StakePanel({ compact = false }: { compact?: boolean }) {
  const [settings, setSettings] = useState<StakeSettings | null>(null);
  const [preview, setPreview] = useState<StakePreview | null>(null);
  const [bankrollSource, setBankrollSource] = useState<string>("—");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [riskRes, accountRes] = await Promise.all([
        fetch("/api/core/risk"),
        fetch("/api/core/account"),
      ]);
      const data = await riskRes.json();
      const account = await accountRes.json();
      setSettings(data.stakeSettings);
      setPreview(data.stakePreview);
      setBankrollSource(
        account.bankroll?.label === "KALSHI_BALANCE"
          ? `Kalshi $${account.bankroll.value}`
          : account.bankroll?.label === "PLACEHOLDER_UI_ONLY"
            ? "Placeholder (connect Kalshi for real balance)"
            : account.bankroll?.value != null
              ? `$${account.bankroll.value}`
              : "Unknown"
      );
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

  function applySuggestedManual() {
    if (!preview) return;
    save({
      manualStakeMode: "SUGGESTED",
      mode: "AI_RECOMMENDED_STAKE",
      fixedDollarAmount: preview.aiRecommendedStake,
      fixedPercentAmount: RISK_CONFIG.conservativeStakePercent,
    });
  }

  if (loading || !settings) {
    return <p className="text-sm text-edge-muted">Loading stake settings...</p>;
  }

  return (
    <div className={cn("space-y-6 rounded-xl border border-edge-border bg-edge-surface p-5", compact && "p-4")}>
      <div className="flex items-center justify-between">
        <h3 className="font-medium">Stake Control</h3>
        <StatusBadge variant="muted">Bankroll: {bankrollSource}</StatusBadge>
      </div>

      <section className="space-y-3">
        <h4 className="text-sm font-medium">Manual trade</h4>
        <div className="flex flex-wrap gap-2">
          {(["DOLLAR", "PERCENT", "SUGGESTED"] as const).map((m) => (
            <button
              key={m}
              type="button"
              disabled={saving}
              onClick={() =>
                save({
                  manualStakeMode: m,
                  mode: m === "DOLLAR" ? "FIXED_DOLLAR_STAKE" : m === "PERCENT" ? "FIXED_PERCENT_STAKE" : "AI_RECOMMENDED_STAKE",
                })
              }
              className={cn(
                "rounded border px-2 py-1 text-[10px] font-mono",
                settings.manualStakeMode === m
                  ? "border-edge-accent bg-edge-accent/15 text-edge-accent"
                  : "border-edge-border text-edge-muted"
              )}
            >
              {m === "DOLLAR" ? "Exact $" : m === "PERCENT" ? "% bankroll" : "Suggested"}
            </button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Manual exact $"
            value={settings.fixedDollarAmount}
            onChange={(v) => save({ fixedDollarAmount: v, manualStakeMode: "DOLLAR", mode: "FIXED_DOLLAR_STAKE" })}
          />
          <Field
            label="Manual % bankroll"
            value={settings.fixedPercentAmount}
            step={0.5}
            onChange={(v) => save({ fixedPercentAmount: v, manualStakeMode: "PERCENT", mode: "FIXED_PERCENT_STAKE" })}
          />
        </div>
        <button
          type="button"
          disabled={saving || !preview}
          onClick={applySuggestedManual}
          className="rounded border border-edge-border px-3 py-1.5 text-xs hover:text-slate-200"
        >
          Use suggested amount ({preview ? `$${preview.aiRecommendedStake}` : "—"})
        </button>
      </section>

      <section className="space-y-3">
        <h4 className="text-sm font-medium">Auto trade</h4>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Auto exact $ / trade"
            value={settings.autoFixedDollarAmount}
            onChange={(v) => save({ autoFixedDollarAmount: v })}
          />
          <Field
            label="Auto % bankroll / trade"
            value={settings.autoFixedPercentAmount}
            step={0.5}
            onChange={(v) => save({ autoFixedPercentAmount: v })}
          />
          <Field
            label="Auto max $ / trade"
            value={settings.autoMaxDollarAmount}
            onChange={(v) => save({ autoMaxDollarAmount: v })}
          />
          <Field
            label="Auto max % bankroll"
            value={settings.autoMaxPercentAmount}
            step={0.5}
            onChange={(v) => save({ autoMaxPercentAmount: v })}
          />
        </div>
        <p className="text-xs text-edge-muted">
          Auto default max {RISK_CONFIG.autoDefaultMaxStakePercent}% · hard max {RISK_CONFIG.autoHardMaxStakePercent}%
          · manual-only above {RISK_CONFIG.manualConfirmStakePercent}% · blocked at {RISK_CONFIG.absoluteBlockStakePercent}%
        </p>
      </section>

      {preview && (
        <div className="rounded-lg border border-edge-border bg-edge-bg/50 p-4 text-sm">
          <dl className="grid gap-2 sm:grid-cols-2">
            <PreviewRow label="Requested" value={`$${preview.userRequestedStake}`} />
            <PreviewRow label="Suggested" value={`$${preview.suggestedStake ?? preview.aiRecommendedStake}`} />
            <PreviewRow label="Allowed" value={`$${preview.finalAllowedStake}`} />
            <PreviewRow label="Max loss" value={`$${preview.maxLoss}`} />
            <PreviewRow label="Expected profit" value={`$${preview.expectedDollarProfit}`} />
            <PreviewRow label="Reason" value={preview.reason} />
          </dl>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  step,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  return (
    <label className="block text-xs">
      <span className="text-edge-muted">{label}</span>
      <input
        type="number"
        step={step ?? 1}
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
