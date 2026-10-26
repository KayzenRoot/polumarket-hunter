import { clamp, roundPrice, roundSize, roundToTick } from './money.js';
import type { BookLevel, OrderBook, Outcome } from './types.js';

export interface SyntheticBookOptions {
  readonly count?: number;
  readonly seed?: number;
  readonly startPrice?: number;
  readonly tickSize?: number;
  readonly spread?: number;
  readonly volatility?: number;
  readonly trend?: number;
  readonly tokenId?: string;
  readonly marketId?: string;
  readonly outcome?: Outcome;
  readonly startAt?: number;
  readonly intervalMs?: number;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function makeLevels(
  center: number,
  tickSize: number,
  side: 'bid' | 'ask',
  random: () => number,
): BookLevel[] {
  const levels: BookLevel[] = [];
  for (let index = 0; index < 5; index += 1) {
    const offset = tickSize * index;
    const price =
      side === 'bid'
        ? roundToTick(Math.max(tickSize, center - offset), tickSize)
        : roundToTick(Math.min(1 - tickSize, center + offset), tickSize);
    const size = roundSize(40 + random() * 460);
    levels.push({ price, size });
  }
  return levels;
}

export function generateSyntheticBooks(options: SyntheticBookOptions = {}): OrderBook[] {
  const count = Math.max(1, Math.floor(options.count ?? 240));
  const seed = options.seed ?? 7;
  const tickSize = options.tickSize ?? 0.01;
  const spread = Math.max(tickSize * 2, options.spread ?? 0.02);
  const volatility = Math.max(0, options.volatility ?? 0.004);
  const trend = options.trend ?? 0;
  const tokenId = options.tokenId ?? 'synthetic-yes-token';
  const marketId = options.marketId ?? 'synthetic-market';
  const outcome = options.outcome ?? 'YES';
  const startAt = options.startAt ?? Date.now();
  const intervalMs = options.intervalMs ?? 1000;
  const random = mulberry32(seed);
  let price = clamp(options.startPrice ?? 0.52, 0.08, 0.92);

  const books: OrderBook[] = [];
  for (let index = 0; index < count; index += 1) {
    const shock = (random() - 0.5) * 2 * volatility;
    price = clamp(price + trend + shock, 0.06, 0.94);
    const halfSpread = spread / 2;
    const bid = roundToTick(Math.max(tickSize, price - halfSpread), tickSize);
    let ask = roundToTick(Math.min(1 - tickSize, price + halfSpread), tickSize);
    if (ask <= bid) {
      ask = roundToTick(Math.min(1 - tickSize, bid + tickSize), tickSize);
    }

    books.push({
      tokenId,
      marketId,
      outcome,
      timestamp: startAt + index * intervalMs,
      bids: makeLevels(bid, tickSize, 'bid', random),
      asks: makeLevels(ask, tickSize, 'ask', random),
      lastTradePrice: roundPrice(price),
      hash: `synthetic-${index}`,
    });
  }
  return books;
}

export function summarizeSyntheticBooks(books: readonly OrderBook[]): {
  count: number;
  first: number | null;
  last: number | null;
  min: number | null;
  max: number | null;
} {
  const mids = books
    .map((book) => {
      const bid = book.bids[0];
      const ask = book.asks[0];
      if (bid === undefined || ask === undefined) {
        return null;
      }
      return roundPrice((bid.price + ask.price) / 2);
    })
    .filter((value): value is number => value !== null);

  if (mids.length === 0) {
    return { count: books.length, first: null, last: null, min: null, max: null };
  }
  return {
    count: books.length,
    first: mids[0] ?? null,
    last: mids[mids.length - 1] ?? null,
    min: Math.min(...mids),
    max: Math.max(...mids),
  };
}

export function syntheticReturnPct(books: readonly OrderBook[]): number {
  const summary = summarizeSyntheticBooks(books);
  if (summary.first === null || summary.last === null || summary.first <= 0) {
    return 0;
  }
  return round((summary.last - summary.first) / summary.first, 6);
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
