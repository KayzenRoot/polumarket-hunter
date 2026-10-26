import { makeBook } from '@polyhunter/testkit';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  applyFill,
  type BookLevel,
  createPortfolio,
  markPortfolio,
  normalizeBook,
  topOfBook,
  walkBook,
} from '../src/index.js';

const priceArbitrary = fc.double({ min: 0.01, max: 0.99, noNaN: true, noDefaultInfinity: true });
const sizeArbitrary = fc.double({ min: 1, max: 1000, noNaN: true, noDefaultInfinity: true });

const levelArbitrary: fc.Arbitrary<BookLevel> = fc.record({
  price: priceArbitrary,
  size: sizeArbitrary,
});

describe('order book properties', () => {
  it('always returns sorted, valid, two-sided levels after normalization', () => {
    fc.assert(
      fc.property(fc.array(levelArbitrary, { maxLength: 30 }), (levels) => {
        const book = normalizeBook(makeBook({ bids: levels, asks: levels }));
        for (let index = 1; index < book.bids.length; index += 1) {
          const previous = book.bids[index - 1];
          const current = book.bids[index];
          if (previous !== undefined && current !== undefined) {
            expect(previous.price).toBeGreaterThan(current.price);
          }
        }
        for (let index = 1; index < book.asks.length; index += 1) {
          const previous = book.asks[index - 1];
          const current = book.asks[index];
          if (previous !== undefined && current !== undefined) {
            expect(previous.price).toBeLessThan(current.price);
          }
        }
        for (const level of [...book.bids, ...book.asks]) {
          expect(level.price).toBeGreaterThan(0);
          expect(level.price).toBeLessThan(1);
          expect(level.size).toBeGreaterThan(0);
        }
        const top = topOfBook(book);
        if (top !== null && !top.crossed) {
          expect(top.microprice).toBeGreaterThanOrEqual(top.bid);
          expect(top.microprice).toBeLessThanOrEqual(top.ask);
        }
      }),
      { numRuns: 60 },
    );
  });

  it('never fills more than requested and keeps VWAP inside the walked range', () => {
    fc.assert(
      fc.property(
        fc.array(levelArbitrary, { minLength: 1, maxLength: 20 }),
        fc.double({ min: 0.01, max: 500, noNaN: true, noDefaultInfinity: true }),
        (levels, requested) => {
          const asks = normalizeBook(makeBook({ asks: levels, bids: [] })).asks;
          const walk = walkBook(asks, 'BUY', requested, null);
          expect(walk.filled).toBeLessThanOrEqual(requested + 0.01);
          if (walk.filled > 0 && asks.length > 0) {
            const first = asks[0];
            const last = asks[asks.length - 1];
            if (first !== undefined && last !== undefined) {
              expect(walk.vwap).toBeGreaterThanOrEqual(first.price - 0.0001);
              expect(walk.vwap).toBeLessThanOrEqual(last.price + 0.0001);
            }
          }
        },
      ),
      { numRuns: 60 },
    );
  });
});

describe('portfolio properties', () => {
  it('preserves cash conservation and never goes negative on a valid buy', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 10, max: 10000, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0.01, max: 0.99, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 1, max: 100, noNaN: true, noDefaultInfinity: true }),
        (startingCash, price, requestedSize) => {
          const maxSize = Math.floor((startingCash / price) * 100) / 100;
          const size = Math.min(requestedSize, maxSize);
          if (size < 1) {
            return;
          }
          const state = createPortfolio(startingCash, 1_000_000);
          const result = applyFill(
            state,
            {
              marketId: 'market-1',
              tokenId: 'yes-token',
              outcome: 'YES',
              side: 'BUY',
              price,
              size,
              fee: 0,
            },
            1_000_000,
          );
          expect(result.state.cash).toBeGreaterThanOrEqual(0);
          const snapshot = markPortfolio(result.state, new Map([['yes-token', price]]), 1_000_000);
          expect(Math.abs(snapshot.equity - startingCash)).toBeLessThanOrEqual(0.02);
          expect(Math.abs(snapshot.totalPnl)).toBeLessThanOrEqual(0.02);
        },
      ),
      { numRuns: 40 },
    );
  });
});
