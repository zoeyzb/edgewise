/**
 * Provider contract lock — sourced from official docs as of build time.
 * Anything not verified inline is marked UNCONFIRMED — NEEDS_VERIFICATION.
 *
 * @see https://docs.kalshi.com/getting_started/quick_start_authenticated_requests
 * @see https://docs.kalshi.com/websockets/orderbook-updates
 * @see https://the-odds-api.com/liveapi/guides/v4/
 */

export const UNCONFIRMED_MARKER = "UNCONFIRMED — NEEDS_VERIFICATION" as const;

// ---------------------------------------------------------------------------
// Kalshi — origins & paths
// ---------------------------------------------------------------------------

export const KALSHI_CONTRACT = {
  source: "https://docs.kalshi.com",
  demoRestOrigin: "https://demo-api.kalshi.co",
  prodRestOrigin: "https://api.elections.kalshi.com",
  demoWsOrigin: "wss://demo-api.kalshi.co",
  prodWsOrigin: "wss://api.elections.kalshi.com",
  restBasePath: "/trade-api/v2",
  wsPath: "/trade-api/ws/v2",
  demoRestBaseUrl: "https://demo-api.kalshi.co/trade-api/v2",
  prodRestBaseUrl: "https://api.elections.kalshi.com/trade-api/v2",
  demoWsUrl: "wss://demo-api.kalshi.co/trade-api/ws/v2",
  prodWsUrl: "wss://api.elections.kalshi.com/trade-api/ws/v2",

  authHeaders: [
    "KALSHI-ACCESS-KEY",
    "KALSHI-ACCESS-TIMESTAMP",
    "KALSHI-ACCESS-SIGNATURE",
  ] as const,

  signingRule:
    "RSA-PSS (SHA256): sign concatenation of timestamp_ms + HTTP_METHOD_UPPER + path_without_query",
  pathSigningRule:
    "Path signed MUST exclude query string. Path MUST include /trade-api/v2 prefix when present in request URL.",
  timestampFormat: "Unix epoch milliseconds as string",

  fixedPoint: {
    priceFormat: "Dollar string with up to 4 decimal places (e.g. 0.5600, 0.99)",
    quantityFormat: "Fixed-point count string (count_fp) — contract count in FP units",
    priceLevelStructure: "[price_dollars, count_fp] tuple per level",
    priceRanges: {
      minInclusive: "0.01",
      maxInclusive: "0.99",
      note: "Executable prices derived from bid ladders; never use midpoint as executable.",
    },
    orderbookRoots: {
      legacy: "orderbook",
      canonical: "orderbook_fp",
    },
    yesLevelsField: "yes_dollars",
    noLevelsField: "no_dollars",
    levelTuple: "[price_dollars, count_fp]",
  },

  orderbook: {
    responseRoot: "orderbook",
    fixedPointRoot: "orderbook_fp",
    yesLevelsField: "yes_dollars",
    noLevelsField: "no_dollars",
    levelTuple: "[price_dollars, count_fp]",
    ladderStructure:
      "Each side publishes BID ladders only. Levels sorted ascending by price; best bid is last element.",
    executableAskReconstruction:
      "executable YES ask = 1 - best NO bid price; executable NO ask = 1 - best YES bid price",
    reciprocalPricing:
      "Kalshi publishes bids; executable YES ask = 1 - best NO bid, executable NO ask = 1 - best YES bid",
    deprecatedFields: [
      "yes (integer cents) — use yes_dollars / orderbook_fp",
      "no (integer cents) — use no_dollars / orderbook_fp",
      "Midpoint-derived prices — NEVER use for execution",
      "yes_ask / no_ask summary fields without orderbook_fp confirmation — display only",
    ] as const,
  },

  orderDirection: {
    canonicalSideField: "side",
    canonicalActionField: "action",
    allowedSideValues: ["yes", "no"] as const,
    allowedActionValues: ["buy", "sell"] as const,
    deprecated: [
      "Implicit side from price field alone",
      "Client-side midpoint direction inference",
    ] as const,
  },

  marketStatusValues: {
    /** Values on market objects in GET /markets response bodies. */
    response: ["active", "initialized", "inactive", "closed", "determined", "disputed", "amended", "finalized"] as const,
    /** Valid GET /markets?status= filter values — use `open` to match response `active`. */
    queryFilter: ["unopened", "open", "paused", "closed", "settled"] as const,
    verified: ["active", "closed", "settled", "finalized"] as const,
    unconfirmed: UNCONFIRMED_MARKER,
    note:
      "GET /markets status filter accepts open (not active). Response body uses active for open markets.",
  },

  orderStatusValues: {
    verified: ["resting", "canceled", "executed"] as const,
    unconfirmed: UNCONFIRMED_MARKER,
    note: "Pending/partial fill states — verify against portfolio/orders response at execution time.",
  },

  fillStatusValues: {
    verified: ["filled", "partially_filled"] as const,
    unconfirmed: UNCONFIRMED_MARKER,
    note: "Fill channel payload fields — verify against WS fill messages at execution time.",
  },

  endpointSplit: {
    liveRest: [
      "/trade-api/v2/exchange/status",
      "/trade-api/v2/portfolio/balance",
      "/trade-api/v2/portfolio/positions",
      "/trade-api/v2/portfolio/orders",
      "/trade-api/v2/markets",
      "/trade-api/v2/markets/{ticker}",
      "/trade-api/v2/markets/{ticker}/orderbook",
      "/trade-api/v2/markets/orderbooks",
      "/trade-api/v2/events/{event_ticker}",
    ] as const,
    liveWebSocket: ["/trade-api/ws/v2"] as const,
    historical: UNCONFIRMED_MARKER,
  },

  endpoints: {
    exchangeStatus: "/trade-api/v2/exchange/status",
    portfolioBalance: "/trade-api/v2/portfolio/balance",
    portfolioPositions: "/trade-api/v2/portfolio/positions",
    markets: "/trade-api/v2/markets",
    marketByTicker: "/trade-api/v2/markets/{ticker}",
    marketOrderbook: "/trade-api/v2/markets/{ticker}/orderbook",
    bulkOrderbooks: "/trade-api/v2/markets/orderbooks",
    portfolioOrders: "/trade-api/v2/portfolio/orders",
    eventByTicker: "/trade-api/v2/events/{event_ticker}",
  },

  websocket: {
    channels: ["orderbook_delta", "ticker", "trade", "fill"] as const,
    snapshotType: "orderbook_snapshot",
    deltaType: "orderbook_delta",
    sequenceField: UNCONFIRMED_MARKER,
    deltaMergePolicy:
      "Snapshot authoritative on connect/reconnect; deltas applied in sequence; gap → stale → reload snapshot",
    verified: true,
  },
} as const;

// ---------------------------------------------------------------------------
// Odds API — contract lock
// ---------------------------------------------------------------------------

export const ODDS_API_CONTRACT = {
  source: "https://the-odds-api.com/liveapi/guides/v4/",
  origin: "https://api.the-odds-api.com",
  basePath: "/v4",

  quotaHeaders: [
    "x-requests-remaining",
    "x-requests-used",
    "x-requests-last",
  ] as const,

  endpoints: {
    sports: "/v4/sports",
    events: "/v4/sports/{sport}/events",
    odds: "/v4/sports/{sport}/odds",
    scores: "/v4/sports/{sport}/scores",
    eventOdds: "/v4/sports/{sport}/events/{eventId}/odds",
    eventMarkets: "/v4/sports/{sport}/events/{eventId}/markets",
    historical: UNCONFIRMED_MARKER,
  },

  endpointSplit: {
    live: [
      "/v4/sports",
      "/v4/sports/{sport}/events",
      "/v4/sports/{sport}/odds",
      "/v4/sports/{sport}/scores",
      "/v4/sports/{sport}/events/{eventId}/odds",
      "/v4/sports/{sport}/events/{eventId}/markets",
    ] as const,
    historical: UNCONFIRMED_MARKER,
  },

  /** Sports Edgewise may reference — non-sports keys are out of strategy scope. */
  allowedSportKeys: [
    "americanfootball_nfl",
    "americanfootball_ncaaf",
    "basketball_nba",
    "basketball_ncaab",
    "basketball_wnba",
    "baseball_mlb",
    "icehockey_nhl",
    "soccer_epl",
    "soccer_usa_mls",
    "soccer_uefa_champs_league",
    "mma_mixed_martial_arts",
    "boxing_boxing",
    "tennis_atp",
    "tennis_wta",
  ] as const,

  scoreCoverageAssumptions: {
    policy:
      "Scores endpoint availability varies by sport and plan tier. Missing score feed → live strategies BLOCKED.",
    verifiedSportsWithScores: [
      "americanfootball_nfl",
      "basketball_nba",
      "baseball_mlb",
      "icehockey_nhl",
    ] as const,
    unconfirmedSports: UNCONFIRMED_MARKER,
    clockAndPeriod: UNCONFIRMED_MARKER,
    note: "Per-sport live clock/period fields not guaranteed — verify before clock-dependent strategies.",
  },

  marketKeys: {
    moneyline: "h2h",
    spreads: "spreads",
    totals: "totals",
    unconfirmed: ["outrights", "player_props", "alternate_spreads"] as const,
  },
} as const;

// ---------------------------------------------------------------------------
// Matching & settlement block codes (Prompt 4)
// ---------------------------------------------------------------------------

export const MATCH_BLOCK_CODES = {
  EVENT_MATCH_AMBIGUOUS: "BLOCKED — EVENT_MATCH_AMBIGUOUS",
  SETTLEMENT_MISMATCH: "BLOCKED — SETTLEMENT_MISMATCH_OR_UNCONFIRMED",
  LIVE_ORDERBOOK_NOT_GREEN: "BLOCKED — LIVE_ORDERBOOK_NOT_GREEN",
  MARKET_TYPE_BLOCKED: "BLOCKED — MARKET_TYPE_NOT_SUPPORTED",
  STRATEGY_SCOPE_EXCLUDED: "BLOCKED — STRATEGY_SCOPE_EXCLUDED",
  MATCH_CONFIDENCE_LOW: "BLOCKED — MATCH_CONFIDENCE_LOW",
  REST_ONLY_LIVE: "BLOCKED — REST_ONLY_LIVE_NOT_ALLOWED",
  WEAK_LIQUIDITY: "BLOCKED — LOW_LIQUIDITY",
  STALE_LIVE_GAME: "BLOCKED — STALE_LIVE_GAME",
} as const;

export const PROVIDER_BLOCK_CODES = {
  STALE_ORDERBOOK: "BLOCKED — STALE_ORDERBOOK",
  STALE_ODDS: "BLOCKED — STALE_ODDS",
  EXECUTABLE_PRICE_UNKNOWN: "UNCONFIRMED — EXECUTABLE_PRICE_UNKNOWN",
  SCORE_COVERAGE_UNSUPPORTED: "UNCONFIRMED — SCORE_COVERAGE_UNSUPPORTED",
  PROVIDER_NOT_CONFIGURED: "PROVIDER_NOT_CONFIGURED",
  CONTRACT_UNVERIFIED: UNCONFIRMED_MARKER,
} as const;

export type ContractConfidence = "verified" | "unconfirmed";

export const UNCONFIRMED_CONTRACTS = [
  "Kalshi eventByTicker response fields beyond ticker/title/status",
  "Kalshi order placement field names for subpenny/fractional — validate at execution time",
  "Kalshi full market status enum at runtime",
  "Kalshi order/fill status enum completeness",
  "Kalshi WS sequence field name and gap detection payload",
  "Odds API historical endpoints access tier",
  "Odds API per-sport live score coverage matrix",
  "Odds API live clock/period field availability by sport",
  "Kalshi sports market settlement rule text parsing — title heuristics only until rules API verified",
] as const;

export type ProviderHealthColor = "RED" | "YELLOW" | "GREEN";

export interface ProviderQuotaSnapshot {
  remaining: number | null;
  used: number | null;
  lastCost: number | null;
  status: "OK" | "LOW" | "EXHAUSTED" | "UNKNOWN";
}

export interface KalshiExchangeStatus {
  exchange_active: boolean;
  trading_active: boolean;
}

export interface KalshiBalance {
  balance: number;
  portfolio_value?: number;
  updated_ts?: number;
}

export interface KalshiMarketSummary {
  ticker: string;
  event_ticker?: string;
  series_ticker?: string;
  title?: string;
  status?: string;
  yes_bid_dollars?: string;
  yes_ask_dollars?: string;
  no_bid_dollars?: string;
  no_ask_dollars?: string;
  volume_fp?: string;
  open_interest_fp?: string;
  liquidity_dollars?: string;
  close_time?: string;
  expected_expiration_time?: string;
  market_type?: string;
  subtitle?: string;
  primary_participant_key?: string;
  mve_collection_ticker?: string;
  mve_selected_legs?: unknown;
}

export interface KalshiOrderbookLevelFp {
  priceDollars: string;
  countFp: string;
}

export interface KalshiExecutableOrderbook {
  ticker: string;
  bestYesBid: KalshiOrderbookLevelFp | null;
  bestNoBid: KalshiOrderbookLevelFp | null;
  executableYesAsk: string | null;
  executableNoAsk: string | null;
  spreadDollars: string | null;
  depthAtExecutableYesAsk: string | null;
  depthAtExecutableNoAsk: string | null;
  fillableNotionalYes: string | null;
  fillableNotionalNo: string | null;
  orderbookAgeMs: number | null;
  freshnessState: "FRESH" | "STALE" | "UNKNOWN";
  source: "REST" | "WEBSOCKET";
}

export interface OddsSport {
  key: string;
  group?: string;
  title?: string;
  active?: boolean;
  has_outrights?: boolean;
}

export interface OddsEventSummary {
  id: string;
  sport_key: string;
  commence_time: string;
  home_team: string;
  away_team: string;
}

export interface SanitizedProviderError {
  provider: "kalshi" | "odds_api";
  category:
    | "auth"
    | "network"
    | "rate_limit"
    | "validation"
    | "quota"
    | "stale"
    | "unsupported"
    | "not_configured"
    | "unknown";
  message: string;
  httpStatus?: number;
  /** Truncated Kalshi error JSON/text — no secrets. */
  responseBody?: string;
}
