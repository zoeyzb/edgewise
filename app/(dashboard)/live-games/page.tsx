import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { buildGamesResponse } from "@/lib/server/providers/provider-health";
import { buildPageProviderStatus } from "@/lib/server/providers/scan-status";

export default async function LiveGamesPage() {
  const [games, status] = await Promise.all([
    buildGamesResponse(),
    buildPageProviderStatus(),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Live Games"
        description="Odds API events across all supported sports."
        badge={games.dataLabel}
      />

      <section className="rounded-lg border border-edge-border bg-edge-surface/50 px-4 py-3 text-sm">
        <p>
          Kalshi {status.kalshiAuth} · Odds {status.oddsStatus}
        </p>
        <p className="mt-1 text-edge-muted">
          {games.primaryBlocker
            ? `Blocker: ${String(games.primaryBlocker).replaceAll("_", " ")}`
            : games.message}
        </p>
        <p className="mt-1 text-edge-muted">Next: {games.nextAction ?? status.nextAction}</p>
      </section>

      {games.items.length === 0 ? (
        <EmptyState
          title="No games loaded"
          message={games.message}
          label={games.dataLabel}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-edge-border">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-edge-border bg-edge-surface text-xs uppercase text-edge-muted">
              <tr>
                <th className="px-3 py-2">Sport</th>
                <th className="px-3 py-2">Matchup</th>
                <th className="px-3 py-2">Start</th>
                <th className="px-3 py-2">Live</th>
              </tr>
            </thead>
            <tbody>
              {games.items.map((g) => (
                <tr key={`${g.id}-${g.sportKey}`} className="border-b border-edge-border/50">
                  <td className="px-3 py-2 font-mono text-xs">{g.sportKey}</td>
                  <td className="px-3 py-2">
                    {g.awayTeam} @ {g.homeTeam}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{g.commenceTime ?? "—"}</td>
                  <td className="px-3 py-2">{g.live ? "LIVE" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
