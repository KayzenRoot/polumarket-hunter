import { normalizeBook } from './orderbook.js';
import type { BookLevel, OrderBook, Outcome } from './types.js';

export interface RecordingLine {
  readonly v: 1;
  readonly type: 'book';
  readonly book: OrderBook;
}

export interface DecodeResult {
  readonly books: readonly OrderBook[];
  readonly errors: readonly string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseLevels(value: unknown): BookLevel[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const levels: BookLevel[] = [];
  for (const item of value) {
    if (!isRecord(item)) {
      return null;
    }
    const price = item.price;
    const size = item.size;
    if (typeof price !== 'number' || typeof size !== 'number') {
      return null;
    }
    levels.push({ price, size });
  }
  return levels;
}

function parseOutcome(value: unknown): Outcome | null {
  return value === 'YES' || value === 'NO' ? value : null;
}

export function encodeBook(book: OrderBook): string {
  const line: RecordingLine = { v: 1, type: 'book', book };
  return JSON.stringify(line);
}

export function decodeBook(value: unknown): OrderBook | null {
  const candidate = isRecord(value) && isRecord(value.book) ? value.book : value;
  if (!isRecord(candidate)) {
    return null;
  }
  const tokenId = candidate.tokenId;
  const marketId = candidate.marketId;
  const outcome = parseOutcome(candidate.outcome);
  const timestamp = candidate.timestamp;
  const bids = parseLevels(candidate.bids);
  const asks = parseLevels(candidate.asks);
  const lastTradePrice = candidate.lastTradePrice;
  const hash = candidate.hash;

  if (
    typeof tokenId !== 'string' ||
    typeof marketId !== 'string' ||
    outcome === null ||
    typeof timestamp !== 'number' ||
    bids === null ||
    asks === null
  ) {
    return null;
  }

  return normalizeBook({
    tokenId,
    marketId,
    outcome,
    timestamp,
    bids,
    asks,
    lastTradePrice: typeof lastTradePrice === 'number' ? lastTradePrice : null,
    hash: typeof hash === 'string' ? hash : null,
  });
}

export function decodeRecordingLine(line: string): OrderBook | null {
  if (line.trim().length === 0) {
    return null;
  }
  try {
    return decodeBook(JSON.parse(line) as unknown);
  } catch {
    return null;
  }
}

export function decodeRecording(text: string): DecodeResult {
  const books: OrderBook[] = [];
  const errors: string[] = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    if (line.trim().length === 0) {
      return;
    }
    const book = decodeRecordingLine(line);
    if (book === null) {
      errors.push(`line ${index + 1}: invalid book recording`);
      return;
    }
    books.push(book);
  });
  return { books, errors };
}
