import { describe, expect, it } from 'vitest';
import {
  createStrategy,
  DEFAULT_RISK_LIMITS,
  DEFAULT_STRATEGY_CONFIG,
  formatBacktestReport,
  generateSyntheticBooks,
  runBacktest,
  type Strategy,
  type StrategyConfig,
  topOfBook,
} from '../src/index.js';

function buyOnceStrategy(): Strategy {
  let bought = false;
  return {
    kind: 'micro-maker',
    evaluate: (book, context) => {
      const top = topOfBook(book);
      if (bought || top === null) {
        return {
          action: 'HOLD',
          tokenId: book.tokenId,
          marketId: book.marketId,
          outcome: book.outcome,
          price: 0,
          size: 0,
          fairValue: top?.mid ?? 0,
          edge: 0,
          confidence: 0,
          reasons: ['hold'],
          createdAt: context.now,
        };
      }
      bought = true;
      return {
        action: 'TAKE_BUY',
        tokenId: book.tokenId,
        marketId: book.marketId,
        outcome: book.outcome,
        price: top.ask,
        size: 10,
        fairValue: top.mid,
        edge: 0,
        confidence: 1,
        reasons: ['test taker buy'],
        createdAt: context.now,
      };
    },
    reset: () => {
      bought = false;
    },
  };
}

describe('backtest engine', () => {
  it('returns zeroed metrics for an empty recording', () => {
    const result = runBacktest({
      books: [],
      strategy: createStrategy('micro-maker', DEFAULT_STRATEGY_CONFIG),
      strategyConfig: DEFAULT_STRATEGY_CONFIG,
      riskLimits: DEFAULT_RISK_LIMITS,
      startingCash: 1000,
      feeBps: 0,
      orderTtlMs: 15000,
    });

    expect(result.metrics.books).toBe(0);
    expect(result.metrics.endingEquity).toBe(1000);
    expect(result.metrics.equityCurve).toEqual([]);
  });

  it('replays synthetic books and produces a complete metric set', () => {
    const books = generateSyntheticBooks({
      count: 180,
      seed: 11,
      startPrice: 0.5,
      trend: 0.0008,
      volatility: 0.0004,
      spread: 0.02,
      startAt: 1_000_000,
    });
    const strategyConfig: StrategyConfig = {
      ...DEFAULT_STRATEGY_CONFIG,
      minEdge: 0.0005,
      minImbalance: 0.05,
      maxSpread: 0.05,
      minDepthShares: 10,
      cooldownMs: 0,
      orderNotional: 10,
      takeProfitEdge: 0.01,
      stopLossEdge: 0.02,
      momentumHorizon: 8,
    };
    const result = runBacktest({
      books,
      strategy: createStrategy('momentum-taker', strategyConfig),
      strategyConfig,
      riskLimits: {
        ...DEFAULT_RISK_LIMITS,
        maxOrdersPerMinute: 1000,
        maxOpenPositions: 20,
        maxNotionalPerMarket: 200,
        maxTotalNotional: 500,
        maxDailyLoss: 500,
        maxDrawdownPct: 0.9,
      },
      startingCash: 1000,
      feeBps: 0,
      orderTtlMs: 15000,
    });

    expect(result.metrics.books).toBe(180);
    expect(result.metrics.equityCurve).toHaveLength(180);
    expect(result.metrics.tickSizes).toEqual([0.01]);
    expect(result.metrics.endingEquity).toBeGreaterThan(0);
    expect(result.metrics.signals).toBeGreaterThan(0);
    expect(result.metrics.ordersPlaced).toBeGreaterThan(0);
    expect(Number.isFinite(result.metrics.maxDrawdownPct)).toBe(true);
    expect(result.signals.every((signal) => signal.reasons.length > 0)).toBe(true);
  });

  it('applies a session fee schedule and records the assumption', () => {
    const books = generateSyntheticBooks({ count: 6, seed: 7, startAt: 1_000_000 });
    const scheduled = runBacktest({
      books,
      strategy: buyOnceStrategy(),
      strategyConfig: DEFAULT_STRATEGY_CONFIG,
      riskLimits: DEFAULT_RISK_LIMITS,
      startingCash: 1000,
      feeBps: 0,
      feeSchedule: { rate: 0.05, exponent: 1, takerOnly: true, rebateRate: 0 },
      orderTtlMs: 15_000,
    });
    expect(scheduled.feeAssumption).toContain('rate 0.05');
    expect(scheduled.metrics.fills).toBeGreaterThan(0);
    expect(scheduled.metrics.fees).toBeGreaterThan(0);

    const fallback = runBacktest({
      books,
      strategy: buyOnceStrategy(),
      strategyConfig: DEFAULT_STRATEGY_CONFIG,
      riskLimits: DEFAULT_RISK_LIMITS,
      startingCash: 1000,
      feeBps: 100,
      orderTtlMs: 15_000,
    });
    expect(fallback.feeAssumption).toContain('100 bps flat');
    expect(fallback.metrics.fees).toBeGreaterThan(0);
  });

  it('formats a human-readable report', () => {
    const books = generateSyntheticBooks({ count: 10, seed: 3, startAt: 1_000_000 });
    const result = runBacktest({
      books,
      strategy: createStrategy('micro-maker', DEFAULT_STRATEGY_CONFIG),
      strategyConfig: DEFAULT_STRATEGY_CONFIG,
      riskLimits: DEFAULT_RISK_LIMITS,
      startingCash: 500,
      feeBps: 0,
      orderTtlMs: 15000,
    });
    const report = formatBacktestReport(result);
    expect(report).toContain('PolyHunter backtest');
    expect(report).toContain('ending equity');
    expect(report).toContain('max drawdown');
  });
});
