import type { FeeSchedule, Market } from '@polyhunter/core';
import { z } from 'zod';
import { PolymarketError, toPolymarketError } from './errors.js';
import {
  defaultFetch,
  errorMessage,
  type FetchLike,
  type FetchResponse,
  trimTrailingSlashes,
} from './http.js';
import { type GammaMarketRaw, gammaMarketSchema } from './schemas.js';

export interface GammaClientOptions {
  readonly baseUrl?: string;
  readonly fetchImpl?: FetchLike;
  readonly timeoutMs?: number;
  readonly cacheTtlMs?: number;
  readonly now?: () => number;
}

export interface MarketQuery {
  readonly maxMarkets?: number;
  readonly minLiquidity?: number;
  readonly now?: number;
}

interface CacheEntry {
  readonly at: number;
  readonly key: string;
  readonly markets: readonly Market[];
}

const PAGE_SIZE = 500;

export function parseTokenIds(value: string | readonly string[]): string[] {
  if (Array.isArray(value)) {
    return value.filter((token): token is string => typeof token === 'string' && token.length > 0);
  }
  if (typeof value !== 'string' || value.trim().length === 0) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((token): token is string => typeof token === 'string' && token.length > 0);
  } catch {
    return [];
  }
}

function normalizeTickSize(value: number | undefined): number {
  if (value === 0.001 || value === 0.0001 || value === 0.01) {
    return value;
  }
  return 0.01;
}

function optionalNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function optionalBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1') {
      return true;
    }
    if (normalized === 'false' || normalized === '0') {
      return false;
    }
  }
  return null;
}

function mapFeeSchedule(value: unknown): FeeSchedule | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const rate = optionalNumber(raw.rate);
  if (rate === null || rate < 0 || rate > 1) {
    return null;
  }
  const exponent = optionalNumber(raw.exponent);
  const takerOnly = optionalBoolean(raw.takerOnly);
  return {
    rate,
    exponent: exponent !== null && exponent > 0 ? exponent : 1,
    takerOnly: takerOnly ?? true,
    rebateRate: optionalNumber(raw.rebateRate),
  };
}

export function mapGammaMarket(raw: GammaMarketRaw): Market | null {
  const tokens = parseTokenIds(raw.clobTokenIds);
  const yesTokenId = tokens[0];
  const noTokenId = tokens[1];
  if (yesTokenId === undefined || noTokenId === undefined) {
    return null;
  }

  return {
    id: raw.id,
    conditionId: raw.conditionId,
    slug: raw.slug.length > 0 ? raw.slug : raw.id,
    question: raw.question.length > 0 ? raw.question : raw.slug,
    endDate: raw.endDate ?? null,
    liquidity: raw.liquidity,
    volume24h: raw.volume24hr,
    yesTokenId,
    noTokenId,
    tickSize: normalizeTickSize(raw.orderPriceMinTickSize ?? raw.tickSize),
    negRisk: raw.negRisk,
    active: raw.active,
    closed: raw.closed,
    acceptingOrders: raw.acceptingOrders,
    feesEnabled: optionalBoolean(raw.feesEnabled),
    feeSchedule: mapFeeSchedule(raw.feeSchedule),
  };
}

export class GammaClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;
  private readonly cacheTtlMs: number;
  private readonly now: () => number;
  private cache: CacheEntry | null = null;

  public constructor(options: GammaClientOptions = {}) {
    this.baseUrl = trimTrailingSlashes(options.baseUrl ?? 'https://gamma-api.polymarket.com');
    this.fetchImpl = options.fetchImpl ?? defaultFetch();
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.cacheTtlMs = options.cacheTtlMs ?? 60_000;
    this.now = options.now ?? Date.now;
  }

  public clearCache(): void {
    this.cache = null;
  }

  public async listMarkets(query: MarketQuery = {}): Promise<Market[]> {
    const maxMarkets = Math.max(1, Math.min(query.maxMarkets ?? 50, 500));
    const minLiquidity = Math.max(0, query.minLiquidity ?? 0);
    const now = query.now ?? this.now();
    const key = `${maxMarkets}:${minLiquidity}:${Math.floor(now / this.cacheTtlMs)}`;

    if (this.cache !== null && this.cache.key === key && now - this.cache.at < this.cacheTtlMs) {
      return [...this.cache.markets];
    }

    const collected: Market[] = [];
    let offset = 0;
    let pages = 0;

    while (collected.length < maxMarkets && pages < 10) {
      const page = await this.fetchPage(offset);
      pages += 1;
      for (const raw of page) {
        const market = mapGammaMarket(raw);
        if (market === null) {
          continue;
        }
        if (!market.active || market.closed || !market.acceptingOrders) {
          continue;
        }
        if (market.liquidity < minLiquidity) {
          continue;
        }
        if (market.endDate !== null) {
          const end = Date.parse(market.endDate);
          if (Number.isFinite(end) && end <= now) {
            continue;
          }
        }
        collected.push(market);
        if (collected.length >= maxMarkets) {
          break;
        }
      }
      if (page.length < PAGE_SIZE) {
        break;
      }
      offset += PAGE_SIZE;
    }

    collected.sort(
      (left, right) => right.volume24h - left.volume24h || right.liquidity - left.liquidity,
    );
    const markets = collected.slice(0, maxMarkets);
    this.cache = { at: now, key, markets };
    return [...markets];
  }

  private async fetchPage(offset: number): Promise<readonly GammaMarketRaw[]> {
    const params = new URLSearchParams({
      active: 'true',
      closed: 'false',
      limit: String(PAGE_SIZE),
      offset: String(offset),
      order: 'volume24hr',
      ascending: 'false',
    });
    const url = `${this.baseUrl}/markets?${params.toString()}`;
    let response: FetchResponse;
    try {
      response = await this.fetchImpl(url, {
        method: 'GET',
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw new PolymarketError(`gamma request failed: ${errorMessage(error)}`, {
        code: 'gamma_network_error',
        retryable: true,
        cause: error,
      });
    }

    if (!response.ok) {
      throw new PolymarketError(`gamma request failed with HTTP ${response.status}`, {
        code: 'gamma_http_error',
        status: response.status,
        retryable: response.status === 429 || response.status >= 500,
      });
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      throw new PolymarketError('gamma returned invalid JSON', {
        code: 'gamma_invalid_json',
        retryable: false,
        cause: error,
      });
    }

    try {
      return z.array(gammaMarketSchema).parse(payload);
    } catch (error) {
      throw toPolymarketError(error, 'gamma_invalid_payload');
    }
  }
}
