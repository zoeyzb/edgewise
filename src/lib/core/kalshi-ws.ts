import "server-only";
import { KALSHI_CONTRACT } from "@/lib/core/contracts";
import {
  buildKalshiWsAuthHeaders,
  kalshiWsOrigin,
  type KalshiCredentials,
  type KalshiEnvironment,
} from "@/lib/core/kalshi-auth";
import type { KalshiOrderbookLevelFp } from "@/lib/core/contracts";
import {
  reconstructExecutableOrderbook,
  validateOrderbookFp,
} from "@/lib/core/validators";

export type KalshiWsConnectionState =
  | "DISCONNECTED"
  | "CONNECTING"
  | "CONNECTED"
  | "RECONNECTING"
  | "ERROR";

export interface KalshiWsHealth {
  state: KalshiWsConnectionState;
  subscribedTickers: string[];
  lastMessageAt: string | null;
  lastSnapshotAt: string | null;
  reconnectAttempts: number;
  freshnessState: "FRESH" | "STALE" | "UNKNOWN";
  errorCategory: string | null;
}

interface OrderbookCacheEntry {
  ticker: string;
  yesLevels: KalshiOrderbookLevelFp[];
  noLevels: KalshiOrderbookLevelFp[];
  updatedAtMs: number;
}

const MAX_RECONNECT_ATTEMPTS = 5;
const STALE_MS = 5_000;

/** Server-side Kalshi WS manager — lazy-connect; safe in server runtime only. */
export class KalshiWsManager {
  private socket: WebSocket | null = null;
  private state: KalshiWsConnectionState = "DISCONNECTED";
  private reconnectAttempts = 0;
  private subscribedTickers = new Set<string>();
  private orderbooks = new Map<string, OrderbookCacheEntry>();
  private lastMessageAt: number | null = null;
  private lastSnapshotAt: number | null = null;
  private lastErrorCategory: string | null = null;

  constructor(
    private readonly credentials: KalshiCredentials,
    private readonly environment: KalshiEnvironment = "demo"
  ) {}

  getHealth(): KalshiWsHealth {
    const now = Date.now();
    const freshnessState =
      this.lastMessageAt === null
        ? "UNKNOWN"
        : now - this.lastMessageAt <= STALE_MS
          ? "FRESH"
          : "STALE";

    return {
      state: this.state,
      subscribedTickers: [...this.subscribedTickers],
      lastMessageAt: this.lastMessageAt ? new Date(this.lastMessageAt).toISOString() : null,
      lastSnapshotAt: this.lastSnapshotAt
        ? new Date(this.lastSnapshotAt).toISOString()
        : null,
      reconnectAttempts: this.reconnectAttempts,
      freshnessState,
      errorCategory: this.lastErrorCategory,
    };
  }

  getExecutableOrderbook(ticker: string) {
    const cached = this.orderbooks.get(ticker);
    if (!cached) return null;
    return reconstructExecutableOrderbook({
      ticker,
      yesLevels: cached.yesLevels,
      noLevels: cached.noLevels,
      fetchedAtMs: cached.updatedAtMs,
      maxAgeMs: STALE_MS,
      source: "WEBSOCKET",
    });
  }

  async connect(): Promise<{ ok: boolean; errorCategory?: string }> {
    if (this.state === "CONNECTED" || this.state === "CONNECTING") {
      return { ok: true };
    }

    this.state = "CONNECTING";
    const url = `${kalshiWsOrigin(this.environment)}${KALSHI_CONTRACT.wsPath}`;
    const headers = buildKalshiWsAuthHeaders(this.credentials);

    try {
      // Node 22+ / modern runtimes may support WebSocket with headers via undici.
      // Fallback marks UNCONFIRMED if unsupported in current runtime.
      if (typeof WebSocket === "undefined") {
        this.state = "ERROR";
        this.lastErrorCategory = "websocket_runtime_unavailable";
        return {
          ok: false,
          errorCategory: "UNCONFIRMED — NEEDS_PROVIDER_CONTRACT_VERIFICATION",
        };
      }

      this.socket = new WebSocket(url, {
        headers,
      } as unknown as string[]);

      await new Promise<void>((resolve, reject) => {
        if (!this.socket) return reject(new Error("socket missing"));
        this.socket.onopen = () => {
          this.state = "CONNECTED";
          this.reconnectAttempts = 0;
          resolve();
        };
        this.socket.onerror = () => {
          this.state = "ERROR";
          this.lastErrorCategory = "websocket_error";
          reject(new Error("websocket error"));
        };
        this.socket.onmessage = (event) => this.handleMessage(String(event.data));
        this.socket.onclose = () => {
          this.state = "DISCONNECTED";
          this.scheduleReconnect();
        };
      });

      return { ok: true };
    } catch {
      this.state = "ERROR";
      return { ok: false, errorCategory: this.lastErrorCategory ?? "connect_failed" };
    }
  }

  subscribeOrderbook(ticker: string) {
    this.subscribedTickers.add(ticker);
    if (this.socket && this.state === "CONNECTED") {
      this.socket.send(
        JSON.stringify({
          id: Date.now(),
          cmd: "subscribe",
          params: { channels: ["orderbook_delta"], market_tickers: [ticker] },
        })
      );
    }
  }

  disconnect() {
    this.socket?.close();
    this.socket = null;
    this.state = "DISCONNECTED";
  }

  private scheduleReconnect() {
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      this.state = "ERROR";
      this.lastErrorCategory = "reconnect_exhausted";
      return;
    }
    this.reconnectAttempts += 1;
    this.state = "RECONNECTING";
    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 30_000);
    setTimeout(() => {
      void this.connect();
    }, delay);
  }

  private handleMessage(raw: string) {
    this.lastMessageAt = Date.now();
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      this.lastErrorCategory = "invalid_ws_payload";
      return;
    }

    const type = typeof msg.type === "string" ? msg.type : "";
    if (type === KALSHI_CONTRACT.websocket.snapshotType) {
      this.applySnapshot(msg);
      return;
    }
    if (type === KALSHI_CONTRACT.websocket.deltaType) {
      this.lastErrorCategory = "delta_merge_unconfirmed";
      // Full delta merge logic is contract-sensitive — REST fallback remains authoritative in Prompt 3.
      return;
    }
  }

  private applySnapshot(msg: Record<string, unknown>) {
    const ticker =
      typeof msg.market_ticker === "string"
        ? msg.market_ticker
        : typeof msg.ticker === "string"
          ? msg.ticker
          : null;
    if (!ticker) {
      this.lastErrorCategory = "snapshot_missing_ticker";
      return;
    }

    const validated = validateOrderbookFp({ orderbook_fp: msg.orderbook_fp ?? msg });
    if (!validated.ok) {
      this.lastErrorCategory = "snapshot_validation_failed";
      return;
    }

    this.orderbooks.set(ticker, {
      ticker,
      yesLevels: validated.yesLevels,
      noLevels: validated.noLevels,
      updatedAtMs: Date.now(),
    });
    this.lastSnapshotAt = Date.now();
    this.lastErrorCategory = null;
  }
}

export const kalshiWsSingletons = new Map<string, KalshiWsManager>();

export function getKalshiWsManager(credentials: KalshiCredentials) {
  const key = `${credentials.environment}:${credentials.apiKeyId.slice(0, 8)}`;
  const existing = kalshiWsSingletons.get(key);
  if (existing) return existing;
  const manager = new KalshiWsManager(credentials, credentials.environment);
  kalshiWsSingletons.set(key, manager);
  return manager;
}
