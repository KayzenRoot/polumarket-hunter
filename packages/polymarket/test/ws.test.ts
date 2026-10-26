import { makeClobBook } from '@polyhunter/testkit';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MarketMessageNormalizer,
  MarketSocket,
  type TokenMetadata,
  type WebSocketLike,
} from '../src/index.js';

const YES: TokenMetadata = { marketId: 'market-1', tokenId: 'yes-token', outcome: 'YES' };
const NO: TokenMetadata = { marketId: 'market-1', tokenId: 'no-token', outcome: 'NO' };

function resolver(tokenId: string): TokenMetadata | null {
  if (tokenId === YES.tokenId) {
    return YES;
  }
  if (tokenId === NO.tokenId) {
    return NO;
  }
  return null;
}

function bookMessage(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...makeClobBook(),
    event_type: 'book',
    timestamp: '1700000000000',
    ...overrides,
  };
}

describe('market message normalizer', () => {
  it('ingests a book snapshot', () => {
    const normalizer = new MarketMessageNormalizer(resolver);
    const update = normalizer.ingest(bookMessage(), 1_700_000_000_001);

    expect(update.ignored).toBe(false);
    expect(update.books).toHaveLength(1);
    expect(update.books[0]?.tokenId).toBe('yes-token');
    expect(update.books[0]?.outcome).toBe('YES');
    expect(update.books[0]?.timestamp).toBe(1_700_000_000_000);
  });

  it('applies price changes to bids and asks', () => {
    const normalizer = new MarketMessageNormalizer(resolver);
    normalizer.ingest(bookMessage(), 1_700_000_000_000);
    const update = normalizer.ingest(
      {
        event_type: 'price_change',
        market: '0xmarket',
        timestamp: '1700000001000',
        price_changes: [
          { asset_id: 'yes-token', price: '0.49', size: '150', side: 'BUY' },
          { asset_id: 'yes-token', price: '0.5', size: '50', side: 'SELL' },
        ],
      },
      1_700_000_001_001,
    );

    expect(update.books).toHaveLength(1);
    expect(update.books[0]?.bids[0]).toEqual({ price: 0.49, size: 150 });
    expect(update.books[0]?.asks[0]).toEqual({ price: 0.5, size: 50 });
  });

  it('removes a level when size is zero', () => {
    const normalizer = new MarketMessageNormalizer(resolver);
    normalizer.ingest(bookMessage(), 1_700_000_000_000);
    const update = normalizer.ingest(
      {
        event_type: 'price_change',
        market: '0xmarket',
        timestamp: '1700000001000',
        price_changes: [{ asset_id: 'yes-token', price: '0.48', size: '0', side: 'BUY' }],
      },
      1_700_000_001_000,
    );

    expect(update.books[0]?.bids[0]).toEqual({ price: 0.47, size: 300 });
  });

  it('updates the last trade price', () => {
    const normalizer = new MarketMessageNormalizer(resolver);
    normalizer.ingest(bookMessage(), 1_700_000_000_000);
    const update = normalizer.ingest(
      {
        event_type: 'last_trade_price',
        market: '0xmarket',
        asset_id: 'yes-token',
        price: '0.49',
        size: '12',
        side: 'BUY',
        timestamp: '1700000002000',
      },
      1_700_000_002_000,
    );

    expect(update.books[0]?.lastTradePrice).toBe(0.49);
    expect(update.events[0]).toMatchObject({
      type: 'last_trade_price',
      tokenId: 'yes-token',
      price: 0.49,
      size: 12,
    });
  });

  it('emits tick size, best bid/ask and resolution events', () => {
    const normalizer = new MarketMessageNormalizer(resolver);
    const tick = normalizer.ingest(
      {
        event_type: 'tick_size_change',
        market: '0xmarket',
        asset_id: 'yes-token',
        old_tick_size: '0.01',
        new_tick_size: '0.001',
        timestamp: '1700000000000',
      },
      1_700_000_000_000,
    );
    expect(tick.events[0]).toMatchObject({ type: 'tick_size_change', newTickSize: 0.001 });

    const bba = normalizer.ingest(
      {
        event_type: 'best_bid_ask',
        market: '0xmarket',
        asset_id: 'yes-token',
        best_bid: '0.48',
        best_ask: '0.5',
        spread: '0.02',
        timestamp: '1700000000000',
      },
      1_700_000_000_000,
    );
    expect(bba.events[0]).toMatchObject({ type: 'best_bid_ask', bestBid: 0.48, bestAsk: 0.5 });

    const resolved = normalizer.ingest(
      {
        event_type: 'market_resolved',
        market: '0xmarket',
        winning_asset_id: 'yes-token',
        winning_outcome: 'Yes',
        timestamp: '1700000000000',
      },
      1_700_000_000_000,
    );
    expect(resolved.events[0]).toMatchObject({
      type: 'market_resolved',
      conditionId: '0xmarket',
      winningAssetId: 'yes-token',
    });
  });

  it('ignores unknown tokens, malformed payloads and unknown event types', () => {
    const normalizer = new MarketMessageNormalizer(resolver);
    expect(normalizer.ingest(bookMessage({ asset_id: 'unknown' }), 1).ignored).toBe(true);
    expect(normalizer.ingest({ nope: true }, 1).ignored).toBe(true);
    const unknown = normalizer.ingest({ event_type: 'new_market', market: '0x' }, 1);
    expect(unknown.events[0]).toMatchObject({ type: 'unknown', rawType: 'new_market' });
  });

  it('handles arrays and de-duplicates updates by token', () => {
    const normalizer = new MarketMessageNormalizer(resolver);
    const update = normalizer.ingest(
      [
        bookMessage(),
        {
          event_type: 'price_change',
          market: '0xmarket',
          timestamp: '1700000001000',
          price_changes: [{ asset_id: 'yes-token', price: '0.49', size: '150', side: 'BUY' }],
        },
      ],
      1_700_000_001_000,
    );

    expect(update.books).toHaveLength(1);
    expect(update.books[0]?.bids[0]?.price).toBe(0.49);
  });
});

class FakeSocket implements WebSocketLike {
  public readyState = 0;
  public readonly sent: string[] = [];
  private readonly listeners = new Map<string, ((event: unknown) => void)[]>();

  public addEventListener(
    type: 'open' | 'message' | 'error' | 'close',
    listener: (event: unknown) => void,
  ): void {
    const existing = this.listeners.get(type) ?? [];
    existing.push(listener);
    this.listeners.set(type, existing);
  }

  public send(data: string): void {
    this.sent.push(data);
  }

  public close(): void {
    this.readyState = 3;
    this.emit('close', {});
  }

  public open(): void {
    this.readyState = 1;
    this.emit('open', {});
  }

  public message(data: string): void {
    this.emit('message', { data });
  }

  public serverClose(): void {
    this.readyState = 3;
    this.emit('close', {});
  }

  public emitError(message: string): void {
    this.emit('error', { message });
  }

  private emit(type: string, event: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

function socketHarness() {
  const sockets: FakeSocket[] = [];
  return {
    sockets,
    factory: (url: string) => {
      const socket = new FakeSocket();
      sockets.push(socket);
      void url;
      return socket;
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('market socket', () => {
  it('subscribes on open and forwards books', () => {
    const harness = socketHarness();
    const books: string[] = [];
    const socket = new MarketSocket({
      url: 'wss://example.test',
      tokens: [YES],
      onBook: (book) => books.push(book.tokenId),
      socketFactory: harness.factory,
    });

    socket.connect();
    expect(harness.sockets).toHaveLength(1);
    harness.sockets[0]?.open();

    const frame = JSON.parse(harness.sockets[0]?.sent[0] ?? '{}') as Record<string, unknown>;
    expect(frame).toMatchObject({ type: 'market', assets_ids: ['yes-token'] });

    harness.sockets[0]?.message(JSON.stringify(bookMessage()));
    expect(books).toEqual(['yes-token']);
    expect(socket.isConnected).toBe(true);
  });

  it('sends subscribe and unsubscribe frames when tokens change', () => {
    const harness = socketHarness();
    const socket = new MarketSocket({
      url: 'wss://example.test',
      tokens: [YES],
      onBook: () => undefined,
      socketFactory: harness.factory,
    });
    socket.connect();
    harness.sockets[0]?.open();
    const opened = harness.sockets[0];
    if (opened !== undefined) {
      opened.sent.length = 0;
    }

    socket.updateTokens([YES, NO]);
    const subscribe = JSON.parse(harness.sockets[0]?.sent[0] ?? '{}') as Record<string, unknown>;
    expect(subscribe).toMatchObject({ operation: 'subscribe', assets_ids: ['no-token'] });

    socket.updateTokens([NO]);
    const unsubscribe = JSON.parse(harness.sockets[0]?.sent[1] ?? '{}') as Record<string, unknown>;
    expect(unsubscribe).toMatchObject({ operation: 'unsubscribe', assets_ids: ['yes-token'] });
  });

  it('sends a PING heartbeat', () => {
    vi.useFakeTimers();
    const harness = socketHarness();
    const socket = new MarketSocket({
      url: 'wss://example.test',
      tokens: [YES],
      onBook: () => undefined,
      socketFactory: harness.factory,
      heartbeatMs: 1000,
    });
    socket.connect();
    harness.sockets[0]?.open();
    const opened = harness.sockets[0];
    if (opened !== undefined) {
      opened.sent.length = 0;
    }

    vi.advanceTimersByTime(1000);
    expect(harness.sockets[0]?.sent).toContain('PING');
  });

  it('reconnects with backoff after the server closes', () => {
    vi.useFakeTimers();
    const harness = socketHarness();
    const socket = new MarketSocket({
      url: 'wss://example.test',
      tokens: [YES],
      onBook: () => undefined,
      socketFactory: harness.factory,
      reconnectBaseMs: 1000,
    });
    socket.connect();
    harness.sockets[0]?.open();
    harness.sockets[0]?.serverClose();

    expect(socket.isConnected).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(harness.sockets).toHaveLength(2);
    expect(socket.reconnectCount).toBe(1);
  });

  it('does not reconnect after a user close', () => {
    vi.useFakeTimers();
    const harness = socketHarness();
    const socket = new MarketSocket({
      url: 'wss://example.test',
      tokens: [YES],
      onBook: () => undefined,
      socketFactory: harness.factory,
      reconnectBaseMs: 1000,
    });
    socket.connect();
    harness.sockets[0]?.open();
    socket.close();
    vi.advanceTimersByTime(5000);
    expect(harness.sockets).toHaveLength(1);
  });

  it('records socket errors without throwing', () => {
    const harness = socketHarness();
    const socket = new MarketSocket({
      url: 'wss://example.test',
      tokens: [YES],
      onBook: () => undefined,
      socketFactory: harness.factory,
    });
    socket.connect();
    harness.sockets[0]?.emitError('boom');
    expect(socket.lastError).toBe('boom');
  });
});
