"use client";

import { useMemo, useState } from "react";
import type { RankedKalshiMarket } from "@/lib/core/types";
import { KalshiMarketsTable } from "./KalshiMarketsTable";
import { cn } from "@/lib/utils/cn";

type MarketTab = "clean" | "combo" | "all";

const TABS: Array<{ id: MarketTab; label: string }> = [
  { id: "clean", label: "Clean Markets" },
  { id: "combo", label: "Combo Markets" },
  { id: "all", label: "All Markets" },
];

function isCleanTabMarket(market: RankedKalshiMarket): boolean {
  if (market.isCombo) return false;
  const labels = Array.isArray(market.labels) ? market.labels : [];
  if (labels.includes("REVIEW") || labels.includes("CLEAN_SINGLE_MARKET")) return true;
  if (market.categorySport === "unknown") return true;
  return !market.isCombo;
}

function reviewableMarkets(markets: RankedKalshiMarket[]): RankedKalshiMarket[] {
  return markets.filter((market) => {
    if (!market.isCombo) return true;
    const labels = Array.isArray(market.labels) ? market.labels : [];
    return (
      market.categorySport === "unknown" ||
      labels.includes("REVIEW") ||
      labels.includes("WATCH") ||
      labels.includes("CLEAN_SINGLE_MARKET")
    );
  });
}

export function KalshiMarketsTabs({
  markets,
  dataLabel,
}: {
  markets: RankedKalshiMarket[];
  dataLabel: string;
}) {
  const [tab, setTab] = useState<MarketTab>("clean");

  const counts = useMemo(
    () => ({
      clean: markets.filter(isCleanTabMarket).length,
      combo: markets.filter((m) => m.isCombo).length,
      all: markets.length,
      reviewable: reviewableMarkets(markets).length,
    }),
    [markets]
  );

  const filtered = useMemo(() => {
    if (tab === "combo") return markets.filter((m) => m.isCombo);
    if (tab === "all") return markets;
    const clean = markets.filter(isCleanTabMarket);
    if (clean.length > 0) return clean;
    const reviewable = reviewableMarkets(markets);
    return reviewable.length > 0 ? reviewable : markets;
  }, [markets, tab]);

  const cleanUsesFallback = tab === "clean" && counts.clean === 0 && filtered.length > 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {TABS.map((item) => {
          const count =
            item.id === "clean"
              ? counts.clean > 0
                ? counts.clean
                : counts.reviewable || counts.all
              : counts[item.id];
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={cn(
                "rounded border px-3 py-1.5 text-sm transition-colors",
                tab === item.id
                  ? "border-edge-accent bg-edge-accent/10 text-edge-accent"
                  : "border-edge-border text-edge-muted hover:text-slate-200"
              )}
            >
              {item.label} ({count})
            </button>
          );
        })}
      </div>
      <KalshiMarketsTable
        markets={filtered}
        dataLabel={dataLabel}
        message={
          tab === "clean"
            ? cleanUsesFallback
              ? `No clean singles in this scan — showing ${filtered.length} reviewable markets.`
              : `${counts.clean} clean and review markets — combo/multivariate excluded.`
            : tab === "combo"
              ? `${counts.combo} combo/multivariate markets.`
              : `${counts.all} total ranked markets.`
        }
      />
    </div>
  );
}
