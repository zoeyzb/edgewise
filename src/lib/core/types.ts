/** Core domain types for Edgewise. */

export const EXECUTION_MODES = [
  "MANUAL",
  "AUTO",
  "WATCH",
  "PAPER",
  "SHADOW",
] as const;

export type ExecutionMode = (typeof EXECUTION_MODES)[number];

export const AUTO_LEVELS = [
  "PAPER_AUTO",
  "SHADOW_AUTO",
  "TINY_LIVE_AUTO",
  "STANDARD_AUTO",
] as const;

export type AutoLevel = (typeof AUTO_LEVELS)[number];

export const AUTO_STATUSES = [
  "AUTO_SELECTABLE",
  "AUTO_SELECTED",
  "AUTO_ACTIVE",
  "AUTO_SCANNING",
  "AUTO_WAITING_FOR_VALID_TRADE",
  "AUTO_TRADE_READY",
  "AUTO_TRADE_SUBMITTED",
  "AUTO_TRADE_BLOCKED_PER_TRADE",
  "AUTO_PAUSED_BY_USER",
  "AUTO_EMERGENCY_STOP",
] as const;

export type AutoStatus = (typeof AUTO_STATUSES)[number];

export const STAKE_MODES = [
  "FIXED_DOLLAR_STAKE",
  "FIXED_PERCENT_STAKE",
  "AI_RECOMMENDED_STAKE",
  "AI_WITH_USER_MAX",
  "AUTO_RISK_CAPPED",
] as const;

export type StakeMode = (typeof STAKE_MODES)[number];

export type SystemBuildStatus =
  | "NOT_BUILT_YET"
  | "SELECTABLE_UI_REQUIRED_NEXT"
  | "SELECTABLE"
  | "PROVIDER_NOT_CONFIGURED"
  | "UNPROVEN"
  | "IN_PROGRESS"
  | "READY"
  | "NOT_CONFIGURED";

export interface SystemStatus {
  manualExecution: SystemBuildStatus;
  autoMode: SystemBuildStatus | "SELECTABLE_UI_REQUIRED_NEXT" | "SELECTABLE";
  liveAutoTrading: SystemBuildStatus;
  profitability: "UNPROVEN" | "PROVEN" | "NEGATIVE";
  providerKeys: SystemBuildStatus;
}

export interface StakeSettings {
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

export interface StakePreview {
  userRequestedStake: number;
  aiRecommendedStake: number;
  finalAllowedStake: number;
  maxLoss: number;
  expectedDollarProfit: number;
  stakeReason: string;
  blocked: boolean;
  blockCode?: string;
}

export interface RiskDefaults {
  maxManualStakePercent: number;
  conservativeStakePercent: number;
  maxDailyRealizedLossPercent: number;
  maxDailyExposurePercent: number;
  maxExposurePerGamePercent: number;
  maxExposurePerLeaguePercent: number;
  maxOpenTrades: number;
  maxTradesPerDay: number;
}

export type KeyProvider =
  | "kalshi_demo_api"
  | "kalshi_demo_private"
  | "kalshi_prod_api"
  | "kalshi_prod_private"
  | "odds_api";

export type KeyStatus =
  | "NOT_CONFIGURED"
  | "CONFIGURED"
  | "TEST_PENDING"
  | "TEST_PASSED"
  | "TEST_FAILED"
  | "DISABLED"
  | "KALSHI_DEMO_CONFIGURED"
  | "KALSHI_PROD_CONFIGURED"
  | "KALSHI_DEMO_API_KEY_PRESENT"
  | "KALSHI_DEMO_PRIVATE_KEY_PRESENT"
  | "KALSHI_DEMO_PAIR_CONFIGURED"
  | "KALSHI_PROD_API_KEY_PRESENT"
  | "KALSHI_PROD_PRIVATE_KEY_PRESENT"
  | "KALSHI_PROD_PAIR_CONFIGURED"
  | "KALSHI_AUTH_TEST_PASSED"
  | "KALSHI_AUTH_TEST_FAILED"
  | "ODDS_API_CONFIGURED"
  | "KEY_MISSING"
  | "KEY_INVALID"
  | "KEY_DISABLED"
  | "KEY_EXPIRED_OR_REVOKED"
  | "KEY_PERMISSION_ERROR"
  | "KEY_QUOTA_LOW"
  | "KEY_QUOTA_EXHAUSTED";

export interface KeyRecordPublic {
  id: string;
  label: string;
  provider: KeyProvider;
  maskedPreview: string;
  enabled: boolean;
  environment: "demo" | "prod" | "external";
  status: KeyStatus;
  updatedAt: string;
  lastTestedAt: string | null;
  quotaStatus: string | null;
  errorCategory: string | null;
}

export interface AutoTradeState {
  executionMode: ExecutionMode;
  autoLevel: AutoLevel;
  autoMode: string;
  autoSystem: string;
  autoScanning: string;
  tradeValidation: string;
  liveAutoLevel: string;
  lastTradeResult: string;
}

export interface HealthSnapshot {
  appStatus: string;
  providerKeyStatus: string;
  secretSafetyStatus: string;
  kalshiStatus: string;
  oddsApiStatus: string;
  manualExecution: string;
  autoMode: string;
  autoSystem: string;
  autoTradeValidation: string;
  profitability: string;
  backtesting: string;
  fakeDataStatus: string;
  dataLabel: "PLACEHOLDER_UI_ONLY" | "NO_REAL_DATA_CONNECTED" | "PROVIDER_NOT_CONFIGURED";
}

export interface OpportunityRankFactors {
  expectedDollarProfit: number;
  netEvAfterCosts: number;
  edgeQualityScore: number;
  moneyConfidenceScore: number;
  profitPriorityScore: number;
  fillProbability: number;
  liquidity: number;
  edgeSurvival: number;
  marketMatchConfidence: number;
  settlementConfidence: number;
  closingPriceValuePotential: number;
  bankrollImpact: number;
  speedNeededToCapture: number;
}

export interface StakeDecision {
  userRequestedStake: number;
  aiRecommendedStake: number;
  finalAllowedStake: number;
  maxLoss: number;
  expectedDollarProfit: number;
  decision: "ALLOWED" | "REDUCED" | "BLOCKED";
  reason: string;
}

export interface ValidationGateResult {
  gate: string;
  passed: boolean;
  reason: string;
}

export interface TradeValidationResult {
  allGatesPassed: boolean;
  gates: ValidationGateResult[];
  blockedReason?: string;
}

export interface PlaceholderOpportunity {
  id: string;
  market: string;
  side: string;
  edgePercent: number | null;
  expectedProfit: number | null;
  liquidity: string;
  status: string;
  dataLabel: "PLACEHOLDER_UI_ONLY" | "NO_REAL_DATA_CONNECTED" | "PROVIDER_NOT_CONFIGURED";
}

// ---------------------------------------------------------------------------
// Prompt 4 — matching, settlement, market types
// ---------------------------------------------------------------------------

export const OPPORTUNITY_DECISION_STATES = [
  "BETTABLE",
  "WATCH",
  "BLOCKED",
  "UNCONFIRMED",
] as const;

export type OpportunityDecisionState = (typeof OPPORTUNITY_DECISION_STATES)[number];

export const MATCH_CONFIDENCE_LEVELS = ["HIGH", "MEDIUM", "LOW"] as const;

export type MatchConfidence = (typeof MATCH_CONFIDENCE_LEVELS)[number];

export const MARKET_TYPE_LEVELS = [
  "LEVEL_1_DIRECT_COMPARABLE",
  "LEVEL_2_MODEL_ASSISTED",
  "LEVEL_3_WATCH_ONLY",
  "LEVEL_4_BLOCKED",
] as const;

export type MarketTypeLevel = (typeof MARKET_TYPE_LEVELS)[number];

export type DetectedMarketKind =
  | "MONEYLINE"
  | "SPREAD"
  | "TOTAL"
  | "EXCLUDED"
  | "UNCLEAR";

export type DetectedMarketCategory =
  | "WINNER"
  | "GAME_SPREAD"
  | "PARTIAL_SPREAD"
  | "GAME_TOTAL"
  | "PARTIAL_TOTAL"
  | "PLAYER_PROP"
  | "FUTURE"
  | "AWARD"
  | "PARLAY"
  | "PARTIAL_SCOPE"
  | "VAGUE";

export interface DetectedMarketType {
  kind: DetectedMarketKind;
  category: DetectedMarketCategory;
  level: MarketTypeLevel;
  exclusionReason?: string;
}

export type SettlementPeriod =
  | "FULL_GAME"
  | "FIRST_HALF"
  | "SECOND_HALF"
  | "FIRST_QUARTER"
  | "SERIES"
  | "TEAM_SEGMENT";

export type SettlementOvertimeRule =
  | "REGULATION_ONLY"
  | "OVERTIME_INCLUDED"
  | "UNSPECIFIED";

export type SettlementMetric =
  | "WINNER"
  | "SPREAD"
  | "GAME_TOTAL"
  | "TEAM_TOTAL";

export interface SettlementScope {
  period: SettlementPeriod;
  overtimeRule: SettlementOvertimeRule;
  metric: SettlementMetric;
  line?: number | null;
  source: string;
  confidence: MatchConfidence;
  rawHint: string;
  verified: boolean;
  unconfirmedNote?: string;
}

export type SettlementVerificationStatus = "EXACT_MATCH" | "MISMATCH" | "UNCONFIRMED";

export interface SettlementVerification {
  status: SettlementVerificationStatus;
  exact: boolean;
  kalshiScope: SettlementScope;
  oddsScope: SettlementScope;
  supportedMarketType: DetectedMarketKind;
  scope: SettlementPeriod;
  overtimeHandling: SettlementOvertimeRule;
  blockCode: string | null;
  reason: string;
  blocked: boolean;
}

export interface StrategyScopeVerdict {
  inScope: boolean;
  blockCode?: string;
  reason?: string;
}

export interface EventMatchCandidate {
  eventTicker: string;
  sportKey: string;
  league?: string;
  startTimeIso?: string | null;
  homeTeam?: string;
  awayTeam?: string;
  neutralSite?: boolean | null;
  marketTitle?: string;
  duplicateCandidateCount?: number;
  oddsEventId?: string;
}

export interface EventMatchResult {
  kalshiEventTicker: string;
  oddsEventId?: string;
  confidence: MatchConfidence;
  matchedFields: string[];
  startTimeDeltaMs: number | null;
  orientation: "DIRECT" | "SWAPPED" | "UNKNOWN";
  blockCode: string | null;
  reason: string;
  ambiguous: boolean;
}

export interface LiveMatchContext {
  isLive: boolean;
  orderbookSource?: "REST" | "WEBSOCKET";
  wsConnected?: boolean;
  snapshotLoaded?: boolean;
  sequenceGap?: boolean;
  wsFreshness?: "FRESH" | "STALE" | "UNKNOWN";
  scoreFeedFresh?: boolean;
  oddsFeedFresh?: boolean;
  clockKnown?: boolean;
  strategyDependsOnClock?: boolean;
}

export type TeamAliasMap = Record<string, string>;

export interface MarketMatchCandidate {
  sportKey: string;
  kalshiEventTicker: string;
  kalshiMarketTicker: string;
  kalshiMarketTitle: string;
  kalshiLine?: number | null;
  oddsMarketKey: string;
  oddsMarketDescription?: string;
  oddsLine?: number | null;
  kalshiEvent: EventMatchCandidate;
  oddsEvent: EventMatchCandidate;
  isLive?: boolean;
  orderbookSource?: "REST" | "WEBSOCKET";
  wsConnected?: boolean;
  snapshotLoaded?: boolean;
  sequenceGap?: boolean;
  wsFreshness?: "FRESH" | "STALE" | "UNKNOWN";
  scoreFeedFresh?: boolean;
  oddsFeedFresh?: boolean;
  clockKnown?: boolean;
  strategyDependsOnClock?: boolean;
  teamAliases?: TeamAliasMap;
}

export interface OpportunityDecision {
  state: OpportunityDecisionState;
  blockCode: string | null;
  reason: string;
  bettable: boolean;
}

export interface MarketMatchResult {
  kalshiMarketTicker: string;
  kalshiEventTicker: string;
  oddsEventId: string;
  oddsMarketKey: string;
  eventMatch: EventMatchResult;
  kalshiMarketType: DetectedMarketType;
  oddsMarketType: DetectedMarketType;
  marketTypeLevel: MarketTypeLevel;
  settlement: SettlementVerification;
  strategyScope: StrategyScopeVerdict;
  liveContext: { allowed: boolean; blockCode: string | null; reason: string };
  decision: OpportunityDecision;
}

export interface MatchedOpportunityCandidate extends MarketMatchResult {
  id: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Prompt 5 — profit engine, EV, scoring
// ---------------------------------------------------------------------------

export type EdgeTier =
  | "BLOCKED_BELOW_MIN"
  | "NORMAL_EDGE"
  | "STRONG_EDGE"
  | "RARE_EDGE"
  | "HIGH_MARGIN_EDGE"
  | "EXTREME_MARGIN_EDGE";

export type ExpectedValueBucket =
  | "MICRO_EDGE"
  | "SMALL_EDGE"
  | "TARGET_EDGE"
  | "STRONG_TARGET_EDGE"
  | "HIGH_VALUE_EDGE"
  | "BELOW_MICRO";

export type HighMarginStatus =
  | "NOT_APPLICABLE"
  | "HIGH_MARGIN_VERIFICATION_REQUIRED"
  | "UNCONFIRMED — HIGH_MARGIN_EDGE_NEEDS_VERIFICATION"
  | "BLOCKED — HIGH_MARGIN_EDGE_FAILED_VERIFICATION"
  | "URGENT_BETTABLE_HIGH_MARGIN";

export interface EdgeBreakdownPublic {
  grossEdge: number;
  fees: number;
  spread: number;
  slippage: number;
  staleDataBuffer: number;
  partialFillRisk: number;
  confidencePenalty: number;
  netEdge: number;
  edgeTier: EdgeTier;
  blockCode: string | null;
}

export interface ScoredOpportunity {
  id: string;
  sport: string;
  league: string;
  game: string;
  teams: { home: string; away: string };
  startTime: string | null;
  liveStatus: "LIVE" | "PRE_GAME" | "UNKNOWN";
  kalshiEvent: string;
  kalshiMarket: string;
  kalshiTicker: string;
  sportsbookEvent: string;
  sportsbookMarket: string;
  side: "YES" | "NO";
  matchConfidence: MatchConfidence;
  settlementConfidence: "EXACT" | "UNCONFIRMED" | "MISMATCH";
  marketTypeLevel: MarketTypeLevel;
  scopePeriod: SettlementPeriod;
  overtimeTreatment: SettlementOvertimeRule;
  currentScore: string | null;
  clockPeriod: string | null;
  executableKalshiAsk: number | null;
  orderbookFreshness: "FRESH" | "STALE" | "UNKNOWN";
  oddsFreshness: "FRESH" | "STALE" | "UNKNOWN";
  scoreFreshness: "FRESH" | "STALE" | "UNKNOWN" | "N/A";
  noVigFairProbability: number | null;
  bookmakerCount: number;
  sportsbookDisagreement: number;
  liquidity: string;
  fillableNotional: number;
  edgeBreakdown: EdgeBreakdownPublic;
  expectedDollarProfit: number;
  expectedProfitPerSecond: number;
  expectedProfitPerMinute: number;
  edgeSurvivalConfidence: number;
  fillProbability: number;
  edgeQualityScore: number;
  moneyConfidenceScore: number;
  profitPriorityScore: number;
  userRequestedStake: number;
  aiRecommendedStake: number;
  finalAllowedStake: number;
  maxLoss: number;
  state: OpportunityDecisionState;
  reason: string;
  highMarginStatus: HighMarginStatus;
  valueBucket: ExpectedValueBucket;
  executeReadiness: "NOT_READY" | "PER_TRADE_VALIDATION_REQUIRED" | "BLOCKED";
  dataLabel: "REAL_PROVIDER_DATA" | "PROVIDER_NOT_CONFIGURED" | "NO_MATCHES_FOUND";
}

export interface TotalsWatchEntry {
  id: string;
  sportKey: string;
  league: string;
  game: string;
  kalshiMarketTicker: string;
  state: OpportunityDecisionState;
  reason: string;
  currentScore: number | null;
  projectedTotal: number | null;
  paceStatus: string;
  scoreFresh: boolean;
  clockFresh: boolean;
  kalshiTotalLine?: number | null;
  sportsbookLiveTotal?: number | null;
  acceleration?: number;
}

export interface OpportunityListResponse {
  dataLabel: "REAL_PROVIDER_DATA" | "PROVIDER_NOT_CONFIGURED" | "NO_MATCHES_FOUND";
  providerStatus: string;
  message: string;
  scannedAt: string;
  items: ScoredOpportunity[];
}

export interface RiskExposureSnapshot {
  totalOpenExposure: number;
  dailyRealizedLoss: number;
  exposureByGame: Record<string, number>;
  exposureByLeague: Record<string, number>;
  openTradesCount: number;
  tradesToday: number;
  openMarketTickers: string[];
  balanceFreshAt: string | null;
  positionsFreshAt: string | null;
}

export interface ManualExecutionEnabledStatus {
  enabled: boolean;
  blockedReasons: string[];
  killSwitchActive: boolean;
  realMoneyTradingEnabled: boolean;
  healthColor: "RED" | "YELLOW" | "GREEN";
}
