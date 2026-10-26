import { makeGammaMarket } from '@polyhunter/testkit';
import { describe, expect, it } from 'vitest';
import { GammaClient, mapGammaMarket, parseTokenIds } from '../src/index.js';
import { jsonResponse, sequenceFetch } from './helpers.js';

describe('gamma market mapping', () => {
  it('parses string and array token ids', () => {
    expect(parseTokenIds('["a","b"]')).toEqual(['a', 'b']);
    expect(parseTokenIds(['a', 'b'])).toEqual(['a', 'b']);
    expect(parseTokenIds('not json')).toEqual([]);
    expect(parseTokenIds('["a", 1, null]')).toEqual(['a']);
  });

  it('maps a valid gamma market', () => {
    const market = mapGammaMarket(makeGammaMarket() as never);
    expect(market).toMatchObject({
      id: '2589812',
      yesTokenId: 'yes-token',
      noTokenId: 'no-token',
      tickSize: 0.01,
      active: true,
      closed: false,
      acceptingOrders: true,
    });
  });

  it('maps fee schedules and explicit fee-free markets', () => {
    const paid = mapGammaMarket(
      makeGammaMarket({
        feesEnabled: true,
        feeSchedule: { rate: 0.03, exponent: 1, takerOnly: true, rebateRate: 0.25 },
      }) as never,
    );
    expect(paid).toMatchObject({
      feesEnabled: true,
      feeSchedule: { rate: 0.03, exponent: 1, takerOnly: true, rebateRate: 0.25 },
    });

    const free = mapGammaMarket(
      makeGammaMarket({ feesEnabled: false, feeSchedule: null }) as never,
    );
    expect(free).toMatchObject({ feesEnabled: false, feeSchedule: null });

    const unknown = mapGammaMarket(makeGammaMarket() as never);
    expect(unknown?.feesEnabled).toBeNull();
    expect(unknown?.feeSchedule).toBeNull();
  });

  it('does not invent a fee schedule from malformed data', () => {
    const market = mapGammaMarket(
      makeGammaMarket({ feesEnabled: true, feeSchedule: { rate: 'oops' } }) as never,
    );
    expect(market?.feesEnabled).toBe(true);
    expect(market?.feeSchedule).toBeNull();
  });

  it('rejects markets without two clob tokens', () => {
    expect(mapGammaMarket(makeGammaMarket({ clobTokenIds: '["only-one"]' }) as never)).toBeNull();
    expect(mapGammaMarket(makeGammaMarket({ clobTokenIds: '[]' }) as never)).toBeNull();
  });
});

describe('gamma client', () => {
  it('paginates, filters and sorts markets', async () => {
    const fetchImpl = sequenceFetch([
      jsonResponse([
        makeGammaMarket({ id: '1', volume24hr: 10, liquidity: '1000' }),
        makeGammaMarket({ id: '2', volume24hr: 200, liquidity: '1000' }),
        makeGammaMarket({ id: '3', volume24hr: 300, liquidity: '1' }),
      ]),
    ]);
    const client = new GammaClient({ fetchImpl, now: () => 1_000_000 });
    const markets = await client.listMarkets({ maxMarkets: 10, minLiquidity: 100, now: 1_000_000 });

    expect(markets.map((market) => market.id)).toEqual(['2', '1']);
    expect(fetchImpl.calls[0]).toContain('order=volume24hr');
    expect(fetchImpl.calls[0]).toContain('active=true');
  });

  it('filters closed, inactive and expired markets', async () => {
    const fetchImpl = sequenceFetch([
      jsonResponse([
        makeGammaMarket({ id: 'ok' }),
        makeGammaMarket({ id: 'closed', closed: true }),
        makeGammaMarket({ id: 'inactive', active: false }),
        makeGammaMarket({ id: 'not-accepting', acceptingOrders: false }),
        makeGammaMarket({ id: 'expired', endDate: '2020-01-01T00:00:00.000Z' }),
      ]),
    ]);
    const client = new GammaClient({
      fetchImpl,
      now: () => Date.parse('2026-01-01T00:00:00.000Z'),
    });
    const markets = await client.listMarkets({
      maxMarkets: 10,
      now: Date.parse('2026-01-01T00:00:00.000Z'),
    });
    expect(markets.map((market) => market.id)).toEqual(['ok']);
  });

  it('caches repeated queries', async () => {
    const fetchImpl = sequenceFetch([jsonResponse([makeGammaMarket()])]);
    const client = new GammaClient({ fetchImpl, now: () => 1_000_000 });
    await client.listMarkets({ maxMarkets: 1, now: 1_000_000 });
    await client.listMarkets({ maxMarkets: 1, now: 1_000_001 });
    expect(fetchImpl.calls).toHaveLength(1);
    client.clearCache();
    await client.listMarkets({ maxMarkets: 1, now: 1_000_002 });
    expect(fetchImpl.calls).toHaveLength(2);
  });

  it('throws a typed error on an invalid payload', async () => {
    const fetchImpl = sequenceFetch([jsonResponse({ not: 'an array' })]);
    const client = new GammaClient({ fetchImpl, now: () => 1_000_000 });
    await expect(client.listMarkets({ maxMarkets: 1 })).rejects.toMatchObject({
      name: 'PolymarketError',
      code: 'gamma_invalid_payload',
    });
  });

  it('throws a retryable error on HTTP 500', async () => {
    const fetchImpl = sequenceFetch([jsonResponse({}, 500)]);
    const client = new GammaClient({ fetchImpl, now: () => 1_000_000 });
    await expect(client.listMarkets({ maxMarkets: 1 })).rejects.toMatchObject({
      code: 'gamma_http_error',
      status: 500,
      retryable: true,
    });
  });
});
