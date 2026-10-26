export type Side = 'BUY' | 'SELL';
export type Outcome = 'YES' | 'NO';
export type TradingMode = 'paper' | 'live';
export type StrategyKind = 'micro-maker' | 'momentum-taker';

export type StrategyAction = 'HOLD' | 'PLACE_BID' | 'PLACE_ASK' | 'TAKE_BUY' | 'TAKE_SELL';

export type EngineStatus = 'starting' | 'running' | 'stopped' | 'killed' | 'error';

export type SessionStatus = 'running' | 'stopped' | 'killed' | 'error';

export interface PaperSession {
  readonly id: string;
  readonly startedAt: number;
  readonly endedAt: number | null;
  readonly status: SessionStatus;
  readonly mode: TradingMode;
  readonly startingCash: number;
  readonly endingEquity: number | null;
  readonly stopReason: string | null;
}

export type GeoblockStatus = 'ELIGIBLE' | 'BLOCKED' | 'UNKNOWN';

export interface BookLevel {
  readonly price: number;
  readonly size: number;
}

export interface OrderBook {
  readonly tokenId: string;
  readonly marketId: string;
  readonly outcome: Outcome;
  readonly tickSize: number;
  readonly timestamp: number;
  readonly bids: readonly BookLevel[];
  readonly asks: readonly BookLevel[];
  readonly lastTradePrice: number | null;
  readonly hash: string | null;
}

export interface TopOfBook {
  readonly bid: number;
  readonly ask: number;
  readonly bidSize: number;
  readonly askSize: number;
  readonly mid: number;
  readonly microprice: number;
  readonly spread: number;
  readonly crossed: boolean;
}

export interface Market {
  readonly id: string;
  readonly conditionId: string;
  readonly slug: string;
  readonly question: string;
  readonly endDate: string | null;
  readonly liquidity: number;
  readonly volume24h: number;
  readonly yesTokenId: string;
  readonly noTokenId: string;
  readonly tickSize: number;
  readonly negRisk: boolean;
  readonly active: boolean;
  readonly closed: boolean;
  readonly acceptingOrders: boolean;
}

export interface Position {
  readonly marketId: string;
  readonly tokenId: string;
  readonly outcome: Outcome;
  readonly shares: number;
  readonly avgPrice: number;
  readonly openedAt: number;
  readonly updatedAt: number;
}

export interface PortfolioSnapshot {
  readonly startingCash: number;
  readonly cash: number;
  readonly reservedCash: number;
  readonly equity: number;
  readonly exposure: number;
  readonly realizedPnl: number;
  readonly unrealizedPnl: number;
  readonly totalPnl: number;
  readonly positions: readonly Position[];
  readonly openOrders: number;
  readonly updatedAt: number;
}

export interface StrategyConfig {
  readonly minEdge: number;
  readonly minImbalance: number;
  readonly maxSpread: number;
  readonly minDepthShares: number;
  readonly maxBookAgeMs: number;
  readonly cooldownMs: number;
  readonly takeProfitEdge: number;
  readonly stopLossEdge: number;
  readonly orderNotional: number;
  readonly tickSize: number;
  readonly momentumHorizon: number;
}

export interface StrategyContext {
  readonly now: number;
  readonly position: Position | null;
  readonly lastEntryAt: number | null;
}

export interface StrategyIntent {
  readonly action: StrategyAction;
  readonly tokenId: string;
  readonly marketId: string;
  readonly outcome: Outcome;
  readonly price: number;
  readonly size: number;
  readonly fairValue: number;
  readonly edge: number;
  readonly confidence: number;
  readonly reasons: readonly string[];
  readonly createdAt: number;
}

export interface Strategy {
  readonly kind: StrategyKind;
  evaluate(book: OrderBook, context: StrategyContext): StrategyIntent;
  reset(tokenId?: string): void;
}

export interface RiskLimits {
  readonly maxNotionalPerMarket: number;
  readonly maxTotalNotional: number;
  readonly maxOpenPositions: number;
  readonly maxDailyLoss: number;
  readonly maxDrawdownPct: number;
  readonly maxOrdersPerMinute: number;
  readonly maxBookAgeMs: number;
  readonly maxSpread: number;
  readonly minDepthShares: number;
}

export interface RiskCheck {
  readonly name: string;
  readonly ok: boolean;
  readonly detail: string;
}

export interface RiskDecision {
  readonly allowed: boolean;
  readonly checks: readonly RiskCheck[];
  readonly reasons: readonly string[];
}

export interface Signal {
  readonly id: string;
  readonly at: number;
  readonly marketId: string;
  readonly tokenId: string;
  readonly outcome: Outcome;
  readonly action: StrategyAction;
  readonly fairValue: number;
  readonly marketPrice: number;
  readonly edge: number;
  readonly confidence: number;
  readonly accepted: boolean;
  readonly reasons: readonly string[];
}

export interface Trade {
  readonly id: string;
  readonly at: number;
  readonly marketId: string;
  readonly tokenId: string;
  readonly outcome: Outcome;
  readonly side: Side;
  readonly price: number;
  readonly size: number;
  readonly notional: number;
  readonly fee: number;
  readonly realizedPnl: number;
  readonly orderId: string;
  readonly mode: TradingMode;
}

export type OrderType = 'limit' | 'market';
export type OrderStatus = 'open' | 'filled' | 'cancelled' | 'rejected';

export interface OrderRequest {
  readonly marketId: string;
  readonly tokenId: string;
  readonly outcome: Outcome;
  readonly side: Side;
  readonly type: OrderType;
  readonly limitPrice: number | null;
  readonly size: number;
  readonly reason: string;
}

export interface PaperOrder {
  readonly id: string;
  readonly marketId: string;
  readonly tokenId: string;
  readonly outcome: Outcome;
  readonly side: Side;
  readonly type: OrderType;
  readonly limitPrice: number | null;
  readonly size: number;
  readonly filledSize: number;
  readonly avgFillPrice: number;
  readonly fee: number;
  readonly status: OrderStatus;
  readonly reason: string;
  readonly rejectionReason: string | null;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface MarketView {
  readonly market: Market;
  readonly book: TopOfBook | null;
  readonly decision: StrategyIntent | null;
  readonly position: Position | null;
  readonly score: number;
  readonly bookAgeMs: number | null;
}

export interface MarketDetail {
  readonly market: Market;
  readonly book: OrderBook | null;
  readonly decision: StrategyIntent | null;
  readonly position: Position | null;
  readonly score: number;
}

export interface ProviderHealth {
  readonly name: string;
  readonly connected: boolean;
  readonly lastMessageAt: number | null;
  readonly reconnectCount: number;
  readonly error: string | null;
}

export interface GeoblockView {
  readonly status: GeoblockStatus;
  readonly blocked: boolean | null;
  readonly country: string | null;
  readonly region: string | null;
  readonly checkedAt: number | null;
  readonly reason: string | null;
}

export interface EngineHealth {
  readonly status: EngineStatus;
  readonly mode: TradingMode;
  readonly liveAuthorized: boolean;
  readonly liveAllowed: boolean;
  readonly liveBlockReason: string | null;
  readonly startedAt: number | null;
  readonly uptimeMs: number;
  readonly markets: number;
  readonly subscriptions: number;
  readonly books: number;
  readonly lastBookAt: number | null;
  readonly provider: ProviderHealth;
  readonly geoblock: GeoblockView;
  readonly killReason: string | null;
}

export interface RiskState {
  readonly killSwitch: boolean;
  readonly dailyPnl: number;
  readonly peakEquity: number;
  readonly drawdownPct: number;
  readonly exposure: number;
  readonly openPositions: number;
  readonly ordersLastMinute: number;
  readonly limits: RiskLimits;
  readonly checks: readonly RiskCheck[];
}

export interface PublicConfig {
  readonly strategy: StrategyKind;
  readonly startingCash: number;
  readonly feeBps: number;
  readonly maxMarkets: number;
  readonly demoMode: boolean;
  readonly strategyConfig: StrategyConfig;
  readonly riskLimits: RiskLimits;
}

export interface StateResponse {
  readonly health: EngineHealth;
  readonly session: PaperSession | null;
  readonly sessions: readonly PaperSession[];
  readonly markets: readonly MarketView[];
  readonly portfolio: PortfolioSnapshot;
  readonly trades: readonly Trade[];
  readonly signals: readonly Signal[];
  readonly risk: RiskState;
  readonly config: PublicConfig;
  readonly equityCurve: readonly EquityPoint[];
}

export interface ControlRequest {
  readonly action: 'start' | 'stop' | 'kill' | 'reset-kill';
}

export interface ApiError {
  readonly code: string;
  readonly message: string;
}

export interface ApiSuccess<T> {
  readonly ok: true;
  readonly data: T;
}

export interface ApiFailure {
  readonly ok: false;
  readonly error: ApiError;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export interface BacktestMetrics {
  readonly books: number;
  readonly signals: number;
  readonly acceptedSignals: number;
  readonly ordersPlaced: number;
  readonly fills: number;
  readonly trades: number;
  readonly wins: number;
  readonly losses: number;
  readonly winRate: number;
  readonly startingCash: number;
  readonly endingEquity: number;
  readonly totalReturnPct: number;
  readonly realizedPnl: number;
  readonly unrealizedPnl: number;
  readonly totalPnl: number;
  readonly fees: number;
  readonly grossProfit: number;
  readonly grossLoss: number;
  readonly profitFactor: number;
  readonly avgTradePnl: number;
  readonly maxDrawdownPct: number;
  readonly maxExposure: number;
  readonly fillRate: number;
  readonly tickSizes: readonly number[];
  readonly equityCurve: readonly EquityPoint[];
}

export interface EquityPoint {
  readonly at: number;
  readonly equity: number;
  readonly exposure: number;
}
