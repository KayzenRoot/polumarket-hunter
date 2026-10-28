import { makeBook, makePosition } from '@polyhunter/testkit';
import { describe, expect, it } from 'vitest';
import {
  createStrategy,
  DEFAULT_STRATEGY_CONFIG,
  MakerScalperStrategy,
  MicroMakerStrategy,
  MomentumTakerStrategy,
  type StrategyConfig,
} from '../src/index.js';

const config: StrategyConfig = {
  ...DEFAULT_STRATEGY_CONFIG,
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
};

function imbalancedBook(): ReturnType<typeof makeBook> {
  return makeBook({
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

describe('micro maker strategy', () => {
  it('quotes a bid when microprice edge, imbalance and depth agree', () => {
    const strategy = new MicroMakerStrategy(config);
    const intent = strategy.evaluate(imbalancedBook(), {
      now: 1_000_000,
      position: null,
      lastEntryAt: null,
    });

    expect(intent.action).toBe('PLACE_BID');
    expect(intent.price).toBe(0.48);
    expect(intent.edge).toBeCloseTo(0.015, 4);
    expect(intent.size).toBeGreaterThan(0);
    expect(intent.confidence).toBeGreaterThan(0);
  });

  it('uses a 0.001 market tick for an improved bid', () => {
    const strategy = new MicroMakerStrategy({ ...config, minEdge: 0.0001, minDepthShares: 10 });
    const intent = strategy.evaluate(
      makeBook({
        tickSize: 0.001,
        bids: [{ price: 0.48, size: 300 }],
        asks: [{ price: 0.482, size: 100 }],
      }),
      { now: 1_000_000, position: null, lastEntryAt: null },
    );

    expect(intent.action).toBe('PLACE_BID');
    expect(intent.price).toBe(0.481);
  });

  it('uses a 0.01 market tick for an improved bid', () => {
    const strategy = new MicroMakerStrategy({ ...config, minEdge: 0.0001, minDepthShares: 10 });
    const intent = strategy.evaluate(
      makeBook({
        tickSize: 0.01,
        bids: [{ price: 0.48, size: 300 }],
        asks: [{ price: 0.5, size: 100 }],
      }),
      { now: 1_000_000, position: null, lastEntryAt: null },
    );

    expect(intent.action).toBe('PLACE_BID');
    expect(intent.price).toBe(0.49);
  });

  it('rejects a wide spread', () => {
    const strategy = new MicroMakerStrategy(config);
    const intent = strategy.evaluate(
      makeBook({
        bids: [{ price: 0.4, size: 500 }],
        asks: [{ price: 0.6, size: 500 }],
      }),
      { now: 1_000_000, position: null, lastEntryAt: null },
    );

    expect(intent.action).toBe('HOLD');
    expect(intent.reasons.join(' ')).toContain('spread');
  });

  it('rejects negative order-book imbalance', () => {
    const strategy = new MicroMakerStrategy({ ...config, minEdge: 0.001 });
    const intent = strategy.evaluate(
      makeBook({
        bids: [{ price: 0.48, size: 100 }],
        asks: [{ price: 0.5, size: 400 }],
      }),
      { now: 1_000_000, position: null, lastEntryAt: null },
    );

    expect(intent.action).toBe('HOLD');
    expect(intent.reasons.join(' ')).toContain('imbalance');
  });

  it('rejects stale books', () => {
    const strategy = new MicroMakerStrategy(config);
    const intent = strategy.evaluate(imbalancedBook(), {
      now: 2_000_000,
      position: null,
      lastEntryAt: null,
    });

    expect(intent.action).toBe('HOLD');
    expect(intent.reasons.join(' ')).toContain('stale');
  });

  it('honours the cooldown window', () => {
    const strategy = new MicroMakerStrategy(config);
    const intent = strategy.evaluate(imbalancedBook(), {
      now: 1_000_000,
      position: null,
      lastEntryAt: 999_000,
    });

    expect(intent.action).toBe('HOLD');
    expect(intent.reasons.join(' ')).toContain('cooldown');
  });

  it('takes profit when the bid clears the take-profit threshold', () => {
    const strategy = new MicroMakerStrategy(config);
    const position = makePosition({ avgPrice: 0.5, shares: 20 });
    const intent = strategy.evaluate(
      makeBook({
        bids: [{ price: 0.52, size: 300 }],
        asks: [{ price: 0.54, size: 300 }],
      }),
      { now: 1_000_000, position, lastEntryAt: null },
    );

    expect(intent.action).toBe('TAKE_SELL');
    expect(intent.price).toBe(0.52);
    expect(intent.size).toBe(20);
  });

  it('stops out when the bid breaches the stop threshold', () => {
    const strategy = new MicroMakerStrategy(config);
    const position = makePosition({ avgPrice: 0.5, shares: 20 });
    const intent = strategy.evaluate(
      makeBook({
        bids: [{ price: 0.48, size: 300 }],
        asks: [{ price: 0.5, size: 300 }],
      }),
      { now: 1_000_000, position, lastEntryAt: null },
    );

    expect(intent.action).toBe('TAKE_SELL');
    expect(intent.reasons.join(' ')).toContain('stop loss');
  });

  it('holds an open position when no exit condition is met', () => {
    const strategy = new MicroMakerStrategy(config);
    const position = makePosition({ avgPrice: 0.5, shares: 20 });
    const intent = strategy.evaluate(
      makeBook({
        bids: [{ price: 0.5, size: 300 }],
        asks: [{ price: 0.52, size: 300 }],
      }),
      { now: 1_000_000, position, lastEntryAt: null },
    );

    expect(intent.action).toBe('HOLD');
    expect(intent.reasons.join(' ')).toContain('position open');
  });
});

describe('maker scalper strategy', () => {
  it('quotes a maker bid when the entry checks agree', () => {
    const strategy = new MakerScalperStrategy(config);
    const intent = strategy.evaluate(imbalancedBook(), {
      now: 1_000_000,
      position: null,
      lastEntryAt: null,
    });

    expect(intent.action).toBe('PLACE_BID');
    expect(intent.price).toBe(0.48);
  });

  it('places a maker ask at the fee-aware profit target', () => {
    const strategy = new MakerScalperStrategy({ ...config, takeProfitEdge: 0.012 });
    const position = makePosition({ avgPrice: 0.5, shares: 20 });
    const intent = strategy.evaluate(
      makeBook({
        bids: [{ price: 0.49, size: 300 }],
        asks: [{ price: 0.52, size: 300 }],
      }),
      { now: 1_000_000, position, lastEntryAt: null, hasOpenOrder: false },
    );

    expect(intent.action).toBe('PLACE_ASK');
    expect(intent.price).toBe(0.52);
    expect(intent.size).toBe(20);
    expect(intent.reasons.join(' ')).toContain('maker take-profit');
  });

  it('waits while a maker exit is resting', () => {
    const strategy = new MakerScalperStrategy(config);
    const position = makePosition({ avgPrice: 0.5, shares: 20 });
    const intent = strategy.evaluate(
      makeBook({
        bids: [{ price: 0.49, size: 300 }],
        asks: [{ price: 0.52, size: 300 }],
      }),
      { now: 1_000_000, position, lastEntryAt: null, hasOpenOrder: true },
    );

    expect(intent.action).toBe('HOLD');
    expect(intent.reasons.join(' ')).toContain('exit resting');
  });

  it('uses a taker stop as the safety valve', () => {
    const strategy = new MakerScalperStrategy(config);
    const position = makePosition({ avgPrice: 0.5, shares: 20 });
    const intent = strategy.evaluate(
      makeBook({
        bids: [{ price: 0.48, size: 300 }],
        asks: [{ price: 0.5, size: 300 }],
      }),
      { now: 1_000_000, position, lastEntryAt: null, hasOpenOrder: false },
    );

    expect(intent.action).toBe('TAKE_SELL');
    expect(intent.reasons.join(' ')).toContain('stop loss');
  });

  it('uses a taker exit when the maker edge decays', () => {
    const strategy = new MakerScalperStrategy({
      ...config,
      minEdge: 0.006,
      stopLossEdge: 0.05,
    });
    const position = makePosition({ avgPrice: 0.5, shares: 20 });
    const intent = strategy.evaluate(
      makeBook({
        bids: [{ price: 0.48, size: 300 }],
        asks: [{ price: 0.49, size: 300 }],
      }),
      { now: 1_000_000, position, lastEntryAt: null, hasOpenOrder: false },
    );

    expect(intent.action).toBe('TAKE_SELL');
    expect(intent.reasons.join(' ')).toContain('edge decayed');
  });

  it('waits while a maker entry is resting', () => {
    const strategy = new MakerScalperStrategy(config);
    const intent = strategy.evaluate(imbalancedBook(), {
      now: 1_000_000,
      position: null,
      lastEntryAt: null,
      hasOpenOrder: true,
    });

    expect(intent.action).toBe('HOLD');
    expect(intent.reasons.join(' ')).toContain('entry resting');
  });

  it('is created from the strategy kind', () => {
    expect(createStrategy('maker-scalper', config).kind).toBe('maker-scalper');
  });
});

describe('momentum taker strategy', () => {
  const momentumConfig: StrategyConfig = {
    ...config,
    minEdge: 0.001,
    minImbalance: 0.1,
    maxSpread: 0.05,
    minDepthShares: 10,
    cooldownMs: 0,
    takeProfitEdge: 0.05,
    stopLossEdge: 0.05,
    momentumHorizon: 6,
  };

  function trendBook(bid: number, ask: number): ReturnType<typeof makeBook> {
    return makeBook({
      timestamp: 1_000_000,
      bids: [
        { price: bid, size: 300 },
        { price: round(bid - 0.01), size: 200 },
      ],
      asks: [
        { price: ask, size: 100 },
        { price: round(ask + 0.01), size: 200 },
      ],
    });
  }

  function round(value: number): number {
    return Math.round(value * 100) / 100;
  }

  it('warms up before emitting a signal', () => {
    const strategy = new MomentumTakerStrategy(momentumConfig);
    const intent = strategy.evaluate(trendBook(0.49, 0.51), {
      now: 1_000_000,
      position: null,
      lastEntryAt: null,
    });

    expect(intent.action).toBe('HOLD');
    expect(intent.reasons.join(' ')).toContain('warming');
  });

  it('buys when the short-term forecast exceeds the ask', () => {
    const strategy = new MomentumTakerStrategy(momentumConfig);
    strategy.evaluate(trendBook(0.49, 0.51), {
      now: 1_000_000,
      position: null,
      lastEntryAt: null,
    });
    const intent = strategy.evaluate(trendBook(0.51, 0.53), {
      now: 1_000_000,
      position: null,
      lastEntryAt: null,
    });

    expect(intent.action).toBe('TAKE_BUY');
    expect(intent.price).toBe(0.53);
    expect(intent.edge).toBeGreaterThan(0);
  });

  it('resets its momentum state', () => {
    const strategy = new MomentumTakerStrategy(momentumConfig);
    strategy.evaluate(trendBook(0.49, 0.51), {
      now: 1_000_000,
      position: null,
      lastEntryAt: null,
    });
    strategy.reset();
    const intent = strategy.evaluate(trendBook(0.51, 0.53), {
      now: 1_000_000,
      position: null,
      lastEntryAt: null,
    });

    expect(intent.action).toBe('HOLD');
    expect(intent.reasons.join(' ')).toContain('warming');
  });
});
