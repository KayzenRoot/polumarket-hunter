import type {
  BookLevel,
  FeedHealthSnapshot,
  Market,
  OrderBook,
  PaperOrder,
  PaperSession,
  PortfolioSnapshot,
  Position,
  RiskLimits,
  Signal,
  StrategyIntent,
  Trade,
} from '@polyhunter/core';

export function makeLevels(prices: readonly number[], size = 100): BookLevel[] {
  return prices.map((price) => ({ price, size }));
}

export function makeBook(overrides: Partial<OrderBook> = {}): OrderBook {
  return {
    tokenId: 'yes-token',
    marketId: 'market-1',
    outcome: 'YES',
    tickSize: 0.01,
    timestamp: 1_000_000,
    bids: [
      { price: 0.48, size: 200 },
      { price: 0.47, size: 300 },
      { price: 0.46, size: 400 },
    ],
    asks: [
      { price: 0.5, size: 200 },
      { price: 0.51, size: 300 },
      { price: 0.52, size: 400 },
    ],
    lastTradePrice: 0.49,
    hash: 'hash-1',
    ...overrides,
  };
}

export function makeMarket(overrides: Partial<Market> = {}): Market {
  return {
    id: 'market-1',
    conditionId: 'condition-1',
    slug: 'will-test-pass',
    question: 'Will this test pass?',
    endDate: '2027-01-01T00:00:00.000Z',
    liquidity: 100_000,
    volume24h: 50_000,
    yesTokenId: 'yes-token',
    noTokenId: 'no-token',
    tickSize: 0.01,
    negRisk: false,
    active: true,
    closed: false,
    acceptingOrders: true,
    ...overrides,
  };
}

export function makePosition(overrides: Partial<Position> = {}): Position {
  return {
    marketId: 'market-1',
    tokenId: 'yes-token',
    outcome: 'YES',
    shares: 20,
    avgPrice: 0.5,
    openedAt: 900_000,
    updatedAt: 950_000,
    ...overrides,
  };
}

export function makeIntent(overrides: Partial<StrategyIntent> = {}): StrategyIntent {
  return {
    action: 'PLACE_BID',
    tokenId: 'yes-token',
    marketId: 'market-1',
    outcome: 'YES',
    price: 0.49,
    size: 20,
    fairValue: 0.5,
    edge: 0.01,
    confidence: 0.8,
    reasons: ['test intent'],
    createdAt: 1_000_000,
    ...overrides,
  };
}

export function makeRiskLimits(overrides: Partial<RiskLimits> = {}): RiskLimits {
  return {
    maxNotionalPerMarket: 100,
    maxTotalNotional: 500,
    maxOpenPositions: 10,
    maxDailyLoss: 50,
    maxDrawdownPct: 0.2,
    maxOrdersPerMinute: 100,
    maxBookAgeMs: 5000,
    maxSpread: 0.05,
    minDepthShares: 100,
    ...overrides,
  };
}

export function makePaperOrder(overrides: Partial<PaperOrder> = {}): PaperOrder {
  return {
    id: 'order-1',
    marketId: 'market-1',
    tokenId: 'yes-token',
    outcome: 'YES',
    side: 'BUY',
    type: 'limit',
    limitPrice: 0.49,
    size: 10,
    filledSize: 0,
    avgFillPrice: 0,
    fee: 0,
    status: 'open',
    reason: 'test',
    rejectionReason: null,
    createdAt: 1_000_000,
    updatedAt: 1_000_000,
    ...overrides,
  };
}

export function makeTrade(overrides: Partial<Trade> = {}): Trade {
  return {
    id: 'trade-1',
    at: 1_000_000,
    marketId: 'market-1',
    tokenId: 'yes-token',
    outcome: 'YES',
    side: 'BUY',
    price: 0.5,
    size: 10,
    notional: 5,
    fee: 0,
    realizedPnl: 0,
    orderId: 'order-1',
    mode: 'paper',
    ...overrides,
  };
}

export function makeSignal(overrides: Partial<Signal> = {}): Signal {
  return {
    id: 'signal-1',
    at: 1_000_000,
    marketId: 'market-1',
    tokenId: 'yes-token',
    outcome: 'YES',
    action: 'PLACE_BID',
    fairValue: 0.5,
    marketPrice: 0.49,
    edge: 0.01,
    confidence: 0.8,
    accepted: true,
    reasons: ['test signal'],
    ...overrides,
  };
}

export function makeFeedHealth(overrides: Partial<FeedHealthSnapshot> = {}): FeedHealthSnapshot {
  return {
    lastBookAt: 1_000_000,
    ageMs: 0,
    ageP50Ms: 0,
    ageP95Ms: 0,
    ageP99Ms: 0,
    bookStaleMs: 5_000,
    gapP50Ms: 1_000,
    gapP95Ms: 1_500,
    gapP99Ms: 2_000,
    providerLatencyP50Ms: 50,
    providerLatencyP95Ms: 120,
    providerLatencyP99Ms: 200,
    messageGaps: 10,
    stalePeriods: 0,
    staleMs: 0,
    ...overrides,
  };
}

export function makePortfolio(overrides: Partial<PortfolioSnapshot> = {}): PortfolioSnapshot {
  return {
    startingCash: 1000,
    cash: 1000,
    reservedCash: 0,
    equity: 1000,
    exposure: 0,
    realizedPnl: 0,
    unrealizedPnl: 0,
    totalPnl: 0,
    positions: [],
    openOrders: 0,
    updatedAt: 1_000_000,
    ...overrides,
  };
}

export function makeSession(overrides: Partial<PaperSession> = {}): PaperSession {
  return {
    id: 'session-test',
    startedAt: 1_000_000,
    endedAt: null,
    status: 'running',
    mode: 'paper',
    startingCash: 1000,
    endingEquity: null,
    stopReason: null,
    ...overrides,
  };
}

export function makeClock(start = 1_000_000): {
  now: () => number;
  advance: (ms: number) => void;
  set: (value: number) => void;
} {
  let current = start;
  return {
    now: () => current,
    advance: (ms: number) => {
      current += ms;
    },
    set: (value: number) => {
      current = value;
    },
  };
}

export function makeGammaMarket(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: '2589812',
    conditionId: '0xabc',
    slug: 'will-test-pass',
    question: 'Will this test pass?',
    endDate: '2027-01-01T00:00:00.000Z',
    liquidity: '100000',
    volume24hr: 50000,
    clobTokenIds: JSON.stringify(['yes-token', 'no-token']),
    orderPriceMinTickSize: 0.01,
    negRisk: false,
    active: true,
    closed: false,
    acceptingOrders: true,
    enableOrderBook: true,
    ...overrides,
  };
}

export function makeClobBook(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    market: '0xmarket',
    asset_id: 'yes-token',
    timestamp: '1700000000000',
    hash: 'hash-1',
    bids: [
      { price: '0.48', size: '200' },
      { price: '0.47', size: '300' },
    ],
    asks: [
      { price: '0.50', size: '200' },
      { price: '0.51', size: '300' },
    ],
    tick_size: '0.01',
    ...overrides,
  };
}

export function makeGeoblock(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    blocked: false,
    ip: '203.0.113.10',
    country: 'PT',
    region: 'Lisbon',
    ...overrides,
  };
}
