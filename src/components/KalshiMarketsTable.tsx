import type { RankedKalshiMarket } from "@/lib/core/types";
import { formatDiagnosticText, formatLabelList } from "@/lib/utils/diagnostic-text";
import { EmptyState } from "./EmptyState";
import { StatusBadge } from "./StatusBadge";

const asText = formatDiagnosticText;
const asLabelArray = formatLabelList;

function money(n: unknown): string {
  const num = typeof n === "number" ? n : Number.parseFloat(asText(n));
  if (!Number.isFinite(num)) return "—";
  return `$${num.toFixed(2)}`;
}

function spread(n: unknown): string {
  const num = typeof n === "number" ? n : Number.parseFloat(asText(n));
  if (!Number.isFinite(num)) return "—";
  return `$${num.toFixed(4)}`;
}

function labelVariant(label: string): "success" | "warn" | "danger" | "muted" {
  if (label === "REVIEW" || label === "CLEAN_SINGLE_MARKET") return "success";
  if (label === "WATCH" || label === "CLOSING_SOON") return "warn";
  if (label === "AVOID" || label === "LOW_LIQUIDITY" || label === "WIDE_SPREAD") return "danger";
  return "muted";
}

export function KalshiMarketsTable({
  markets,
  dataLabel,
  message,
}: {
  markets: RankedKalshiMarket[];
  dataLabel: string;
  message?: string;
}) {
  if (markets.length === 0) {
    return (
      <EmptyState
        title="No Kalshi markets in this view"
        message={
          message ??
          (dataLabel === "PROVIDER_NOT_CONFIGURED"
            ? "Configure Kalshi production keys to scan markets."
            : "No markets match the current tab filter.")
        }
        label={dataLabel}
      />
    );
  }

  return (
    <div className="space-y-3">
      {message ? <p className="text-sm text-edge-muted">{message}</p> : null}
      <div className="overflow-x-auto rounded-xl border border-edge-border">
        <table className="w-full min-w-[1280px] table-fixed text-left text-sm">
          <thead className="sticky top-0 z-10 border-b border-edge-border bg-edge-surface text-xs uppercase text-edge-muted">
            <tr>
              <th className="w-[28%] px-4 py-3">Title / ticker</th>
              <th className="w-[7%] px-3 py-3">Category</th>
              <th className="w-[7%] px-3 py-3">Type</th>
              <th className="w-[8%] px-3 py-3">YES bid/ask</th>
              <th className="w-[8%] px-3 py-3">NO bid/ask</th>
              <th className="w-[6%] px-3 py-3">Spread</th>
              <th className="w-[6%] px-3 py-3">Liquidity</th>
              <th className="w-[6%] px-3 py-3">Volume</th>
              <th className="w-[6%] px-3 py-3">OI</th>
              <th className="w-[9%] px-3 py-3">Close time</th>
              <th className="w-[5%] px-3 py-3">Status</th>
              <th className="w-[8%] px-3 py-3">Labels</th>
              <th className="w-[10%] px-3 py-3">Why ranked</th>
            </tr>
          </thead>
          <tbody>
            {markets.map((m, index) => {
              const labels = asLabelArray(m.labels);
              const closeTime = asText(m.closeTime);
              const closeDisplay =
                closeTime !== "—" && !Number.isNaN(Date.parse(closeTime))
                  ? new Date(closeTime).toLocaleString()
                  : "—";

              return (
                <tr
                  key={asText(m.ticker) !== "—" ? asText(m.ticker) : `market-${index}`}
                  className="border-b border-edge-border/50 align-top hover:bg-edge-surface/50"
                >
                  <td className="px-4 py-4">
                    <p className="font-medium leading-snug break-words whitespace-normal">
                      {asText(m.title)}
                    </p>
                    <p className="mt-1 font-mono text-[11px] text-edge-muted break-all">
                      {asText(m.ticker)}
                    </p>
                  </td>
                  <td className="px-3 py-4 text-xs capitalize">{asText(m.categorySport)}</td>
                  <td className="px-3 py-4 text-xs font-mono">{asText(m.marketType)}</td>
                  <td className="px-3 py-4 font-mono text-[11px] leading-relaxed">
                    <span className="block">{asText(m.yesBid)}</span>
                    <span className="block text-edge-muted">{asText(m.yesAsk)}</span>
                  </td>
                  <td className="px-3 py-4 font-mono text-[11px] leading-relaxed">
                    <span className="block">{asText(m.noBid)}</span>
                    <span className="block text-edge-muted">{asText(m.noAsk)}</span>
                  </td>
                  <td className="px-3 py-4 font-mono text-xs">{spread(m.spreadDollars)}</td>
                  <td className="px-3 py-4 font-mono text-xs">{money(m.liquidityDollars)}</td>
                  <td className="px-3 py-4 font-mono text-xs break-all">{asText(m.volumeFp)}</td>
                  <td className="px-3 py-4 font-mono text-xs break-all">{asText(m.openInterestFp)}</td>
                  <td className="px-3 py-4 text-xs leading-relaxed">{closeDisplay}</td>
                  <td className="px-3 py-4 text-xs">{asText(m.status)}</td>
                  <td className="px-3 py-4">
                    <div className="flex flex-wrap gap-1">
                      {labels.length > 0 ? (
                        labels.map((label) => (
                          <StatusBadge key={label} variant={labelVariant(label)}>
                            {label}
                          </StatusBadge>
                        ))
                      ) : (
                        <span className="text-xs text-edge-muted">—</span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-4 text-xs leading-relaxed text-edge-muted break-words whitespace-normal">
                    {asText(m.rankReason)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
