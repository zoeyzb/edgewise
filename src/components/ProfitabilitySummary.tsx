"use client";

import { useEffect, useState } from "react";
import { WIN_RATE_EVIDENCE } from "@/lib/core/profitability";

interface ProfitabilityData {
  profitabilityStatus: string;
  dataLabel: string;
  metrics: {
    winRate: number | null;
    totalRealizedPnl: number;
    totalUnrealizedPnl: number;
    sampleSize: number;
    roi: number | null;
    maxDrawdown: number | null;
    note: string;
  };
  moneyScores: {
    fastMoneyRealismScore: number;
    moneyPressureScore: number;
    moneyPerHourScore: number;
  };
  dailyPlan: {
    targetRealistic: boolean;
    targetNote: string;
    realisticTargetRange: { low: number; high: number };
    manualVsAutoRecommendation: string;
    stayWatchOnly: boolean;
  };
  note: string;
}

export function ProfitabilitySummary() {
  const [data, setData] = useState<ProfitabilityData | null>(null);

  useEffect(() => {
    fetch("/api/core/profitability")
      .then((r) => r.json())
      .then(setData);
  }, []);

  if (!data) {
    return <p className="text-sm text-edge-muted">Loading profitability…</p>;
  }

  const winRateDisplay =
    data.metrics.winRate != null
      ? `${(data.metrics.winRate * 100).toFixed(1)}%`
      : "— (insufficient data)";

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-edge-border bg-edge-surface p-5">
        <h3 className="font-medium">Profitability Status</h3>
        <p className="mt-2 font-mono text-sm text-amber-300">{data.profitabilityStatus}</p>
        <p className="mt-2 text-xs text-edge-muted">{data.note}</p>
        <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-edge-muted">Realized P&amp;L</dt>
            <dd className="font-mono">${data.metrics.totalRealizedPnl.toFixed(2)}</dd>
          </div>
          <div>
            <dt className="text-xs text-edge-muted">Unrealized P&amp;L</dt>
            <dd className="font-mono">${data.metrics.totalUnrealizedPnl.toFixed(2)}</dd>
          </div>
          <div>
            <dt className="text-xs text-edge-muted">Win rate (tracked only)</dt>
            <dd className="font-mono">{winRateDisplay}</dd>
          </div>
          <div>
            <dt className="text-xs text-edge-muted">ROI</dt>
            <dd className="font-mono">
              {data.metrics.roi != null ? `${(data.metrics.roi * 100).toFixed(2)}%` : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-edge-muted">Max drawdown</dt>
            <dd className="font-mono">
              {data.metrics.maxDrawdown != null ? `$${data.metrics.maxDrawdown.toFixed(2)}` : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-edge-muted">Sample size</dt>
            <dd className="font-mono">{data.metrics.sampleSize}</dd>
          </div>
        </dl>
      </div>

      <div className="rounded-xl border border-edge-border bg-edge-surface p-5">
        <h3 className="text-sm font-medium">Win Rate Evidence</h3>
        <ul className="mt-2 space-y-1 text-xs font-mono text-edge-muted">
          <li>{WIN_RATE_EVIDENCE.target}</li>
          <li>{WIN_RATE_EVIDENCE.claimed}</li>
          <li>{WIN_RATE_EVIDENCE.guarantee}</li>
        </ul>
      </div>

      <div className="rounded-xl border border-edge-border bg-edge-surface p-5">
        <h3 className="text-sm font-medium">Daily Money Plan</h3>
        <p className="mt-2 text-xs text-edge-muted">{data.dailyPlan.targetNote}</p>
        <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
          <Row label="Target range" value={`$${data.dailyPlan.realisticTargetRange.low}–$${data.dailyPlan.realisticTargetRange.high}`} />
          <Row label="Recommendation" value={data.dailyPlan.manualVsAutoRecommendation} />
          <Row label="Watch only" value={data.dailyPlan.stayWatchOnly ? "YES" : "NO"} />
        </dl>
      </div>
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

export function ProfitabilityMoneyScores() {
  const [scores, setScores] = useState<ProfitabilityData["moneyScores"] | null>(null);

  useEffect(() => {
    fetch("/api/core/profitability")
      .then((r) => r.json())
      .then((d) => setScores(d.moneyScores));
  }, []);

  if (!scores) return null;

  return (
    <>
      <MoneyScoreCard title="Fast Money Realism" score={String(scores.fastMoneyRealismScore)} note="Based on data freshness, liquidity, false-edge rate" />
      <MoneyScoreCard title="Money Pressure" score={String(scores.moneyPressureScore)} note="Opportunity density vs risk budget" />
      <MoneyScoreCard title="Money Per Hour" score={String(scores.moneyPerHourScore)} note="Expected capture rate estimate" />
    </>
  );
}

function MoneyScoreCard({ title, score, note }: { title: string; score: string; note: string }) {
  return (
    <div className="rounded-xl border border-edge-border bg-edge-surface p-4">
      <p className="text-xs text-edge-muted">{title}</p>
      <p className="mt-2 text-2xl font-semibold font-mono">{score}</p>
      <p className="mt-2 text-xs text-edge-muted">{note}</p>
    </div>
  );
}
