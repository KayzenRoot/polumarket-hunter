import type { Market } from '@polyhunter/core';
import { PolyHunterDb } from '@polyhunter/persistence';
import {
  type BookFetchResult,
  type GeoblockResult,
  type MarketSocketOptions,
  unknownGeoblock,
} from '@polyhunter/polymarket';
import { makeBook, makeClock } from '@polyhunter/testkit';
import type { Logger } from 'pino';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../src/config.js';
import {
  type EngineAlert,
  type EngineDeps,
  type MarketStream,
  PolyHunterEngine,
} from '../src/engine.js';
import { createLogger } from '../src/logger.js';

interface Harness {
  readonly engine: PolyHunterEngine;
  readonly db: PolyHunterDb;
  readonly clock: ReturnType<typeof makeClock>;
  readonly logger: Logger;
}

const engines: PolyHunterEngine[] = [];
const databases: PolyHunterDb[] = [];

function harness(
  overrides: Record<string, string> = {},
  deps: { alertSink?: EngineDeps['alertSink'] } = {},
): Harness {
  const config = loadConfig({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    DEMO_MODE: 'true',
    DATABASE_PATH: ':memory:',
    STARTING_CASH: '1000',
    MIN_EDGE: '0.001',
    MIN_IMBALANCE: '0.1',
    MAX_SPREAD: '0.05',
    MIN_DEPTH_SHARES: '10',
    ORDER_NOTIONAL: '10',
    TAKE_PROFIT_EDGE: '0.05',
    STOP_LOSS_EDGE: '0.2',
    COOLDOWN_MS: '0',
    ...overrides,
  });
  const db = PolyHunterDb.inMemory();
  const logger = createLogger({ ...config, logLevel: 'silent' });
  const clock = makeClock(1_000_000);
  let counter = 0;
  const engine = new PolyHunterEngine({
    config,
    db,
    logger,
    gamma: {
      listMarkets: async () => {
        throw new Error('gamma should not be called in demo mode');
      },
    },
    clob: {
      getBooks: async () => [],
    },
    geoblock: {
      ensureFresh: async (): Promise<GeoblockResult> => unknownGeoblock(clock.now(), 'test'),
      current: () => null,
    },
    now: clock.now,
    idFactory: (prefix) => {
      counter += 1;
      return `${prefix}_test_${counter}`;
    },
    ...(deps.alertSink === undefined ? {} : { alertSink: deps.alertSink }),
  });
  engines.push(engine);
  databases.push(db);
  return { engine, db, clock, logger };
}

const LIVE_MARKET: Market = {
  id: 'market-1',
  conditionId: 'condition-1',
  slug: 'market-1',
  question: 'Market 1?',
  endDate: null,
  liquidity: 100_000,
  volume24h: 50_000,
  yesTokenId: 'yes-token',
  noTokenId: 'no-token',
  tickSize: 0.01,
  negRisk: false,
  active: true,
  closed: false,
  acceptingOrders: true,
};

const LIVE_TOKEN = {
  marketId: 'market-1',
  tokenId: 'yes-token',
  outcome: 'YES' as const,
  tickSize: 0.01,
};

function liveBookResult(): BookFetchResult {
  return {
    token: LIVE_TOKEN,
    book: {
      conditionId: 'condition-1',
      assetId: 'yes-token',
      timestamp: 1_000_000,
      hash: null,
      bids: [{ price: 0.48, size: 300 }],
      asks: [{ price: 0.5, size: 300 }],
      lastTradePrice: 0.49,
      tickSize: 0.01,
    },
    error: null,
  };
}

function liveHarness(
  options: {
    readonly books?: readonly BookFetchResult[];
    readonly stream?: Partial<MarketStream>;
    readonly env?: Readonly<Record<string, string>>;
    readonly alertSink?: EngineDeps['alertSink'];
  } = {},
): {
  engine: PolyHunterEngine;
  db: PolyHunterDb;
  opened: string[];
  clock: ReturnType<typeof makeClock>;
} {
  const config = loadConfig({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    DEMO_MODE: 'false',
    DATABASE_PATH: ':memory:',
    MAX_MARKETS: '2',
    ...options.env,
  });
  const db = PolyHunterDb.inMemory();
  databases.push(db);
  const logger = createLogger({ ...config, logLevel: 'silent' });
  const opened: string[] = [];
  const clock = makeClock(1_000_000);
  const engine = new PolyHunterEngine({
    config,
    db,
    logger,
    gamma: { listMarkets: async () => [LIVE_MARKET] },
    clob: { getBooks: async () => options.books ?? [liveBookResult()] },
    geoblock: {
      ensureFresh: async () => ({
        status: 'ELIGIBLE',
        blocked: false,
        ip: null,
        country: null,
        region: null,
        checkedAt: 1_000_000,
        reason: null,
      }),
      current: () => null,
    },
    socketFactory: () => ({
      connect: () => opened.push('connect'),
      close: () => opened.push('close'),
      updateTokens: () => opened.push('update'),
      isConnected: true,
      lastMessage: 1_000_000,
      reconnectCount: 0,
      lastError: null,
      ...options.stream,
    }),
    now: clock.now,
    ...(options.alertSink === undefined ? {} : { alertSink: options.alertSink }),
  });
  engines.push(engine);
  return { engine, db, opened, clock };
}

function liveRefusalHarness(geoblock: GeoblockResult): {
  engine: PolyHunterEngine;
  db: PolyHunterDb;
} {
  const config = loadConfig({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    DEMO_MODE: 'false',
    TRADING_MODE: 'live',
    LIVE_TRADING_AUTHORIZED: 'true',
    DATABASE_PATH: ':memory:',
  });
  const db = PolyHunterDb.inMemory();
  databases.push(db);
  const logger = createLogger({ ...config, logLevel: 'silent' });
  const engine = new PolyHunterEngine({
    config,
    db,
    logger,
    gamma: { listMarkets: async () => [] },
    clob: { getBooks: async () => [] },
    geoblock: {
      ensureFresh: async () => geoblock,
      current: () => null,
    },
    now: () => 1_000_000,
  });
  engines.push(engine);
  return { engine, db };
}

function quoteBook(now: number) {
  return makeBook({
    tokenId: 'demo-yes-fed',
    marketId: 'demo-fed',
    outcome: 'YES',
    timestamp: now,
    bids: [
      { price: 0.48, size: 300 },
      { price: 0.47, size: 300 },
    ],
    asks: [
      { price: 0.5, size: 100 },
      { price: 0.51, size: 300 },
    ],
  });
}

function crossingBook(now: number) {
  return makeBook({
    tokenId: 'demo-yes-fed',
    marketId: 'demo-fed',
    outcome: 'YES',
    timestamp: now,
    bids: [
      { price: 0.48, size: 300 },
      { price: 0.47, size: 300 },
    ],
    asks: [
      { price: 0.47, size: 100 },
      { price: 0.48, size: 300 },
    ],
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  for (const engine of engines.splice(0)) {
    engine.stop();
  }
  for (const db of databases.splice(0)) {
    db.close();
  }
  vi.useRealTimers();
});

describe('paper engine', () => {
  it('starts in demo mode and exposes a complete state', async () => {
    const { engine } = harness();
    await engine.start();
    const state = engine.state();
    expect(state.health.status).toBe('running');
    expect(state.health.mode).toBe('paper');
    expect(state.health.geoblock.status).toBe('UNKNOWN');
    expect(state.markets).toHaveLength(3);
    expect(state.portfolio.equity).toBe(1000);
    expect(state.equityCurve.length).toBeGreaterThanOrEqual(1);
    expect(state.config.demoMode).toBe(true);
    expect(state.session).toMatchObject({
      status: 'running',
      mode: 'paper',
      startingCash: 1000,
      endedAt: null,
      stopReason: null,
    });
    expect(state.sessions.map((session) => session.id)).toContain(state.session?.id);
  });

  it('places a resting bid, fills it and persists the trade', async () => {
    const { engine, clock, db } = harness();
    await engine.start();
    engine.ingestBook(quoteBook(clock.now()));

    let state = engine.state();
    expect(state.portfolio.openOrders).toBe(1);
    expect(db.listSignals()).toHaveLength(1);

    clock.advance(1000);
    engine.ingestBook(crossingBook(clock.now()));
    state = engine.state();
    expect(state.portfolio.reservedCash).toBe(0);
    expect(state.portfolio.positions).toHaveLength(1);
    expect(db.listTrades()).toHaveLength(1);
    expect(state.trades).toHaveLength(1);
  });

  it('does not flood the signal log while a quote is resting', async () => {
    const { engine, clock, db } = harness();
    await engine.start();
    engine.ingestBook(quoteBook(clock.now()));
    engine.ingestBook(quoteBook(clock.now()));
    expect(db.listSignals()).toHaveLength(1);
  });

  it('holds on stale and crossed books without creating exposure', async () => {
    const { engine, clock, db } = harness();
    await engine.start();
    const tokenId = 'demo-yes-fed';
    const marketId = 'demo-fed';

    engine.ingestBook(
      makeBook({
        tokenId,
        marketId,
        outcome: 'YES',
        timestamp: clock.now() - 60_000,
        bids: [{ price: 0.48, size: 300 }],
        asks: [{ price: 0.5, size: 100 }],
      }),
    );
    const staleView = engine.state().markets.find((view) => view.market.yesTokenId === tokenId);
    expect(staleView?.decision).toMatchObject({ action: 'HOLD' });
    expect(staleView?.decision?.reasons.join(' ')).toContain('stale');

    clock.advance(1000);
    engine.ingestBook(
      makeBook({
        tokenId,
        marketId,
        outcome: 'YES',
        timestamp: clock.now(),
        bids: [{ price: 0.55, size: 300 }],
        asks: [{ price: 0.5, size: 100 }],
      }),
    );
    const crossedView = engine.state().markets.find((view) => view.market.yesTokenId === tokenId);
    expect(crossedView?.decision).toMatchObject({ action: 'HOLD' });
    expect(crossedView?.decision?.reasons.join(' ')).toContain('crossed');

    const state = engine.state();
    expect(state.portfolio.openOrders).toBe(0);
    expect(state.portfolio.positions).toHaveLength(0);
    expect(state.trades).toHaveLength(0);
    expect(db.listSignals()).toHaveLength(0);
    expect(db.listTrades()).toHaveLength(0);
  });

  it('blocks a buy that breaches the per-market risk limit', async () => {
    const { engine, clock, db } = harness({ MAX_NOTIONAL_PER_MARKET: '0.5' });
    await engine.start();
    engine.ingestBook(quoteBook(clock.now()));
    const signals = db.listSignals();
    expect(signals).toHaveLength(1);
    expect(signals[0]?.accepted).toBe(false);
    expect(signals[0]?.reasons.join(' ')).toContain('market-notional');
    expect(engine.state().portfolio.openOrders).toBe(0);
  });

  it('auto-kills on the daily loss limit and cancels resting orders', async () => {
    const alerts: EngineAlert[] = [];
    const { engine, clock, db } = harness(
      {
        MAX_DAILY_LOSS: '1',
        MAX_DRAWDOWN_PCT: '1',
        ORDER_NOTIONAL: '20',
        MAX_NOTIONAL_PER_MARKET: '25',
      },
      {
        alertSink: (alert) => {
          alerts.push(alert);
        },
      },
    );
    await engine.start();
    engine.ingestBook(quoteBook(clock.now()));
    clock.advance(1000);
    engine.ingestBook(crossingBook(clock.now()));
    expect(engine.health().status).toBe('running');

    clock.advance(1000);
    engine.ingestBook(
      makeBook({
        tokenId: 'demo-yes-fed',
        marketId: 'demo-fed',
        outcome: 'YES',
        timestamp: clock.now(),
        bids: [{ price: 0.3, size: 300 }],
        asks: [{ price: 0.32, size: 300 }],
      }),
    );

    expect(engine.health().status).toBe('killed');
    expect(engine.health().killReason).toContain('daily loss limit');
    expect(engine.state().risk.killSwitch).toBe(true);
    expect(engine.state().portfolio.openOrders).toBe(0);
    expect(engine.state().session?.status).toBe('killed');
    expect(alerts[0]).toMatchObject({ kind: 'auto-kill', mode: 'paper' });
    expect(db.listEvents().map((event) => event.kind)).toContain('auto_kill');
    await expect(engine.start()).rejects.toThrow(/kill switch is active/);

    engine.stop();
    await expect(engine.start()).rejects.toThrow(/kill switch is active/);
    await engine.control('reset-kill');
    await engine.start();
    expect(engine.health().status).toBe('running');
  });

  it('auto-kills on the drawdown limit', async () => {
    const { engine, clock } = harness({
      MAX_DAILY_LOSS: '1000',
      MAX_DRAWDOWN_PCT: '0.01',
      ORDER_NOTIONAL: '20',
      MAX_NOTIONAL_PER_MARKET: '25',
    });
    await engine.start();
    engine.ingestBook(quoteBook(clock.now()));
    clock.advance(1000);
    engine.ingestBook(crossingBook(clock.now()));
    clock.advance(1000);
    engine.ingestBook(
      makeBook({
        tokenId: 'demo-yes-fed',
        marketId: 'demo-fed',
        outcome: 'YES',
        timestamp: clock.now(),
        bids: [{ price: 0.2, size: 300 }],
        asks: [{ price: 0.22, size: 300 }],
      }),
    );

    expect(engine.health().status).toBe('killed');
    expect(engine.health().killReason).toContain('drawdown limit');
  });

  it('auto-kills on a stale feed and recovers only after reset-kill', async () => {
    const alerts: EngineAlert[] = [];
    const { engine, clock } = liveHarness({
      books: [],
      env: { FEED_STALE_MS: '1000' },
      alertSink: (alert) => {
        alerts.push(alert);
      },
    });
    await engine.start();
    expect(engine.health().lastBookAt).toBeNull();

    clock.advance(2000);
    vi.advanceTimersByTime(1000);
    expect(engine.health().status).toBe('killed');
    expect(engine.health().killReason).toContain('stale feed');
    expect(alerts[0]).toMatchObject({ kind: 'auto-kill', mode: 'paper' });
    await expect(engine.start()).rejects.toThrow(/kill switch is active/);

    await engine.control('reset-kill');
    expect(engine.health().status).toBe('running');
    engine.ingestBook(
      makeBook({
        tokenId: 'yes-token',
        marketId: 'market-1',
        outcome: 'YES',
        timestamp: clock.now(),
        bids: [{ price: 0.48, size: 300 }],
        asks: [{ price: 0.5, size: 300 }],
      }),
    );
    vi.advanceTimersByTime(1000);
    expect(engine.health().status).toBe('running');
  });

  it('stops, kills and resets the kill switch', async () => {
    const { engine } = harness();
    await engine.start();
    engine.kill('operator test');
    expect(engine.health().status).toBe('killed');
    expect(engine.health().killReason).toBe('operator test');

    await engine.control('reset-kill');
    expect(engine.health().status).toBe('running');
    expect(engine.state().risk.killSwitch).toBe(false);

    engine.stop();
    expect(engine.health().status).toBe('stopped');
  });

  it('records a session on start and closes it on stop', async () => {
    const { engine, db, clock } = harness();
    await engine.start();
    const started = engine.state().session;
    expect(started).not.toBeNull();
    if (started === null) {
      throw new Error('expected a running session');
    }
    expect(db.getRun(started.id)).toMatchObject({
      id: started.id,
      status: 'running',
      mode: 'paper',
      startedAt: clock.now(),
      endedAt: null,
    });

    clock.advance(5_000);
    engine.stop();
    const stopped = engine.state().session;
    expect(stopped).not.toBeNull();
    if (stopped === null) {
      throw new Error('expected a stopped session');
    }
    expect(stopped).toMatchObject({
      id: started.id,
      status: 'stopped',
      stopReason: 'engine stopped',
      endedAt: clock.now(),
      endingEquity: 1000,
    });
    expect(db.getRun(started.id)).toEqual(stopped);
  });

  it('marks the session killed and restores it on reset', async () => {
    const { engine, db, clock } = harness();
    await engine.start();
    const session = engine.state().session;
    expect(session).not.toBeNull();
    if (session === null) {
      throw new Error('expected a running session');
    }

    clock.advance(2_000);
    engine.kill('operator test');
    expect(engine.state().session).toMatchObject({
      id: session.id,
      status: 'killed',
      stopReason: 'operator test',
      endedAt: clock.now(),
      endingEquity: 1000,
    });
    expect(db.getRun(session.id)).toMatchObject({ status: 'killed', endedAt: clock.now() });

    await engine.control('reset-kill');
    expect(engine.state().session).toMatchObject({
      id: session.id,
      status: 'running',
      stopReason: null,
      endedAt: null,
      endingEquity: null,
    });
    expect(db.getRun(session.id)).toMatchObject({ status: 'running', endedAt: null });
  });

  it('keeps ledgers separate when the engine restarts', async () => {
    const { engine, db, clock } = harness();
    await engine.start();
    const first = engine.state().session;
    expect(first).not.toBeNull();
    if (first === null) {
      throw new Error('expected a running session');
    }

    engine.ingestBook(quoteBook(clock.now()));
    clock.advance(1000);
    engine.ingestBook(crossingBook(clock.now()));
    expect(engine.trades(100, first.id)).toHaveLength(1);
    expect(engine.state().trades).toHaveLength(1);

    engine.stop();
    await engine.start();
    const second = engine.state().session;
    expect(second).not.toBeNull();
    if (second === null) {
      throw new Error('expected a new session');
    }
    expect(second.id).not.toBe(first.id);
    expect(engine.trades(100, first.id)).toHaveLength(1);
    expect(engine.trades(100, second.id)).toHaveLength(0);
    expect(engine.signals(100, second.id)).toHaveLength(0);
    expect(engine.state().trades).toHaveLength(0);
    expect(
      engine
        .state()
        .sessions.map((item) => item.id)
        .sort(),
    ).toEqual([first.id, second.id].sort());
    expect(db.listRuns()).toHaveLength(2);
  });

  it('notifies state subscribers', async () => {
    const { engine } = harness();
    const states: string[] = [];
    const unsubscribe = engine.subscribe((state) => states.push(state.health.status));
    await engine.start();
    engine.kill('notify');
    expect(states).toContain('running');
    expect(states).toContain('killed');
    unsubscribe();
  });

  it('emits Prometheus metrics', async () => {
    const { engine } = harness();
    await engine.start();
    const metrics = engine.metrics();
    expect(metrics).toContain('polyhunter_up 1');
    expect(metrics).toContain('polyhunter_provider_connected 1');
    expect(metrics).toContain('polyhunter_equity_usd');
  });

  it('refuses live mode even when authorized and eligible', async () => {
    const { engine } = liveRefusalHarness({
      status: 'ELIGIBLE',
      blocked: false,
      ip: '203.0.113.10',
      country: 'PT',
      region: null,
      checkedAt: 1_000_000,
      reason: null,
    });

    await expect(engine.start()).rejects.toThrow(/live execution adapter is not implemented/);
    expect(engine.health().status).toBe('error');
    expect(engine.health().liveAllowed).toBe(false);
  });

  it('starts from live public clients when demo mode is off', async () => {
    const { engine, opened } = liveHarness();

    await engine.start();
    expect(engine.health().status).toBe('running');
    expect(engine.state().markets).toHaveLength(1);
    expect(opened).toContain('connect');
    expect(engine.health().provider.connected).toBe(true);
  });

  it('fails closed when the initial book fetch returns no books', async () => {
    const { engine, db } = liveHarness({
      books: [{ token: LIVE_TOKEN, book: null, error: 'HTTP 503' }],
      stream: {
        isConnected: false,
        lastMessage: null,
        reconnectCount: 2,
        lastError: 'stream down',
      },
    });

    await engine.start();
    const state = engine.state();
    expect(state.markets).toHaveLength(1);
    expect(state.markets[0]?.book).toBeNull();
    expect(state.portfolio.openOrders).toBe(0);
    expect(state.portfolio.positions).toHaveLength(0);
    expect(state.trades).toHaveLength(0);
    expect(state.health.books).toBe(0);
    expect(state.health.lastBookAt).toBeNull();
    expect(state.health.provider).toMatchObject({
      connected: false,
      lastMessageAt: null,
      reconnectCount: 2,
      error: 'stream down',
    });
    expect(db.listSignals()).toHaveLength(0);
    expect(db.listTrades()).toHaveLength(0);
    expect(db.listEvents().map((event) => event.kind)).toContain('engine_started');
    expect(engine.metrics()).toContain('polyhunter_provider_connected 0');
    expect(engine.metrics()).toContain('polyhunter_last_book_age_ms -1');
  });

  it('fails closed when the scanner returns no markets', async () => {
    const config = loadConfig({
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      DEMO_MODE: 'false',
      DATABASE_PATH: ':memory:',
    });
    const db = PolyHunterDb.inMemory();
    databases.push(db);
    const logger = createLogger({ ...config, logLevel: 'silent' });
    const engine = new PolyHunterEngine({
      config,
      db,
      logger,
      gamma: { listMarkets: async () => [] },
      clob: { getBooks: async () => [] },
      geoblock: {
        ensureFresh: async () => unknownGeoblock(1_000_000, 'test'),
        current: () => null,
      },
      now: () => 1_000_000,
    });
    engines.push(engine);
    await expect(engine.start()).rejects.toThrow(/no eligible Polymarket markets/);
    expect(engine.health().status).toBe('error');
    const failed = db.listRuns()[0];
    expect(failed).toMatchObject({ status: 'error', endingEquity: 1000 });
    expect(failed?.stopReason).toMatch(/no eligible Polymarket markets/);
  });

  it('exposes market detail and tolerates idempotent control calls', async () => {
    const { engine } = harness();
    await engine.start();
    expect(engine.marketDetail('unknown')).toBeNull();
    expect(engine.marketDetail('demo-yes-fed')?.market.id).toBe('demo-fed');

    await engine.control('reset-kill');
    expect(engine.health().status).toBe('running');

    engine.stop();
    engine.stop();
    expect(engine.health().status).toBe('stopped');
  });

  it('ignores books for tokens outside the subscription set', async () => {
    const { engine, clock, db } = harness();
    await engine.start();
    engine.ingestBook(
      makeBook({
        tokenId: 'unknown-token',
        marketId: 'unknown-market',
        timestamp: clock.now(),
      }),
    );
    expect(db.listSignals()).toHaveLength(0);
  });

  it('refuses live mode when the venue geoblock is blocked', async () => {
    const { engine } = liveRefusalHarness({
      status: 'BLOCKED',
      blocked: true,
      ip: null,
      country: 'BR',
      region: null,
      checkedAt: 1_000_000,
      reason: 'blocked in BR',
    });

    await expect(engine.start()).rejects.toThrow(/live trading is not eligible/);
    expect(engine.health().status).toBe('error');
  });

  it('settles a paper position when the market resolves', async () => {
    const config = loadConfig({
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      DEMO_MODE: 'false',
      DATABASE_PATH: ':memory:',
      MIN_EDGE: '0.001',
      MIN_IMBALANCE: '0.1',
      MAX_SPREAD: '0.05',
      MIN_DEPTH_SHARES: '10',
      ORDER_NOTIONAL: '10',
      TAKE_PROFIT_EDGE: '0.05',
      STOP_LOSS_EDGE: '0.2',
      COOLDOWN_MS: '0',
    });
    const db = PolyHunterDb.inMemory();
    databases.push(db);
    const logger = createLogger({ ...config, logLevel: 'silent' });
    let captured: MarketSocketOptions | null = null;
    const engine = new PolyHunterEngine({
      config,
      db,
      logger,
      gamma: {
        listMarkets: async () => [
          {
            id: 'market-1',
            conditionId: 'condition-1',
            slug: 'market-1',
            question: 'Market 1?',
            endDate: null,
            liquidity: 100_000,
            volume24h: 50_000,
            yesTokenId: 'yes-token',
            noTokenId: 'no-token',
            tickSize: 0.01,
            negRisk: false,
            active: true,
            closed: false,
            acceptingOrders: true,
          },
        ],
      },
      clob: {
        getBooks: async () => [
          {
            token: { marketId: 'market-1', tokenId: 'yes-token', outcome: 'YES', tickSize: 0.01 },
            book: {
              conditionId: 'condition-1',
              assetId: 'yes-token',
              timestamp: 1_000_000,
              hash: null,
              bids: [{ price: 0.48, size: 300 }],
              asks: [{ price: 0.5, size: 300 }],
              lastTradePrice: 0.49,
              tickSize: 0.01,
            },
            error: null,
          },
        ],
      },
      geoblock: {
        ensureFresh: async () => ({
          status: 'ELIGIBLE',
          blocked: false,
          ip: null,
          country: null,
          region: null,
          checkedAt: 1_000_000,
          reason: null,
        }),
        current: () => null,
      },
      socketFactory: (options) => {
        captured = options;
        return {
          connect: () => undefined,
          close: () => undefined,
          updateTokens: () => undefined,
          isConnected: true,
          lastMessage: 1_000_000,
          reconnectCount: 0,
          lastError: null,
        };
      },
      now: () => 1_000_000,
    });
    engines.push(engine);
    await engine.start();

    if (captured === null) {
      throw new Error('expected a captured socket configuration');
    }
    const socketOptions: MarketSocketOptions = captured;
    socketOptions.onEvent?.({
      type: 'tick_size_change',
      tokenId: 'yes-token',
      oldTickSize: 0.01,
      newTickSize: 0.001,
      at: 1_000_000,
    });
    expect(engine.state().markets[0]?.market.tickSize).toBe(0.001);
    expect(db.listEvents().map((event) => event.kind)).toContain('tick_size_change');

    engine.ingestBook(
      makeBook({
        tokenId: 'yes-token',
        marketId: 'market-1',
        outcome: 'YES',
        tickSize: 0.001,
        timestamp: 1_000_000,
        bids: [{ price: 0.48, size: 300 }],
        asks: [{ price: 0.5, size: 100 }],
      }),
    );
    expect(engine.marketDetail('yes-token')?.book?.tickSize).toBe(0.001);
    engine.ingestBook(
      makeBook({
        tokenId: 'yes-token',
        marketId: 'market-1',
        outcome: 'YES',
        timestamp: 1_000_001,
        bids: [{ price: 0.48, size: 300 }],
        asks: [{ price: 0.47, size: 100 }],
      }),
    );
    expect(engine.state().portfolio.positions).toHaveLength(1);

    if (captured === null) {
      throw new Error('expected a captured socket configuration');
    }
    const resolvedSocketOptions: MarketSocketOptions = captured;
    resolvedSocketOptions.onEvent?.({
      type: 'market_resolved',
      conditionId: 'condition-1',
      winningAssetId: 'yes-token',
      winningOutcome: 'Yes',
      at: 1_000_002,
    });

    expect(engine.state().portfolio.positions).toHaveLength(0);
    expect(db.listTrades().length).toBeGreaterThanOrEqual(2);
    expect(db.listEvents().map((event) => event.kind)).toContain('market_resolved');
  });
});
