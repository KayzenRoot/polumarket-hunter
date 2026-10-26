import { clamp, roundPrice, roundSize } from './money.js';
import type { BookLevel, OrderBook, Side, TopOfBook } from './types.js';

export interface BookUsability {
  readonly ok: boolean;
  readonly reasons: readonly string[];
}

export interface WalkResult {
  readonly filled: number;
  readonly notional: number;
  readonly vwap: number;
  readonly levelsUsed: number;
}

export interface LevelChange {
  readonly side: Side;
  readonly price: number;
  readonly size: number;
}

function toLevel(level: BookLevel): BookLevel | null {
  if (!Number.isFinite(level.price) || !Number.isFinite(level.size)) {
    return null;
  }
  if (level.price <= 0 || level.price >= 1 || level.size <= 0) {
    return null;
  }
  return { price: roundPrice(level.price), size: roundSize(level.size) };
}

function aggregate(levels: readonly BookLevel[], direction: 'asc' | 'desc'): BookLevel[] {
  const merged = new Map<number, number>();
  for (const raw of levels) {
    const level = toLevel(raw);
    if (level === null) {
      continue;
    }
    merged.set(level.price, roundSize((merged.get(level.price) ?? 0) + level.size));
  }

  const result = [...merged.entries()]
    .filter(([, size]) => size > 0)
    .map(([price, size]) => ({ price, size }));

  result.sort((left, right) =>
    direction === 'asc' ? left.price - right.price : right.price - left.price,
  );
  return result;
}

export function normalizeTickSize(value: number): number {
  if (!Number.isFinite(value) || value <= 0 || value >= 1) {
    return 0.01;
  }
  return roundPrice(value);
}

export function normalizeBook(book: OrderBook): OrderBook {
  return {
    tokenId: book.tokenId,
    marketId: book.marketId,
    outcome: book.outcome,
    tickSize: normalizeTickSize(book.tickSize),
    timestamp: book.timestamp,
    bids: aggregate(book.bids, 'desc'),
    asks: aggregate(book.asks, 'asc'),
    lastTradePrice:
      book.lastTradePrice !== null && Number.isFinite(book.lastTradePrice)
        ? roundPrice(clamp(book.lastTradePrice, 0, 1))
        : null,
    hash: book.hash,
  };
}

export function topOfBook(book: OrderBook): TopOfBook | null {
  const bid = book.bids[0];
  const ask = book.asks[0];
  if (bid === undefined || ask === undefined) {
    return null;
  }
  if (bid.price <= 0 || ask.price <= 0 || bid.price >= 1 || ask.price >= 1) {
    return null;
  }

  const mid = roundPrice((bid.price + ask.price) / 2);
  const totalSize = bid.size + ask.size;
  const microprice =
    totalSize > 0 ? roundPrice((ask.price * bid.size + bid.price * ask.size) / totalSize) : mid;

  return {
    bid: bid.price,
    ask: ask.price,
    bidSize: bid.size,
    askSize: ask.size,
    mid,
    microprice,
    spread: roundPrice(ask.price - bid.price),
    crossed: bid.price >= ask.price,
  };
}

export function orderBookImbalance(top: TopOfBook): number {
  const total = top.bidSize + top.askSize;
  if (total <= 0) {
    return 0;
  }
  return (top.bidSize - top.askSize) / total;
}

export function depthShares(book: OrderBook, side: Side, levels = 3): number {
  const source = side === 'BUY' ? book.asks : book.bids;
  let total = 0;
  for (let index = 0; index < Math.min(levels, source.length); index += 1) {
    const level = source[index];
    if (level !== undefined) {
      total += level.size;
    }
  }
  return roundSize(total);
}

export function walkBook(
  levels: readonly BookLevel[],
  side: Side,
  size: number,
  limitPrice: number | null,
): WalkResult {
  if (!Number.isFinite(size) || size <= 0) {
    return { filled: 0, notional: 0, vwap: 0, levelsUsed: 0 };
  }

  let remaining = size;
  let filled = 0;
  let notionalValue = 0;
  let levelsUsed = 0;

  for (const level of levels) {
    if (remaining <= 0) {
      break;
    }
    if (limitPrice !== null) {
      if (side === 'BUY' && level.price > limitPrice) {
        break;
      }
      if (side === 'SELL' && level.price < limitPrice) {
        break;
      }
    }

    const take = Math.min(remaining, level.size);
    if (take <= 0) {
      continue;
    }
    filled += take;
    notionalValue += take * level.price;
    remaining = roundSize(remaining - take);
    levelsUsed += 1;
  }

  return {
    filled: roundSize(filled),
    notional: roundPrice(notionalValue),
    vwap: filled > 0 ? roundPrice(notionalValue / filled) : 0,
    levelsUsed,
  };
}

export function applyLevelChanges(book: OrderBook, changes: readonly LevelChange[]): OrderBook {
  const bids = new Map(book.bids.map((level) => [level.price, level.size]));
  const asks = new Map(book.asks.map((level) => [level.price, level.size]));

  for (const change of changes) {
    if (!Number.isFinite(change.price) || change.price <= 0 || change.price >= 1) {
      continue;
    }
    const target = change.side === 'BUY' ? bids : asks;
    const price = roundPrice(change.price);
    const size = roundSize(change.size);
    if (size <= 0) {
      target.delete(price);
    } else {
      target.set(price, size);
    }
  }

  return normalizeBook({
    ...book,
    bids: [...bids.entries()].map(([price, size]) => ({ price, size })),
    asks: [...asks.entries()].map(([price, size]) => ({ price, size })),
  });
}

export function bookAgeMs(book: OrderBook, now: number): number {
  if (!Number.isFinite(book.timestamp) || book.timestamp <= 0) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.max(0, now - book.timestamp);
}

export function isBookUsable(book: OrderBook, maxAgeMs: number, now: number): BookUsability {
  const reasons: string[] = [];
  const top = topOfBook(book);

  if (top === null) {
    reasons.push('order book has no two-sided quote');
  } else {
    if (top.crossed) {
      reasons.push('order book is crossed');
    }
    if (top.bid <= 0 || top.ask >= 1) {
      reasons.push('order book price is outside the valid probability range');
    }
  }

  const age = bookAgeMs(book, now);
  if (!Number.isFinite(age)) {
    reasons.push('order book has no timestamp');
  } else if (age > maxAgeMs) {
    reasons.push(`order book is stale (${Math.round(age)}ms > ${maxAgeMs}ms)`);
  }

  return { ok: reasons.length === 0, reasons };
}

export function midPrice(book: OrderBook): number | null {
  const top = topOfBook(book);
  return top === null ? null : top.mid;
}
