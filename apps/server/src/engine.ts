import {
  actionToSide,
  type ControlRequest,
  createStrategy,
  type EngineHealth,
  type EngineStatus,
  generateSyntheticBooks,
  type Market,
  type MarketDetail,
  type MarketView,
  midPrice,
  normalizeBook,
  type OrderBook,
  PaperBroker,
  type PaperSession,
  type PortfolioSnapshot,
  type PublicConfig,
  RiskController,
  type RiskDecision,
  type RiskState,
  type Signal,
  type StateResponse,
  type Strategy,
  type StrategyIntent,
  scoreMarket,
  type Trade,
  topOfBook,
  ZERO_FEE_SCHEDULE,
} from '@polyhunter/core';
import type { PolyHunterDb } from '@polyhunter/persistence';
import {
  type BookFetchResult,
  type GeoblockResult,
  type MarketEvent,
  MarketSocket,
  type MarketSocketOptions,
  mapRawBook,
  type SocketStatus,
  type TokenMetadata,
  unknownGeoblock,
} from '@polyhunter/polymarket';
import type { Logger } from 'pino';
import type { AppConfig } from './config.js';
import type { EnginePort } from './ports.js';
import { BookRecorder, type BookRecorderLike } from './recorder.js';

export interface MarketStream {
  connect(): void;
  close(): void;
  updateTokens(tokens: readonly TokenMetadata[]): void;
  readonly isConnected: boolean;
  readonly lastMessage: number | null;
  readonly reconnectCount: number;
  readonly lastError: string | null;
}

export interface EngineDeps {
  readonly config: AppConfig;
  readonly db: PolyHunterDb;
  readonly logger: Logger;
  readonly gamma: {
    listMarkets(query: {
      readonly maxMarkets: number;
      readonly minLiquidity: number;
      readonly now: number;
    }): Promise<Market[]>;
  };
  readonly clob: {
    getBooks(tokens: readonly TokenMetadata[]): Promise<readonly BookFetchResult[]>;
  };
  readonly geoblock: {
    ensureFresh(): Promise<GeoblockResult>;
    current(): GeoblockResult | null;
  };
  readonly socketFactory?: (options: MarketSocketOptions) => MarketStream;
  readonly now?: () => number;
  readonly idFactory?: (prefix: string) => string;
  readonly recorderFactory?: (directory: string, now: number) => BookRecorderLike;
}

function defaultIdFactory(now: () => number): (prefix: string) => string {
  let counter = 0;
  return (prefix: string) => {
    counter += 1;
    return `${prefix}_${now().toString(36)}_${counter.toString(36)}`;
  };
}

function isActionable(intent: StrategyIntent): boolean {
  return intent.action !== 'HOLD';
}

export class PolyHunterEngine implements EnginePort {
  private readonly config: AppConfig;
  private readonly db: PolyHunterDb;
  private readonly logger: Logger;
  private readonly gamma: EngineDeps['gamma'];
  private readonly clob: EngineDeps['clob'];
  private readonly geoblock: EngineDeps['geoblock'];
  private readonly now: () => number;
  private readonly idFactory: (prefix: string) => string;
  private readonly socketFactory: (options: MarketSocketOptions) => MarketStream;
  private readonly recorderFactory: (directory: string, now: number) => BookRecorderLike;
  private broker: PaperBroker;
  private readonly strategy: Strategy;
  private riskController: RiskController;

  private status: EngineStatus = 'stopped';
  private session: PaperSession | null = null;
  private startedAt: number | null = null;
  private lastBookAt: number | null = null;
  private killReason: string | null = null;
  private geoblockResult: GeoblockResult;
  private stream: MarketStream | null = null;
  private streamStatus: SocketStatus = {
    connected: false,
    lastMessageAt: null,
    reconnectCount: 0,
    error: null,
  };
  private scanError: string | null = null;
  private recorder: BookRecorderLike | null = null;

  private markets = new Map<string, Market>();
  private tokens = new Map<string, TokenMetadata>();
  private books = new Map<string, OrderBook>();
  private decisions = new Map<string, StrategyIntent>();
  private subscriptions: TokenMetadata[] = [];
  private lastEntryAt = new Map<string, number>();
  private portfolioSnapshot: PortfolioSnapshot;
  private lastRiskDecision: RiskDecision | null = null;

  private scanTimer: ReturnType<typeof setInterval> | null = null;
  private markTimer: ReturnType<typeof setInterval> | null = null;
  private demoTimer: ReturnType<typeof setInterval> | null = null;
  private lastSnapshotAt = 0;

  private demoStep = 0;

  private booksIngested = 0;
  private signalsGenerated = 0;
  private ordersPlaced = 0;
  private riskRejections = 0;
  private orderRejections = 0;

  private readonly stateListeners = new Set<(state: StateResponse) => void>();

  public constructor(deps: EngineDeps) {
    this.config = deps.config;
    this.db = deps.db;
    this.logger = deps.logger;
    this.gamma = deps.gamma;
    this.clob = deps.clob;
    this.geoblock = deps.geoblock;
    this.now = deps.now ?? Date.now;
    this.idFactory = deps.idFactory ?? defaultIdFactory(this.now);
    this.socketFactory =
      deps.socketFactory ?? ((options: MarketSocketOptions) => new MarketSocket(options));
    this.recorderFactory =
      deps.recorderFactory ?? ((directory, now) => new BookRecorder(directory, now));
    this.geoblockResult = unknownGeoblock(this.now(), 'not checked');
    this.broker = this.createBroker();
    this.strategy = createStrategy(this.config.strategy, this.config.strategyConfig);
    this.riskController = new RiskController(this.config.riskLimits, this.config.startingCash);
    this.portfolioSnapshot = this.broker.mark(new Map());
  }

  private createBroker(): PaperBroker {
    return new PaperBroker({
      startingCash: this.config.startingCash,
      feeBps: this.config.feeBps,
      now: this.now,
      idFactory: this.idFactory,
      feeScheduleForMarket: (marketId) => {
        const market = this.markets.get(marketId);
        if (market === undefined) {
          return null;
        }
        if (market.feesEnabled === false) {
          return ZERO_FEE_SCHEDULE;
        }
        return market.feeSchedule ?? null;
      },
    });
  }

  public async start(): Promise<void> {
    if (this.status === 'running') {
      return;
    }
    if (this.status === 'starting') {
      throw new Error('engine is already starting');
    }
    if (this.status === 'killed') {
      throw new Error('kill switch is active; reset it before starting the engine');
    }

    this.status = 'starting';
    this.startedAt = this.now();
    this.killReason = null;
    this.broker = this.createBroker();
    this.portfolioSnapshot = this.broker.mark(new Map());
    this.decisions.clear();
    this.lastEntryAt.clear();
    this.lastRiskDecision = null;
    this.session = {
      id: this.idFactory('ses'),
      startedAt: this.startedAt,
      endedAt: null,
      status: 'running',
      mode: this.config.tradingMode,
      startingCash: this.config.startingCash,
      endingEquity: null,
      stopReason: null,
    };
    this.db.insertRun(this.session);
    this.riskController = new RiskController(this.config.riskLimits, this.portfolioSnapshot.equity);
    try {
      if (this.config.tradingMode === 'live') {
        this.geoblockResult = await this.geoblock.ensureFresh();
        if (!this.config.liveAuthorized) {
          throw new Error('live trading is not authorized on this instance');
        }
        if (this.geoblockResult.status !== 'ELIGIBLE') {
          throw new Error(
            `live trading is not eligible: ${this.geoblockResult.reason ?? 'unknown geoblock state'}`,
          );
        }
        throw new Error('live execution adapter is not implemented in this build');
      }

      if (this.config.demoMode) {
        this.geoblockResult = unknownGeoblock(this.now(), 'demo mode; no live venue access');
        this.setupDemo();
      } else {
        this.geoblockResult = await this.geoblock.ensureFresh();
        await this.refreshMarkets();
        if (this.subscriptions.length === 0) {
          throw new Error('no eligible Polymarket markets returned by the scanner');
        }
      }

      this.startTimers();
      this.status = 'running';
      this.lastSnapshotAt = 0;
      this.updatePortfolio();
      this.db.insertPortfolioSnapshot(this.portfolioSnapshot, this.session.id);
      this.recordEvent('engine_started', 'info', 'paper engine started', {
        mode: this.config.tradingMode,
        markets: this.markets.size,
        demo: this.config.demoMode,
        sessionId: this.session.id,
      });
      this.emitState();
    } catch (error) {
      this.status = 'error';
      this.stream?.close();
      this.stream = null;
      this.scanError = error instanceof Error ? error.message : String(error);
      this.endSession('error', this.scanError);
      this.recordEvent('engine_start_failed', 'error', this.scanError, null);
      this.emitState();
      throw error;
    }
  }

  public stop(): void {
    this.stopTimers();
    this.stream?.close();
    this.stream = null;
    this.broker.cancelAll('engine stopped');
    this.status = 'stopped';
    this.updatePortfolio();
    this.endSession('stopped', 'engine stopped');
    void this.recorder?.close();
    this.recorder = null;
    this.recordEvent('engine_stopped', 'info', 'paper engine stopped', null);
    this.emitState();
  }

  public kill(reason: string): void {
    this.riskController.kill(reason);
    this.broker.cancelAll('kill switch');
    this.killReason = reason;
    this.status = 'killed';
    if (this.session !== null) {
      const next: PaperSession = {
        ...this.session,
        status: 'killed',
        endedAt: this.now(),
        endingEquity: this.portfolioSnapshot.equity,
        stopReason: reason,
      };
      this.session = next;
      this.db.updateRun(next.id, {
        status: next.status,
        endedAt: next.endedAt,
        endingEquity: next.endingEquity,
        stopReason: next.stopReason,
      });
    }
    this.recordEvent('kill_switch', 'warn', reason, null);
    this.updatePortfolio();
    this.emitState();
  }

  public async control(action: ControlRequest['action']): Promise<void> {
    switch (action) {
      case 'start':
        await this.start();
        return;
      case 'stop':
        this.stop();
        return;
      case 'kill':
        this.kill('operator kill switch');
        return;
      case 'reset-kill':
        this.riskController.resetKill();
        this.killReason = null;
        if (this.status === 'killed') {
          this.status = 'running';
          if (this.session !== null) {
            const next: PaperSession = {
              ...this.session,
              status: 'running',
              endedAt: null,
              endingEquity: null,
              stopReason: null,
            };
            this.session = next;
            this.db.updateRun(next.id, {
              status: next.status,
              endedAt: next.endedAt,
              endingEquity: next.endingEquity,
              stopReason: next.stopReason,
            });
          }
        }
        this.recordEvent('kill_switch_reset', 'info', 'kill switch reset', null);
        this.emitState();
        return;
      default:
        throw new Error(`unsupported control action: ${String(action)}`);
    }
  }

  public ingestBook(rawBook: OrderBook, allowTrading = true): void {
    const token = this.tokens.get(rawBook.tokenId);
    if (token === undefined) {
      return;
    }
    const book = normalizeBook(rawBook);
    this.books.set(book.tokenId, book);
    this.lastBookAt = this.now();
    this.booksIngested += 1;
    this.recorder?.write(book);

    const fills = this.broker.onBook(book);
    for (const trade of fills) {
      this.persistTrade(trade);
    }
    if (fills.length > 0) {
      this.logger.info(
        { tokenId: book.tokenId, fills: fills.length },
        'resting paper order filled',
      );
    }

    const intent = this.strategy.evaluate(book, {
      now: this.now(),
      position: this.broker.positionForToken(book.tokenId),
      lastEntryAt: this.lastEntryAt.get(book.tokenId) ?? null,
    });
    this.decisions.set(book.tokenId, intent);
    this.updatePortfolio();

    if (!isActionable(intent)) {
      return;
    }

    const side = actionToSide(intent.action);
    if (side === null) {
      return;
    }

    // A resting quote already represents this decision. Re-persisting the same
    // duplicate-order rejection every tick would flood the audit log and UI.
    if (this.broker.hasOpenOrder(book.tokenId, side)) {
      return;
    }

    this.signalsGenerated += 1;

    const riskDecision = this.riskController.evaluate({
      now: this.now(),
      portfolio: this.portfolioSnapshot,
      book,
      intent,
      hasOpenOrder: this.broker.hasOpenOrder(book.tokenId, side),
    });
    this.lastRiskDecision = riskDecision;

    if (!allowTrading) {
      return;
    }

    if (this.status !== 'running' || this.riskController.killSwitch) {
      this.persistSignal(intent, false, [
        this.riskController.killSwitch
          ? 'risk: kill switch is active'
          : `engine status: ${this.status}`,
      ]);
      return;
    }

    if (!riskDecision.allowed) {
      this.riskRejections += 1;
      this.persistSignal(intent, false, riskDecision.reasons);
      return;
    }

    const result = this.broker.place(
      {
        marketId: intent.marketId,
        tokenId: intent.tokenId,
        outcome: intent.outcome,
        side,
        type: intent.action === 'PLACE_BID' || intent.action === 'PLACE_ASK' ? 'limit' : 'market',
        limitPrice:
          intent.action === 'PLACE_BID' || intent.action === 'PLACE_ASK' ? intent.price : null,
        size: intent.size,
        reason: intent.reasons.join('; '),
      },
      book,
    );

    if (result.order.status === 'rejected') {
      this.orderRejections += 1;
      this.persistSignal(intent, false, [
        `order rejected: ${result.order.rejectionReason ?? 'unknown reason'}`,
      ]);
      return;
    }

    this.ordersPlaced += 1;
    this.riskController.recordOrder(this.now());
    if (intent.action === 'PLACE_BID' || intent.action === 'TAKE_BUY') {
      this.lastEntryAt.set(intent.tokenId, this.now());
    }
    this.persistSignal(intent, true, []);
    for (const trade of result.fills) {
      this.persistTrade(trade);
    }
    if (result.fills.length > 0) {
      this.logger.info(
        {
          marketId: intent.marketId,
          tokenId: intent.tokenId,
          action: intent.action,
          fills: result.fills.length,
        },
        'paper order filled',
      );
    }
    this.updatePortfolio();
  }

  public health(): EngineHealth {
    const now = this.now();
    const provider = this.config.demoMode
      ? {
          name: 'demo-generator',
          connected: this.status === 'running' || this.status === 'killed',
          lastMessageAt: this.lastBookAt,
          reconnectCount: 0,
          error: null,
        }
      : {
          name: 'polymarket-market-stream',
          connected: this.stream?.isConnected ?? false,
          lastMessageAt: this.stream?.lastMessage ?? null,
          reconnectCount: this.stream?.reconnectCount ?? this.streamStatus.reconnectCount,
          error: this.stream?.lastError ?? this.streamStatus.error ?? this.scanError,
        };

    return {
      status: this.status,
      mode: this.config.tradingMode,
      liveAuthorized: this.config.liveAuthorized,
      liveAllowed: false,
      liveBlockReason: this.liveBlockReason(),
      startedAt: this.startedAt,
      uptimeMs: this.startedAt === null ? 0 : Math.max(0, now - this.startedAt),
      markets: this.markets.size,
      subscriptions: this.subscriptions.length,
      books: this.books.size,
      lastBookAt: this.lastBookAt,
      provider,
      geoblock: {
        status: this.geoblockResult.status,
        blocked: this.geoblockResult.blocked,
        country: this.geoblockResult.country,
        region: this.geoblockResult.region,
        checkedAt: this.geoblockResult.checkedAt,
        reason: this.geoblockResult.reason,
      },
      killReason: this.killReason,
    };
  }

  public portfolio(): PortfolioSnapshot {
    this.updatePortfolio();
    return this.portfolioSnapshot;
  }

  public risk(): RiskState {
    this.updatePortfolio();
    const snapshot = this.riskController.snapshot(
      this.portfolioSnapshot,
      this.riskController.ordersLastMinute(this.now()),
    );
    return {
      ...snapshot,
      checks: this.lastRiskDecision?.checks ?? [],
    };
  }

  public trades(limit = 100, sessionId?: string): readonly Trade[] {
    return this.db.listTrades(Math.max(1, Math.min(limit, 500)), sessionId);
  }

  public signals(limit = 50, sessionId?: string): readonly Signal[] {
    return this.db.listSignals(Math.max(1, Math.min(limit, 200)), sessionId);
  }

  public sessions(limit = 20): readonly PaperSession[] {
    return this.db.listRuns(Math.max(1, Math.min(limit, 100)));
  }

  public state(): StateResponse {
    this.updatePortfolio();
    const now = this.now();
    const sessionId = this.session?.id;
    const markets: MarketView[] = [...this.markets.values()]
      .map((market) => {
        const book = this.books.get(market.yesTokenId) ?? null;
        const top = book === null ? null : topOfBook(book);
        return {
          market,
          book: top,
          decision: this.decisions.get(market.yesTokenId) ?? null,
          position: this.broker.positionForToken(market.yesTokenId),
          score: scoreMarket(market, top),
          bookAgeMs: book === null ? null : Math.max(0, now - book.timestamp),
        };
      })
      .sort((left, right) => right.score - left.score);

    const portfolio = this.portfolioSnapshot;
    const riskSnapshot = this.riskController.snapshot(
      portfolio,
      this.riskController.ordersLastMinute(now),
    );
    const risk: RiskState = {
      ...riskSnapshot,
      checks: this.lastRiskDecision?.checks ?? [],
    };

    return {
      health: this.health(),
      session: this.session,
      sessions: this.sessions(20),
      markets,
      portfolio,
      trades: sessionId === undefined ? [] : this.trades(100, sessionId),
      signals: sessionId === undefined ? [] : this.signals(50, sessionId),
      risk,
      config: this.publicConfig(),
      equityCurve:
        sessionId === undefined
          ? []
          : this.db
              .listPortfolioSnapshots(120, sessionId)
              .reverse()
              .map((snapshot) => ({
                at: snapshot.updatedAt,
                equity: snapshot.equity,
                exposure: snapshot.exposure,
              })),
    };
  }

  public marketDetail(tokenId: string): MarketDetail | null {
    const market = [...this.markets.values()].find(
      (candidate) => candidate.yesTokenId === tokenId || candidate.noTokenId === tokenId,
    );
    if (market === undefined) {
      return null;
    }
    const book = this.books.get(tokenId) ?? null;
    return {
      market,
      book,
      decision: this.decisions.get(tokenId) ?? null,
      position: this.broker.positionForToken(tokenId),
      score: scoreMarket(market, book === null ? null : topOfBook(book)),
    };
  }

  public subscribe(listener: (state: StateResponse) => void): () => void {
    this.stateListeners.add(listener);
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  public metrics(): string {
    const now = this.now();
    const health = this.health();
    const lines = [
      '# HELP polyhunter_up Whether the PolyHunter process is serving.',
      '# TYPE polyhunter_up gauge',
      'polyhunter_up 1',
      '# HELP polyhunter_status Engine status.',
      '# TYPE polyhunter_status gauge',
      `polyhunter_status{status="${health.status}"} 1`,
      '# HELP polyhunter_books_ingested_total Order book updates ingested.',
      '# TYPE polyhunter_books_ingested_total counter',
      `polyhunter_books_ingested_total ${this.booksIngested}`,
      '# HELP polyhunter_signals_total Actionable strategy signals.',
      '# TYPE polyhunter_signals_total counter',
      `polyhunter_signals_total ${this.signalsGenerated}`,
      '# HELP polyhunter_orders_total Paper orders accepted.',
      '# TYPE polyhunter_orders_total counter',
      `polyhunter_orders_total ${this.ordersPlaced}`,
      '# HELP polyhunter_risk_rejections_total Orders blocked by risk.',
      '# TYPE polyhunter_risk_rejections_total counter',
      `polyhunter_risk_rejections_total ${this.riskRejections}`,
      '# HELP polyhunter_order_rejections_total Orders rejected by the broker.',
      '# TYPE polyhunter_order_rejections_total counter',
      `polyhunter_order_rejections_total ${this.orderRejections}`,
      '# HELP polyhunter_equity_usd Paper equity.',
      '# TYPE polyhunter_equity_usd gauge',
      `polyhunter_equity_usd ${this.portfolioSnapshot.equity}`,
      '# HELP polyhunter_exposure_usd Paper exposure.',
      '# TYPE polyhunter_exposure_usd gauge',
      `polyhunter_exposure_usd ${this.portfolioSnapshot.exposure}`,
      '# HELP polyhunter_positions Open paper positions.',
      '# TYPE polyhunter_positions gauge',
      `polyhunter_positions ${this.portfolioSnapshot.positions.length}`,
      '# HELP polyhunter_provider_connected Market stream connection.',
      '# TYPE polyhunter_provider_connected gauge',
      `polyhunter_provider_connected ${health.provider.connected ? 1 : 0}`,
      '# HELP polyhunter_last_book_age_ms Age of the last book update.',
      '# TYPE polyhunter_last_book_age_ms gauge',
      `polyhunter_last_book_age_ms ${this.lastBookAt === null ? -1 : Math.max(0, now - this.lastBookAt)}`,
      '',
    ];
    return lines.join('\n');
  }

  private liveBlockReason(): string {
    if (this.geoblockResult.status === 'BLOCKED') {
      return `venue geoblock blocked ${this.geoblockResult.country ?? 'this jurisdiction'}`;
    }
    if (this.config.tradingMode !== 'live') {
      return 'paper mode; live execution is intentionally disabled';
    }
    if (!this.config.liveAuthorized) {
      return 'live trading is not authorized';
    }
    return 'live execution adapter is not implemented';
  }

  private publicConfig(): PublicConfig {
    return {
      strategy: this.config.strategy,
      startingCash: this.config.startingCash,
      feeBps: this.config.feeBps,
      maxMarkets: this.config.maxMarkets,
      demoMode: this.config.demoMode,
      strategyConfig: this.config.strategyConfig,
      riskLimits: this.config.riskLimits,
    };
  }

  private async refreshMarkets(): Promise<void> {
    if (this.config.demoMode) {
      return;
    }
    const now = this.now();
    const markets = await this.gamma.listMarkets({
      maxMarkets: this.config.maxMarkets,
      minLiquidity: this.config.minLiquidity,
      now,
    });
    if (markets.length === 0 && this.markets.size > 0) {
      this.scanError = 'scanner returned no markets; keeping the previous subscription set';
      return;
    }

    const nextMarkets = new Map<string, Market>();
    const nextTokens = new Map<string, TokenMetadata>();
    for (const market of markets) {
      nextMarkets.set(market.id, market);
      nextTokens.set(market.yesTokenId, {
        marketId: market.id,
        tokenId: market.yesTokenId,
        outcome: 'YES',
        tickSize: market.tickSize,
      });
      this.db.upsertMarket(market, now);
    }

    for (const tokenId of this.books.keys()) {
      if (!nextTokens.has(tokenId)) {
        this.books.delete(tokenId);
        this.decisions.delete(tokenId);
      }
    }

    this.markets = nextMarkets;
    this.tokens = nextTokens;
    this.subscriptions = [...nextTokens.values()];

    this.scanError = null;

    const results = await this.clob.getBooks(this.subscriptions);
    for (const result of results) {
      if (result.book !== null) {
        this.ingestBook(mapRawBook(result.book, result.token), false);
      }
    }

    if (this.stream === null) {
      this.stream = this.socketFactory({
        url: this.config.wsUrl,
        tokens: this.subscriptions,
        onBook: (book) => {
          this.ingestBook(book, true);
        },
        onEvent: (event) => {
          this.handleMarketEvent(event);
        },
        onStatus: (status) => {
          this.streamStatus = status;
        },
        now: this.now,
        reconnectMaxMs: this.config.streamReconnectMaxMs,
      });
      this.stream.connect();
    } else {
      this.stream.updateTokens(this.subscriptions);
    }

    if (this.config.recordBooks && this.recorder === null) {
      this.recorder = this.recorderFactory(this.config.recordDir, now);
    }
  }

  private setupDemo(): void {
    const now = this.now();
    const endDate = new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString();
    const demo: Market[] = [
      {
        id: 'demo-fed',
        conditionId: 'demo-condition-fed',
        slug: 'demo-fed-cut',
        question: 'Will the Fed cut rates at the next meeting?',
        endDate,
        liquidity: 250_000,
        volume24h: 150_000,
        yesTokenId: 'demo-yes-fed',
        noTokenId: 'demo-no-fed',
        tickSize: 0.01,
        negRisk: false,
        active: true,
        closed: false,
        acceptingOrders: true,
        feesEnabled: false,
        feeSchedule: null,
      },
      {
        id: 'demo-final',
        conditionId: 'demo-condition-final',
        slug: 'demo-final-winner',
        question: 'Will the home team win the final?',
        endDate,
        liquidity: 180_000,
        volume24h: 95_000,
        yesTokenId: 'demo-yes-final',
        noTokenId: 'demo-no-final',
        tickSize: 0.01,
        negRisk: false,
        active: true,
        closed: false,
        acceptingOrders: true,
        feesEnabled: false,
        feeSchedule: null,
      },
      {
        id: 'demo-btc',
        conditionId: 'demo-condition-btc',
        slug: 'demo-btc-close',
        question: 'Will BTC close above $100k this month?',
        endDate,
        liquidity: 320_000,
        volume24h: 210_000,
        yesTokenId: 'demo-yes-btc',
        noTokenId: 'demo-no-btc',
        tickSize: 0.01,
        negRisk: false,
        active: true,
        closed: false,
        acceptingOrders: true,
        feesEnabled: false,
        feeSchedule: null,
      },
    ];

    this.markets.clear();
    this.tokens.clear();
    this.books.clear();
    this.decisions.clear();
    this.subscriptions = [];

    const starts = [0.48, 0.61, 0.53];
    demo.forEach((market, index) => {
      this.markets.set(market.id, market);
      const token: TokenMetadata = {
        marketId: market.id,
        tokenId: market.yesTokenId,
        outcome: 'YES',
        tickSize: market.tickSize,
      };
      this.tokens.set(token.tokenId, token);
      this.subscriptions.push(token);
      this.db.upsertMarket(market, now);
      const book = generateSyntheticBooks({
        count: 1,
        seed: 100 + index,
        startPrice: starts[index] ?? 0.5,
        trend: 0,
        volatility: 0.001,
        spread: 0.02,
        startAt: now,
        tokenId: token.tokenId,
        marketId: market.id,
        outcome: 'YES',
      })[0];
      if (book !== undefined) {
        this.ingestBook(book, false);
      }
    });
    this.demoStep = 0;
    this.lastBookAt = now;
  }

  private demoTick(): void {
    const now = this.now();
    this.subscriptions.forEach((token, index) => {
      const current = this.books.get(token.tokenId);
      const startPrice = current === undefined ? 0.5 : (midPrice(current) ?? 0.5);
      const trend = index % 2 === 0 ? 0.0009 : -0.0009;
      const book = generateSyntheticBooks({
        count: 1,
        seed: this.demoStep * 31 + index + 1,
        startPrice,
        trend,
        volatility: 0.0015,
        spread: 0.02,
        startAt: now,
        tokenId: token.tokenId,
        marketId: token.marketId,
        outcome: 'YES',
      })[0];
      if (book !== undefined) {
        this.ingestBook(book, true);
      }
    });
    this.demoStep += 1;
  }

  private handleMarketEvent(event: MarketEvent): void {
    if (event.type === 'market_resolved') {
      const market = [...this.markets.values()].find(
        (candidate) => candidate.conditionId === event.conditionId,
      );
      if (market === undefined) {
        return;
      }
      const winningToken =
        event.winningAssetId ??
        (event.winningOutcome?.toLowerCase() === 'yes' ? market.yesTokenId : market.noTokenId);
      const trades = this.broker.settle(market.id, winningToken);
      for (const trade of trades) {
        this.persistTrade(trade);
      }
      this.recordEvent('market_resolved', 'info', `market resolved: ${market.question}`, {
        marketId: market.id,
        winningToken,
        settlements: trades.length,
      });
      this.updatePortfolio();
      this.emitState();
      return;
    }

    if (event.type === 'tick_size_change') {
      const token = this.tokens.get(event.tokenId);
      if (token !== undefined) {
        this.tokens.set(token.tokenId, { ...token, tickSize: event.newTickSize });
        const market = this.markets.get(token.marketId);
        if (market !== undefined) {
          this.markets.set(market.id, { ...market, tickSize: event.newTickSize });
        }
      }
      this.recordEvent('tick_size_change', 'info', 'market tick size changed', {
        tokenId: event.tokenId,
        oldTickSize: event.oldTickSize,
        newTickSize: event.newTickSize,
      });
    }
  }

  private startTimers(): void {
    this.stopTimers();
    this.scanTimer = setInterval(() => {
      void this.rescan();
    }, this.config.scanIntervalMs);
    this.markTimer = setInterval(() => {
      this.tick();
    }, 1000);
    if (this.config.demoMode) {
      this.demoTimer = setInterval(() => {
        this.demoTick();
      }, 1000);
    }
  }

  private stopTimers(): void {
    if (this.scanTimer !== null) {
      clearInterval(this.scanTimer);
      this.scanTimer = null;
    }
    if (this.markTimer !== null) {
      clearInterval(this.markTimer);
      this.markTimer = null;
    }
    if (this.demoTimer !== null) {
      clearInterval(this.demoTimer);
      this.demoTimer = null;
    }
  }

  private async rescan(): Promise<void> {
    if (this.config.demoMode || this.status !== 'running') {
      return;
    }
    try {
      await this.refreshMarkets();
    } catch (error) {
      this.scanError = error instanceof Error ? error.message : String(error);
      this.recordEvent('scanner_refresh_failed', 'warn', this.scanError, null);
    }
  }

  private tick(): void {
    const now = this.now();
    this.updatePortfolio();
    for (const order of this.broker.openOrders) {
      if (now - order.createdAt > this.config.orderTtlMs) {
        this.broker.cancel(order.id, 'time-to-live expired');
      }
    }
    if (now - this.lastSnapshotAt >= 5000) {
      this.db.insertPortfolioSnapshot(this.portfolioSnapshot, this.session?.id ?? 'legacy');
      this.lastSnapshotAt = now;
    }
    if (!this.config.demoMode && this.stream !== null) {
      this.streamStatus = {
        connected: this.stream.isConnected,
        lastMessageAt: this.stream.lastMessage,
        reconnectCount: this.stream.reconnectCount,
        error: this.stream.lastError,
      };
    }
    this.emitState();
  }

  private updatePortfolio(): void {
    const marks = new Map<string, number>();
    for (const [tokenId, book] of this.books) {
      const mid = midPrice(book);
      if (mid !== null) {
        marks.set(tokenId, mid);
      }
    }
    this.portfolioSnapshot = this.broker.mark(marks);
    this.riskController.observeEquity(
      this.portfolioSnapshot.equity,
      this.portfolioSnapshot.totalPnl,
    );
  }

  private persistSignal(
    intent: StrategyIntent,
    accepted: boolean,
    extraReasons: readonly string[],
  ): void {
    const signal: Signal = {
      id: this.idFactory('sig'),
      at: this.now(),
      marketId: intent.marketId,
      tokenId: intent.tokenId,
      outcome: intent.outcome,
      action: intent.action,
      fairValue: intent.fairValue,
      marketPrice: intent.price,
      edge: intent.edge,
      confidence: intent.confidence,
      accepted,
      reasons: accepted ? intent.reasons : [...intent.reasons, ...extraReasons],
    };
    try {
      this.db.insertSignal(signal, this.session?.id ?? 'legacy');
    } catch (error) {
      this.logger.warn({ err: error }, 'failed to persist signal');
    }
  }

  private persistTrade(trade: Trade): void {
    try {
      this.db.insertTrade(trade, this.session?.id ?? 'legacy');
    } catch (error) {
      this.logger.warn({ err: error, tradeId: trade.id }, 'failed to persist trade');
    }
  }

  private endSession(status: PaperSession['status'], reason: string): void {
    if (this.session === null) {
      return;
    }
    const now = this.now();
    const next: PaperSession = {
      ...this.session,
      status,
      endedAt: now,
      endingEquity: this.portfolioSnapshot.equity,
      stopReason: reason,
    };
    this.session = next;
    this.db.updateRun(next.id, {
      status: next.status,
      endedAt: next.endedAt,
      endingEquity: next.endingEquity,
      stopReason: next.stopReason,
    });
  }

  private recordEvent(
    kind: string,
    severity: 'info' | 'warn' | 'error',
    message: string,
    details: Record<string, unknown> | null,
  ): void {
    const detailsText = details === null ? null : JSON.stringify(details);
    try {
      this.db.insertEvent({ at: this.now(), kind, severity, message, details: detailsText });
    } catch (error) {
      this.logger.warn({ err: error }, 'failed to persist event');
    }
    if (severity === 'error') {
      this.logger.error({ kind, details: detailsText }, message);
    } else if (severity === 'warn') {
      this.logger.warn({ kind, details: detailsText }, message);
    } else {
      this.logger.info({ kind, details: detailsText }, message);
    }
  }

  private emitState(): void {
    let state: StateResponse;
    try {
      state = this.state();
    } catch (error) {
      this.logger.warn({ err: error }, 'failed to build state snapshot');
      return;
    }
    for (const listener of this.stateListeners) {
      try {
        listener(state);
      } catch (error) {
        this.logger.warn({ err: error }, 'state listener failed');
      }
    }
  }
}
