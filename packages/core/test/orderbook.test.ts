import { makeBook } from '@polyhunter/testkit';
import { describe, expect, it } from 'vitest';
import {
  applyLevelChanges,
  bookAgeMs,
  depthShares,
  isBookUsable,
  midPrice,
  normalizeBook,
  orderBookImbalance,
  roundPrice,
  topOfBook,
  walkBook,
} from '../src/index.js';

describe('order book math', () => {
  it('sorts and aggregates levels, dropping invalid entries', () => {
    const book = normalizeBook(
      makeBook({
        bids: [
          { price: 0.47, size: 10 },
          { price: 0.48, size: 20 },
          { price: 0.48, size: 30 },
          { price: 1.2, size: 10 },
          { price: 0.4, size: -1 },
        ],
        asks: [
          { price: 0.51, size: 10 },
          { price: 0.5, size: 20 },
          { price: 0.5, size: 5 },
        ],
      }),
    );

    expect(book.bids).toEqual([
      { price: 0.48, size: 50 },
      { price: 0.47, size: 10 },
    ]);
    expect(book.asks).toEqual([
      { price: 0.5, size: 25 },
      { price: 0.51, size: 10 },
    ]);
  });

  it('computes top of book, mid, microprice, spread and imbalance', () => {
    const top = topOfBook(makeBook());
    expect(top).not.toBeNull();
    expect(top?.bid).toBe(0.48);
    expect(top?.ask).toBe(0.5);
    expect(top?.mid).toBe(0.49);
    expect(top?.spread).toBe(0.02);
    expect(top?.microprice).toBe(0.49);
    if (top === null) {
      throw new Error('expected a top of book');
    }
    expect(orderBookImbalance(top)).toBe(0);
  });

  it('weights microprice toward the thinner side', () => {
    const top = topOfBook(
      makeBook({
        bids: [{ price: 0.48, size: 300 }],
        asks: [{ price: 0.5, size: 100 }],
      }),
    );
    expect(top?.microprice).toBe(0.495);
    if (top === null) {
      throw new Error('expected a top of book');
    }
    expect(orderBookImbalance(top)).toBe(0.5);
  });

  it('returns null for an empty or one-sided book', () => {
    expect(topOfBook(makeBook({ bids: [] }))).toBeNull();
    expect(topOfBook(makeBook({ asks: [] }))).toBeNull();
    expect(midPrice(makeBook({ bids: [] }))).toBeNull();
  });

  it('walks asks with a price limit', () => {
    const book = makeBook();
    const withoutSlippage = walkBook(book.asks, 'BUY', 250, 0.5);
    expect(withoutSlippage.filled).toBe(200);
    expect(withoutSlippage.vwap).toBe(0.5);

    const withSlippage = walkBook(book.asks, 'BUY', 250, 0.51);
    expect(withSlippage.filled).toBe(250);
    expect(withSlippage.vwap).toBe(0.502);
    expect(roundPrice(withSlippage.notional)).toBe(125.5);
  });

  it('walks bids for a sell', () => {
    const book = makeBook();
    const result = walkBook(book.bids, 'SELL', 250, 0.47);
    expect(result.filled).toBe(250);
    expect(result.vwap).toBe(0.478);
  });

  it('returns an empty walk for invalid sizes', () => {
    expect(walkBook(makeBook().asks, 'BUY', 0, null)).toEqual({
      filled: 0,
      notional: 0,
      vwap: 0,
      levelsUsed: 0,
    });
  });

  it('applies incremental price changes and removes zero sizes', () => {
    const updated = applyLevelChanges(makeBook(), [
      { side: 'BUY', price: 0.48, size: 50 },
      { side: 'BUY', price: 0.47, size: 0 },
      { side: 'SELL', price: 0.5, size: 75 },
      { side: 'SELL', price: 0.52, size: 0 },
    ]);

    expect(updated.bids).toEqual([
      { price: 0.48, size: 50 },
      { price: 0.46, size: 400 },
    ]);
    expect(updated.asks).toEqual([
      { price: 0.5, size: 75 },
      { price: 0.51, size: 300 },
    ]);
  });

  it('computes depth across levels', () => {
    expect(depthShares(makeBook(), 'BUY', 2)).toBe(500);
    expect(depthShares(makeBook(), 'SELL', 3)).toBe(900);
  });

  it('rejects stale, crossed and untimestamped books', () => {
    const now = 1_010_000;
    expect(bookAgeMs(makeBook({ timestamp: 1_000_000 }), now)).toBe(10_000);
    expect(isBookUsable(makeBook({ timestamp: 1_000_000 }), 5_000, now).ok).toBe(false);
    expect(
      isBookUsable(
        makeBook({
          bids: [{ price: 0.52, size: 100 }],
          asks: [{ price: 0.5, size: 100 }],
        }),
        5_000,
        1_000_000,
      ).ok,
    ).toBe(false);
    expect(isBookUsable(makeBook({ timestamp: 0 }), 5_000, now).ok).toBe(false);
    expect(isBookUsable(makeBook(), 5_000, 1_000_000).ok).toBe(true);
  });
});
