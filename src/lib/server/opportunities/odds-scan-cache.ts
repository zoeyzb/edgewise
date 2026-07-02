import "server-only";

const ODDS_CACHE_TTL_MS = 5 * 60 * 1000;

type CacheEntry = {
  expiresAt: number;
  data: Record<string, unknown>[];
};

const cache = new Map<string, CacheEntry>();

export function getCachedOddsEvents(sportKey: string): Record<string, unknown>[] | null {
  const entry = cache.get(sportKey);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(sportKey);
    return null;
  }
  return entry.data;
}

export function setCachedOddsEvents(sportKey: string, data: Record<string, unknown>[]): void {
  cache.set(sportKey, { data, expiresAt: Date.now() + ODDS_CACHE_TTL_MS });
}

export function clearOddsScanCache(): void {
  cache.clear();
}
