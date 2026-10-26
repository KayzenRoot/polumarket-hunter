import type {
  ControlRequest,
  EngineHealth,
  MarketDetail,
  MarketView,
  PaperSession,
  PortfolioSnapshot,
  PublicConfig,
  RiskState,
  SessionReport,
  Signal,
  StateResponse,
  Trade,
} from '@polyhunter/core';
import { scoreMarket, topOfBook } from '@polyhunter/core';
import {
  makeBook,
  makeFeedHealth,
  makeMarket,
  makePortfolio,
  makeRiskLimits,
  makeSession,
  makeSessionReport,
  makeSignal,
  makeTrade,
} from '@polyhunter/testkit';
import type { EnginePort } from '../src/ports.js';

export function makeHealth(overrides: Partial<EngineHealth> = {}): EngineHealth {
  return {
    status: 'running',
    mode: 'paper',
    liveAuthorized: false,
    liveAllowed: false,
    liveBlockReason: 'paper mode; live execution is intentionally disabled',
    startedAt: 1_000_000,
    uptimeMs: 60_000,
    markets: 1,
    subscriptions: 1,
    books: 1,
    lastBookAt: 1_000_000,
    provider: {
      name: 'test-stream',
      connected: true,
      lastMessageAt: 1_000_000,
      reconnectCount: 0,
      error: null,
    },
    geoblock: {
      status: 'BLOCKED',
      blocked: true,
      country: 'BR',
      region: 'SP',
      checkedAt: 1_000_000,
      reason: 'blocked in BR',
    },
    killReason: null,
    ...overrides,
  };
}

export function makePublicConfig(overrides: Partial<PublicConfig> = {}): PublicConfig {
  return {
    strategy: 'micro-maker',
    startingCash: 1000,
    feeBps: 0,
    maxMarkets: 12,
    demoMode: true,
    strategyConfig: {
      minEdge: 0.006,
      minImbalance: 0.15,
      maxSpread: 0.035,
      minDepthShares: 100,
      maxBookAgeMs: 5000,
      cooldownMs: 2500,
      takeProfitEdge: 0.012,
      stopLossEdge: 0.015,
      orderNotional: 10,
      tickSize: 0.01,
      momentumHorizon: 6,
    },
    riskLimits: makeRiskLimits(),
    ...overrides,
  };
}

export function makeRiskState(overrides: Partial<RiskState> = {}): RiskState {
  return {
    killSwitch: false,
    dailyPnl: 0,
    peakEquity: 1000,
    drawdownPct: 0,
    exposure: 0,
    openPositions: 0,
    ordersLastMinute: 0,
    limits: makeRiskLimits(),
    checks: [],
    ...overrides,
  };
}

export function makeMarketView(overrides: Partial<MarketView> = {}): MarketView {
  const market = overrides.market ?? makeMarket();
  const book = overrides.book ?? topOfBook(makeBook());
  return {
    market,
    book,
    decision: null,
    position: null,
    score: scoreMarket(market, book),
    bookAgeMs: 120,
    ...overrides,
  };
}

export function makeState(overrides: Partial<StateResponse> = {}): StateResponse {
  return {
    health: makeHealth(),
    session: makeSession(),
    sessions: [makeSession()],
    feedHealth: makeFeedHealth(),
    markets: [makeMarketView()],
    portfolio: makePortfolio(),
    trades: [makeTrade()],
    signals: [makeSignal()],
    risk: makeRiskState(),
    config: makePublicConfig(),
    equityCurve: [
      { at: 1_000_000, equity: 1000, exposure: 0 },
      { at: 1_060_000, equity: 1001, exposure: 0 },
    ],
    ...overrides,
  };
}

export class FakeEngine implements EnginePort {
  public stateValue: StateResponse;
  public readonly controls: ControlRequest['action'][] = [];
  public readonly tradeSessionFilters: (string | undefined)[] = [];
  public readonly signalSessionFilters: (string | undefined)[] = [];
  public reportValue: SessionReport = makeSessionReport();
  public readonly reportRequests: string[] = [];
  public throwOnControl = false;
  public throwOnState = false;
  private readonly listeners = new Set<(state: StateResponse) => void>();

  public constructor(state: StateResponse = makeState()) {
    this.stateValue = state;
  }

  public health(): EngineHealth {
    return this.stateValue.health;
  }

  public state(): StateResponse {
    if (this.throwOnState) {
      throw new Error('state failure');
    }
    return this.stateValue;
  }

  public marketDetail(tokenId: string): MarketDetail | null {
    const view = this.stateValue.markets.find(
      (candidate) => candidate.market.yesTokenId === tokenId,
    );
    if (view === undefined) {
      return null;
    }
    return {
      market: view.market,
      book: makeBook({ tokenId, marketId: view.market.id }),
      decision: view.decision,
      position: view.position,
      score: view.score,
    };
  }

  public trades(limit: number, sessionId?: string): readonly Trade[] {
    this.tradeSessionFilters.push(sessionId);
    return this.stateValue.trades.slice(0, limit);
  }

  public signals(limit: number, sessionId?: string): readonly Signal[] {
    this.signalSessionFilters.push(sessionId);
    return this.stateValue.signals.slice(0, limit);
  }

  public sessions(limit: number): readonly PaperSession[] {
    return this.stateValue.sessions.slice(0, limit);
  }

  public sessionReport(id: string): SessionReport | null {
    this.reportRequests.push(id);
    return id === this.reportValue.session.id ? this.reportValue : null;
  }

  public portfolio(): PortfolioSnapshot {
    return this.stateValue.portfolio;
  }

  public risk(): RiskState {
    return this.stateValue.risk;
  }

  public async control(action: ControlRequest['action']): Promise<void> {
    if (this.throwOnControl) {
      throw new Error('control failure');
    }
    this.controls.push(action);
    if (action === 'kill') {
      this.stateValue = {
        ...this.stateValue,
        health: { ...this.stateValue.health, status: 'killed', killReason: 'test' },
        risk: { ...this.stateValue.risk, killSwitch: true },
      };
    }
    for (const listener of this.listeners) {
      listener(this.stateValue);
    }
  }

  public subscribe(listener: (state: StateResponse) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public metrics(): string {
    return '# HELP polyhunter_up test\npolyhunter_up 1\n';
  }
}
