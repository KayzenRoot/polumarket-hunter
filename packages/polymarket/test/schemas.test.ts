import { makeClobBook, makeGammaMarket, makeGeoblock } from '@polyhunter/testkit';
import { describe, expect, it } from 'vitest';
import {
  clobBookSchema,
  gammaMarketSchema,
  geoblockSchema,
  parseTimestamp,
  priceChangeSchema,
} from '../src/index.js';

describe('wire schemas', () => {
  it('parses timestamps in milliseconds and seconds', () => {
    expect(parseTimestamp(undefined)).toBe(0);
    expect(parseTimestamp(null)).toBe(0);
    expect(parseTimestamp(0)).toBe(0);
    expect(parseTimestamp(-5)).toBe(0);
    expect(parseTimestamp('not-a-number')).toBe(0);
    expect(parseTimestamp(1_700_000_000_000)).toBe(1_700_000_000_000);
    expect(parseTimestamp('1700000000')).toBe(1_700_000_000_000);
  });

  it('normalizes gamma booleans, numbers and token ids', () => {
    const parsed = gammaMarketSchema.parse(
      makeGammaMarket({
        active: 'true',
        closed: 0,
        acceptingOrders: 1,
        negRisk: 'false',
        liquidity: '123.5',
        volume24hr: '42',
        clobTokenIds: ['yes-token', 'no-token'],
      }),
    );
    expect(parsed.active).toBe(true);
    expect(parsed.closed).toBe(false);
    expect(parsed.acceptingOrders).toBe(true);
    expect(parsed.negRisk).toBe(false);
    expect(parsed.liquidity).toBe(123.5);
    expect(parsed.volume24hr).toBe(42);
    expect(parsed.clobTokenIds).toEqual(['yes-token', 'no-token']);
  });

  it('rejects a clob book without bids or asks', () => {
    expect(clobBookSchema.safeParse({ asset_id: 'yes-token' }).success).toBe(false);
    expect(clobBookSchema.safeParse(makeClobBook()).success).toBe(true);
  });

  it('parses a price change side and rejects an invalid side', () => {
    expect(
      priceChangeSchema.parse({ asset_id: 'yes-token', price: '0.5', size: '10', side: 'BUY' }),
    ).toMatchObject({ price: 0.5, size: 10, side: 'BUY' });
    expect(
      priceChangeSchema.safeParse({ asset_id: 'yes-token', price: '0.5', size: '10', side: 'HOLD' })
        .success,
    ).toBe(false);
  });

  it('parses geoblock payloads', () => {
    const parsed = geoblockSchema.parse(makeGeoblock({ blocked: true, country: 'BR' }));
    expect(parsed.blocked).toBe(true);
    expect(parsed.country).toBe('BR');
    expect(geoblockSchema.safeParse({ country: 'BR' }).success).toBe(false);
  });
});
