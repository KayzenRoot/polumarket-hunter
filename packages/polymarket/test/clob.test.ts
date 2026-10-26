import { makeClobBook } from '@polyhunter/testkit';
import { describe, expect, it } from 'vitest';
import { ClobClient, mapRawBook, parseRawBook, type TokenMetadata } from '../src/index.js';
import { jsonResponse, sequenceFetch } from './helpers.js';

const meta: TokenMetadata = {
  marketId: 'market-1',
  tokenId: 'yes-token',
  outcome: 'YES',
  tickSize: 0.01,
};

describe('clob book mapping', () => {
  it('parses a raw book and maps it to the domain model', () => {
    const raw = parseRawBook(makeClobBook());
    expect(raw).not.toBeNull();
    expect(raw?.assetId).toBe('yes-token');
    expect(raw?.bids).toEqual([
      { price: 0.48, size: 200 },
      { price: 0.47, size: 300 },
    ]);
    expect(raw?.asks).toEqual([
      { price: 0.5, size: 200 },
      { price: 0.51, size: 300 },
    ]);
    expect(raw?.timestamp).toBe(1_700_000_000_000);
    if (raw === null) {
      throw new Error('expected a parsed raw book');
    }

    const book = mapRawBook(raw, meta);
    expect(book.tokenId).toBe('yes-token');
    expect(book.marketId).toBe('market-1');
    expect(book.outcome).toBe('YES');
    expect(book.timestamp).toBe(1_700_000_000_000);
  });

  it('rejects malformed books', () => {
    expect(parseRawBook({ asset_id: 'yes-token' })).toBeNull();
    expect(parseRawBook(null)).toBeNull();
  });

  it('maps a 0.001 tick from the raw book or token metadata', () => {
    const raw = parseRawBook(makeClobBook({ tick_size: '0.001' }));
    expect(raw?.tickSize).toBe(0.001);
    if (raw === null) {
      throw new Error('expected a parsed raw book');
    }
    expect(mapRawBook(raw, { ...meta, tickSize: 0.01 }).tickSize).toBe(0.001);

    const withoutRawTick = parseRawBook(makeClobBook({ tick_size: undefined }));
    if (withoutRawTick === null) {
      throw new Error('expected a parsed raw book');
    }
    expect(mapRawBook(withoutRawTick, { ...meta, tickSize: 0.001 }).tickSize).toBe(0.001);
  });
});

describe('clob client', () => {
  it('gets a book by token id', async () => {
    const fetchImpl = sequenceFetch([jsonResponse(makeClobBook())]);
    const client = new ClobClient({ fetchImpl });
    const book = await client.getBook('yes-token');
    expect(book.assetId).toBe('yes-token');
    expect(fetchImpl.calls[0]).toContain('/book?token_id=yes-token');
  });

  it('retries a retryable HTTP failure', async () => {
    const fetchImpl = sequenceFetch([
      jsonResponse({ error: 'busy' }, 500),
      jsonResponse(makeClobBook()),
    ]);
    const client = new ClobClient({ fetchImpl, maxRetries: 1, retryBaseMs: 1 });
    const book = await client.getBook('yes-token');
    expect(book.assetId).toBe('yes-token');
    expect(fetchImpl.calls).toHaveLength(2);
  });

  it('retries HTTP 429 and then succeeds', async () => {
    const fetchImpl = sequenceFetch([
      jsonResponse({ error: 'rate limited' }, 429),
      jsonResponse({ error: 'rate limited' }, 429),
      jsonResponse(makeClobBook()),
    ]);
    const client = new ClobClient({ fetchImpl, maxRetries: 2, retryBaseMs: 50 });
    const book = await client.getBook('yes-token');
    expect(book.assetId).toBe('yes-token');
    expect(fetchImpl.calls).toHaveLength(3);
  });

  it('exhausts the retry budget on repeated 429 and 5xx responses', async () => {
    const rateLimited = sequenceFetch([jsonResponse({ error: 'busy' }, 429)]);
    const limitedClient = new ClobClient({
      fetchImpl: rateLimited,
      maxRetries: 2,
      retryBaseMs: 50,
    });
    await expect(limitedClient.getBook('yes-token')).rejects.toMatchObject({
      code: 'clob_http_error',
      status: 429,
      retryable: true,
    });
    expect(rateLimited.calls).toHaveLength(3);

    const unavailable = sequenceFetch([jsonResponse({ error: 'down' }, 503)]);
    const unavailableClient = new ClobClient({
      fetchImpl: unavailable,
      maxRetries: 1,
      retryBaseMs: 50,
    });
    await expect(unavailableClient.getBook('yes-token')).rejects.toMatchObject({
      code: 'clob_http_error',
      status: 503,
      retryable: true,
    });
    expect(unavailable.calls).toHaveLength(2);
  });

  it('does not retry a non-retryable failure', async () => {
    const fetchImpl = sequenceFetch([jsonResponse({ error: 'missing' }, 404)]);
    const client = new ClobClient({ fetchImpl, maxRetries: 3, retryBaseMs: 1 });
    await expect(client.getBook('missing')).rejects.toMatchObject({
      code: 'clob_http_error',
      status: 404,
      retryable: false,
    });
    expect(fetchImpl.calls).toHaveLength(1);
  });

  it('throws on an invalid book payload', async () => {
    const fetchImpl = sequenceFetch([jsonResponse({ asset_id: 'yes-token' })]);
    const client = new ClobClient({ fetchImpl });
    await expect(client.getBook('yes-token')).rejects.toMatchObject({
      code: 'clob_invalid_book',
    });
  });

  it('returns per-token results for a batch fetch', async () => {
    const fetchImpl = sequenceFetch([jsonResponse(makeClobBook()), jsonResponse({}, 500)]);
    const client = new ClobClient({ fetchImpl, maxRetries: 0 });
    const results = await client.getBooks([
      meta,
      { marketId: 'market-2', tokenId: 'other-token', outcome: 'NO', tickSize: 0.01 },
    ]);

    expect(results).toHaveLength(2);
    expect(results[0]?.book?.assetId).toBe('yes-token');
    expect(results[1]?.book).toBeNull();
    expect(results[1]?.error).toContain('500');
  });

  it('reads midpoint and spread', async () => {
    const fetchImpl = sequenceFetch([
      jsonResponse({ mid: '0.51' }),
      jsonResponse({ spread: '0.02' }),
    ]);
    const client = new ClobClient({ fetchImpl });
    await expect(client.getMidpoint('yes-token')).resolves.toBe(0.51);
    await expect(client.getSpread('yes-token')).resolves.toBe(0.02);
  });

  it('returns null for malformed midpoint or spread payloads', async () => {
    const fetchImpl = sequenceFetch([jsonResponse({ nope: true }), jsonResponse({ nope: true })]);
    const client = new ClobClient({ fetchImpl });
    await expect(client.getMidpoint('yes-token')).resolves.toBeNull();
    await expect(client.getSpread('yes-token')).resolves.toBeNull();
  });
});
