import { makeBook } from '@polyhunter/testkit';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RISK_LIMITS,
  DEFAULT_STRATEGY_CONFIG,
  formatResearchMarkdown,
  type ResearchConfig,
  researchConfigJson,
  runResearch,
  type StrategyConfig,
  splitBooksByTime,
} from '../src/index.js';

const START = 1_000_000;
const STEP = 10_000;
const CONFIG: ResearchConfig = {
  strategy: 'micro-maker',
  strategyConfig: DEFAULT_STRATEGY_CONFIG,
  riskLimits: DEFAULT_RISK_LIMITS,
  startingCash: 1000,
  feeBps: 0,
  orderTtlMs: 15_000,
  trainRatio: 0.7,
};

function series(
  count: number,
  priceAt: (index: number) => { bid: number; ask: number },
): ReturnType<typeof makeBook>[] {
  return Array.from({ length: count }, (_, index) => {
    const price = priceAt(index);
    return makeBook({
      tokenId: 'yes-token',
      marketId: 'market-1',
      outcome: 'YES',
      timestamp: START + index * STEP,
      bids: [{ price: price.bid, size: 10_000 }],
      asks: [{ price: price.ask, size: 10_000 }],
    });
  });
}

function flatSeries(count: number): ReturnType<typeof makeBook>[] {
  return series(count, () => ({ bid: 0.48, ask: 0.5 }));
}

function risingSeries(count: number): ReturnType<typeof makeBook>[] {
  return series(count, (index) => ({
    bid: 0.48 + index * 0.01,
    ask: 0.5 + index * 0.01,
  }));
}

function fallingSeries(count: number): ReturnType<typeof makeBook>[] {
  return series(count, (index) => ({
    bid: 0.48 - index * 0.01,
    ask: 0.5 - index * 0.01,
  }));
}

function baseline(report: ReturnType<typeof runResearch>, name: 'no-trade' | 'passive-hold') {
  const found = report.baselines.find((candidate) => candidate.name === name);
  if (found === undefined) {
    throw new Error(`missing ${name} baseline`);
  }
  return found;
}

describe('research harness', () => {
  it('splits books by time without overlap', () => {
    const books = flatSeries(10);
    const { train, validation, split } = splitBooksByTime(books, 0.7);

    expect(split.boundaryAt).toBeGreaterThanOrEqual(split.trainEnd);
    expect(split.boundaryAt).toBeLessThanOrEqual(split.validationStart);
    expect(split.trainBooks).toBe(7);
    expect(split.validationBooks).toBe(3);
    expect(train).toHaveLength(7);
    expect(validation).toHaveLength(3);
    expect(train.at(-1)?.timestamp).toBe(START + 60_000);
    expect(validation[0]?.timestamp).toBe(START + 70_000);
    expect([...train, ...validation]).toHaveLength(books.length);
  });

  it('rejects empty, degenerate and invalid splits', () => {
    expect(() => splitBooksByTime([], 0.7)).toThrow(/empty recording/);
    expect(() => splitBooksByTime(flatSeries(1), 0.7)).toThrow(/no time span/);
    expect(() => splitBooksByTime(flatSeries(10), 0)).toThrow(/between 0 and 1/);
    expect(() => splitBooksByTime(flatSeries(10), 1)).toThrow(/between 0 and 1/);
  });

  it('is deterministic for the same books and config', () => {
    const books = risingSeries(10);
    const first = runResearch({ books, ...CONFIG, configHash: 'test-hash' });
    const second = runResearch({ books, ...CONFIG, configHash: 'test-hash' });
    expect(second).toEqual(first);
    expect(first.configHash).toBe('test-hash');
  });

  it('reports independent train and validation simulations', () => {
    const report = runResearch({ books: flatSeries(10), ...CONFIG, configHash: 'test-hash' });
    expect(report.train.startingCash).toBe(1000);
    expect(report.validation.startingCash).toBe(1000);
    expect(report.train.books).toBe(7);
    expect(report.validation.books).toBe(3);
    expect(report.train.endingEquity).toBe(1000);
    expect(report.validation.endingEquity).toBe(1000);
  });

  it('always reports a no-trade baseline at starting cash', () => {
    const report = runResearch({ books: risingSeries(10), ...CONFIG, configHash: 'test-hash' });
    const noTrade = baseline(report, 'no-trade');
    for (const metrics of [noTrade.train, noTrade.validation]) {
      expect(metrics.startingCash).toBe(1000);
      expect(metrics.endingEquity).toBe(1000);
      expect(metrics.totalPnl).toBe(0);
      expect(metrics.trades).toBe(0);
      expect(metrics.fees).toBe(0);
      expect(metrics.ordersPlaced).toBe(0);
    }
  });

  it('reports a passive-hold baseline that follows market direction', () => {
    const rising = runResearch({
      books: risingSeries(10),
      ...CONFIG,
      configHash: 'test-hash',
    });
    const risingPassive = baseline(rising, 'passive-hold');
    expect(risingPassive.train.fills).toBeGreaterThan(0);
    expect(risingPassive.train.totalPnl).toBeGreaterThan(0);
    expect(risingPassive.validation.totalPnl).toBeGreaterThan(0);

    const falling = runResearch({
      books: fallingSeries(10),
      ...CONFIG,
      configHash: 'test-hash',
    });
    const fallingPassive = baseline(falling, 'passive-hold');
    expect(fallingPassive.train.fills).toBeGreaterThan(0);
    expect(fallingPassive.train.totalPnl).toBeLessThan(0);
  });

  it('does not let fees flatter the passive baseline', () => {
    const books = flatSeries(10);
    const free = runResearch({ books, ...CONFIG, configHash: 'free' });
    const paid = runResearch({ books, ...CONFIG, feeBps: 100, configHash: 'paid' });
    expect(baseline(paid, 'passive-hold').train.fees).toBeGreaterThan(0);
    expect(baseline(paid, 'passive-hold').train.endingEquity).toBeLessThan(
      baseline(free, 'passive-hold').train.endingEquity,
    );
  });

  it('builds a stable config hash input in a fixed key order', () => {
    const reorderedStrategy: StrategyConfig = {
      momentumHorizon: DEFAULT_STRATEGY_CONFIG.momentumHorizon,
      tickSize: DEFAULT_STRATEGY_CONFIG.tickSize,
      orderNotional: DEFAULT_STRATEGY_CONFIG.orderNotional,
      stopLossEdge: DEFAULT_STRATEGY_CONFIG.stopLossEdge,
      takeProfitEdge: DEFAULT_STRATEGY_CONFIG.takeProfitEdge,
      cooldownMs: DEFAULT_STRATEGY_CONFIG.cooldownMs,
      maxBookAgeMs: DEFAULT_STRATEGY_CONFIG.maxBookAgeMs,
      minDepthShares: DEFAULT_STRATEGY_CONFIG.minDepthShares,
      maxSpread: DEFAULT_STRATEGY_CONFIG.maxSpread,
      minImbalance: DEFAULT_STRATEGY_CONFIG.minImbalance,
      minEdge: DEFAULT_STRATEGY_CONFIG.minEdge,
    };
    const reordered = {
      ...CONFIG,
      strategyConfig: reorderedStrategy,
      riskLimits: {
        minDepthShares: DEFAULT_RISK_LIMITS.minDepthShares,
        maxSpread: DEFAULT_RISK_LIMITS.maxSpread,
        maxBookAgeMs: DEFAULT_RISK_LIMITS.maxBookAgeMs,
        maxOrdersPerMinute: DEFAULT_RISK_LIMITS.maxOrdersPerMinute,
        maxDrawdownPct: DEFAULT_RISK_LIMITS.maxDrawdownPct,
        maxDailyLoss: DEFAULT_RISK_LIMITS.maxDailyLoss,
        maxOpenPositions: DEFAULT_RISK_LIMITS.maxOpenPositions,
        maxTotalNotional: DEFAULT_RISK_LIMITS.maxTotalNotional,
        maxNotionalPerMarket: DEFAULT_RISK_LIMITS.maxNotionalPerMarket,
      },
    };
    expect(researchConfigJson(reordered)).toBe(researchConfigJson(CONFIG));
    expect(researchConfigJson({ ...CONFIG, feeBps: 25 })).not.toBe(researchConfigJson(CONFIG));
  });

  it('formats a report with the held-out warning and baselines', () => {
    const report = runResearch({ books: flatSeries(10), ...CONFIG, configHash: 'test-hash' });
    const text = formatResearchMarkdown(report);
    expect(text).toContain('test-hash');
    expect(text).toContain('Validation is held out');
    expect(text).toContain('No-trade train');
    expect(text).toContain('Passive-hold validation');
    expect(text).toContain('Strategy validation');
  });
});
