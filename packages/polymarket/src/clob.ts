import { normalizeBook, type OrderBook } from '@polyhunter/core';
import { z } from 'zod';
import { PolymarketError, toPolymarketError } from './errors.js';
import {
  defaultFetch,
  type FetchInit,
  type FetchLike,
  sleep,
  trimTrailingSlashes,
} from './http.js';
import { clobBookSchema, parseTimestamp } from './schemas.js';
import type { BookFetchResult, RawBook, TokenMetadata } from './types.js';

export interface ClobClientOptions {
  readonly baseUrl?: string;
  readonly fetchImpl?: FetchLike;
  readonly timeoutMs?: number;
  readonly maxRetries?: number;
  readonly retryBaseMs?: number;
}

interface ClobLevel {
  price: number;
  size: number;
}

function mapLevels(levels: readonly { price: number; size: number }[]): ClobLevel[] {
  return levels.map((level) => ({ price: level.price, size: level.size }));
}

export function mapRawBook(raw: RawBook, meta: TokenMetadata): OrderBook {
  return normalizeBook({
    tokenId: meta.tokenId,
    marketId: meta.marketId,
    outcome: meta.outcome,
    timestamp: raw.timestamp,
    bids: raw.bids,
    asks: raw.asks,
    lastTradePrice: raw.lastTradePrice,
    hash: raw.hash,
  });
}

export function parseRawBook(payload: unknown): RawBook | null {
  const parsed = clobBookSchema.safeParse(payload);
  if (!parsed.success) {
    return null;
  }
  const raw = parsed.data;
  return {
    conditionId: raw.market,
    assetId: raw.asset_id,
    timestamp: parseTimestamp(raw.timestamp),
    hash: raw.hash ?? null,
    bids: mapLevels(raw.bids),
    asks: mapLevels(raw.asks),
    lastTradePrice: raw.last_trade_price ?? null,
  };
}

export class ClobClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly retryBaseMs: number;

  public constructor(options: ClobClientOptions = {}) {
    this.baseUrl = trimTrailingSlashes(options.baseUrl ?? 'https://clob.polymarket.com');
    this.fetchImpl = options.fetchImpl ?? defaultFetch();
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.maxRetries = Math.max(0, options.maxRetries ?? 3);
    this.retryBaseMs = Math.max(50, options.retryBaseMs ?? 250);
  }

  public async getBook(tokenId: string): Promise<RawBook> {
    const params = new URLSearchParams({ token_id: tokenId });
    const payload = await this.request(`/book?${params.toString()}`);
    const raw = parseRawBook(payload);
    if (raw === null) {
      throw new PolymarketError('clob returned an invalid order book', {
        code: 'clob_invalid_book',
      });
    }
    return raw;
  }

  public async getBooks(tokens: readonly TokenMetadata[]): Promise<readonly BookFetchResult[]> {
    const results = await Promise.allSettled(
      tokens.map(async (token) => ({ token, book: await this.getBook(token.tokenId) })),
    );

    return results.map((result, index) => {
      const token = tokens[index];
      if (token === undefined) {
        throw new Error('token result index out of range');
      }
      if (result.status === 'fulfilled') {
        return { token, book: result.value.book, error: null };
      }
      return {
        token,
        book: null,
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      };
    });
  }

  public async getMidpoint(tokenId: string): Promise<number | null> {
    const params = new URLSearchParams({ token_id: tokenId });
    const payload = await this.request(`/midpoint?${params.toString()}`);
    const parsed = z.object({ mid: z.union([z.string(), z.number()]) }).safeParse(payload);
    if (!parsed.success) {
      return null;
    }
    const value = Number(parsed.data.mid);
    return Number.isFinite(value) ? value : null;
  }

  public async getSpread(tokenId: string): Promise<number | null> {
    const params = new URLSearchParams({ token_id: tokenId });
    const payload = await this.request(`/spread?${params.toString()}`);
    const parsed = z.object({ spread: z.union([z.string(), z.number()]) }).safeParse(payload);
    if (!parsed.success) {
      return null;
    }
    const value = Number(parsed.data.spread);
    return Number.isFinite(value) ? value : null;
  }

  private async request(path: string): Promise<unknown> {
    const url = `${this.baseUrl}${path}`;
    let lastError: unknown = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      try {
        const init: FetchInit = {
          method: 'GET',
          headers: { accept: 'application/json' },
          signal: AbortSignal.timeout(this.timeoutMs),
        };
        const response = await this.fetchImpl(url, init);
        if (response.ok) {
          try {
            return await response.json();
          } catch (error) {
            throw new PolymarketError('clob returned invalid JSON', {
              code: 'clob_invalid_json',
              cause: error,
            });
          }
        }

        if (response.status === 429 || response.status >= 500) {
          lastError = new PolymarketError(`clob request failed with HTTP ${response.status}`, {
            code: 'clob_http_error',
            status: response.status,
            retryable: true,
          });
          if (attempt < this.maxRetries) {
            await sleep(this.retryBaseMs * 2 ** attempt);
            continue;
          }
        }

        throw new PolymarketError(`clob request failed with HTTP ${response.status}`, {
          code: 'clob_http_error',
          status: response.status,
          retryable: response.status === 429 || response.status >= 500,
        });
      } catch (error) {
        if (error instanceof PolymarketError && !error.retryable) {
          throw error;
        }
        lastError = error;
        if (attempt < this.maxRetries) {
          await sleep(this.retryBaseMs * 2 ** attempt);
        }
      }
    }

    throw toPolymarketError(lastError, 'clob_network_error');
  }
}
