import { applyLevelChanges, type BookLevel, type OrderBook, type Side } from '@polyhunter/core';
import { mapRawBook } from './clob.js';
import { errorMessage } from './http.js';
import {
  bestBidAskEventSchema,
  clobBookSchema,
  lastTradeEventSchema,
  marketResolvedEventSchema,
  parseTimestamp,
  priceChangeEventSchema,
  tickSizeEventSchema,
} from './schemas.js';
import type {
  MarketEvent,
  NormalizedMarketUpdate,
  SocketStatus,
  TokenMetadata,
  TokenResolver,
} from './types.js';

export interface WebSocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(
    type: 'open' | 'message' | 'error' | 'close',
    listener: (event: unknown) => void,
  ): void;
}

export type WebSocketFactory = (url: string) => WebSocketLike;

export interface MarketSocketOptions {
  readonly url: string;
  readonly tokens: readonly TokenMetadata[];
  readonly onBook: (book: OrderBook) => void;
  readonly onEvent?: (event: MarketEvent) => void;
  readonly onStatus?: (status: SocketStatus) => void;
  readonly socketFactory?: WebSocketFactory;
  readonly now?: () => number;
  readonly reconnectBaseMs?: number;
  readonly reconnectMaxMs?: number;
  readonly heartbeatMs?: number;
  readonly staleAfterMs?: number;
}

const OPEN = 1;

export function defaultWebSocketFactory(url: string): WebSocketLike {
  const WebSocketConstructor = (globalThis as { WebSocket?: new (url: string) => unknown })
    .WebSocket;
  if (WebSocketConstructor === undefined) {
    throw new Error('WebSocket is not available in this runtime');
  }
  return new WebSocketConstructor(url) as WebSocketLike;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function numberOrNull(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export class MarketMessageNormalizer {
  private readonly resolve: TokenResolver;
  private readonly books = new Map<string, OrderBook>();

  public constructor(resolver: TokenResolver) {
    this.resolve = resolver;
  }

  public getBook(tokenId: string): OrderBook | null {
    return this.books.get(tokenId) ?? null;
  }

  public ingest(payload: unknown, receivedAt: number): NormalizedMarketUpdate {
    const books: OrderBook[] = [];
    const events: MarketEvent[] = [];

    if (Array.isArray(payload)) {
      for (const item of payload) {
        const update = this.ingest(item, receivedAt);
        books.push(...update.books);
        events.push(...update.events);
      }
      return this.finish(books, events);
    }

    if (!isRecord(payload)) {
      return { books: [], events: [], ignored: true };
    }

    const eventType = typeof payload.event_type === 'string' ? payload.event_type : null;

    if (
      eventType === 'price_change' ||
      (eventType === null && Array.isArray(payload.price_changes))
    ) {
      const parsed = priceChangeEventSchema.safeParse(payload);
      if (parsed.success) {
        const at = parseTimestamp(parsed.data.timestamp) || receivedAt;
        for (const change of parsed.data.price_changes) {
          const book = this.applyChange(
            change.asset_id,
            change.side,
            change.price,
            change.size,
            at,
          );
          if (book !== null) {
            books.push(book);
          }
        }
      }
      return this.finish(books, events);
    }

    if (eventType === 'last_trade_price') {
      const parsed = lastTradeEventSchema.safeParse(payload);
      if (parsed.success) {
        const data = parsed.data;
        const at = parseTimestamp(data.timestamp) || receivedAt;
        const existing = this.books.get(data.asset_id);
        if (existing !== undefined) {
          const updated: OrderBook = { ...existing, lastTradePrice: data.price, timestamp: at };
          this.books.set(data.asset_id, updated);
          books.push(updated);
        }
        events.push({
          type: 'last_trade_price',
          tokenId: data.asset_id,
          price: data.price,
          size: data.size,
          side: data.side,
          at,
        });
      }
      return this.finish(books, events);
    }

    if (eventType === 'tick_size_change') {
      const parsed = tickSizeEventSchema.safeParse(payload);
      if (parsed.success) {
        events.push({
          type: 'tick_size_change',
          tokenId: parsed.data.asset_id,
          oldTickSize: parsed.data.old_tick_size ?? 0,
          newTickSize: parsed.data.new_tick_size,
          at: parseTimestamp(parsed.data.timestamp) || receivedAt,
        });
      }
      return this.finish(books, events);
    }

    if (eventType === 'best_bid_ask') {
      const parsed = bestBidAskEventSchema.safeParse(payload);
      if (parsed.success) {
        events.push({
          type: 'best_bid_ask',
          tokenId: parsed.data.asset_id,
          bestBid: numberOrNull(parsed.data.best_bid),
          bestAsk: numberOrNull(parsed.data.best_ask),
          spread: numberOrNull(parsed.data.spread),
          at: parseTimestamp(parsed.data.timestamp) || receivedAt,
        });
      }
      return this.finish(books, events);
    }

    if (eventType === 'market_resolved') {
      const parsed = marketResolvedEventSchema.safeParse(payload);
      if (parsed.success) {
        events.push({
          type: 'market_resolved',
          conditionId: parsed.data.market,
          winningAssetId: parsed.data.winning_asset_id ?? null,
          winningOutcome: parsed.data.winning_outcome ?? null,
          at: parseTimestamp(parsed.data.timestamp) || receivedAt,
        });
      }
      return this.finish(books, events);
    }

    if (eventType === 'book' || (eventType === null && Array.isArray(payload.bids))) {
      const book = this.ingestBook(payload, receivedAt);
      if (book !== null) {
        books.push(book);
      }
      return this.finish(books, events);
    }

    if (eventType !== null) {
      events.push({ type: 'unknown', rawType: eventType, at: receivedAt });
    }

    return { books: [], events, ignored: events.length === 0 };
  }

  private ingestBook(payload: unknown, receivedAt: number): OrderBook | null {
    const parsed = clobBookSchema.safeParse(payload);
    if (!parsed.success) {
      return null;
    }
    const raw = parsed.data;
    const meta = this.resolve(raw.asset_id);
    if (meta === null) {
      return null;
    }
    const timestamp = parseTimestamp(raw.timestamp) || receivedAt;
    const existing = this.books.get(raw.asset_id);
    const book = mapRawBook(
      {
        conditionId: raw.market,
        assetId: raw.asset_id,
        timestamp,
        hash: raw.hash ?? null,
        bids: raw.bids,
        asks: raw.asks,
        lastTradePrice: raw.last_trade_price ?? existing?.lastTradePrice ?? null,
      },
      meta,
    );
    this.books.set(raw.asset_id, book);
    return book;
  }

  private applyChange(
    tokenId: string,
    side: Side,
    price: number,
    size: number,
    at: number,
  ): OrderBook | null {
    const existing = this.books.get(tokenId);
    if (existing === undefined) {
      return null;
    }
    const updated = applyLevelChanges({ ...existing, timestamp: at }, [{ side, price, size }]);
    this.books.set(tokenId, updated);
    return updated;
  }

  private finish(
    books: readonly OrderBook[],
    events: readonly MarketEvent[],
  ): NormalizedMarketUpdate {
    const deduped = new Map<string, OrderBook>();
    for (const book of books) {
      deduped.set(book.tokenId, book);
    }
    const uniqueBooks = [...deduped.values()];
    return {
      books: uniqueBooks,
      events,
      ignored: uniqueBooks.length === 0 && events.length === 0,
    };
  }
}

export class MarketSocket {
  private readonly options: MarketSocketOptions;
  private readonly now: () => number;
  private readonly socketFactory: WebSocketFactory;
  private readonly normalizer: MarketMessageNormalizer;
  private readonly reconnectBaseMs: number;
  private readonly reconnectMaxMs: number;
  private readonly heartbeatMs: number;
  private readonly staleAfterMs: number;
  private tokens: readonly TokenMetadata[];
  private tokenMap: Map<string, TokenMetadata>;
  private socket: WebSocketLike | null = null;
  private connected = false;
  private closedByUser = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private staleTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectAttempt = 0;
  private reconnects = 0;
  private lastMessageAt: number | null = null;
  private error: string | null = null;

  public constructor(options: MarketSocketOptions) {
    this.options = options;
    this.now = options.now ?? Date.now;
    this.socketFactory = options.socketFactory ?? defaultWebSocketFactory;
    this.reconnectBaseMs = Math.max(100, options.reconnectBaseMs ?? 1000);
    this.reconnectMaxMs = Math.max(this.reconnectBaseMs, options.reconnectMaxMs ?? 30_000);
    this.heartbeatMs = Math.max(1000, options.heartbeatMs ?? 10_000);
    this.staleAfterMs = Math.max(this.heartbeatMs * 2, options.staleAfterMs ?? 120_000);
    this.tokens = options.tokens;
    this.tokenMap = new Map(this.tokens.map((token) => [token.tokenId, token]));
    this.normalizer = new MarketMessageNormalizer((tokenId) => this.tokenMap.get(tokenId) ?? null);
  }

  public get isConnected(): boolean {
    return this.connected;
  }

  public get lastMessage(): number | null {
    return this.lastMessageAt;
  }

  public get reconnectCount(): number {
    return this.reconnects;
  }

  public get lastError(): string | null {
    return this.error;
  }

  public connect(): void {
    if (this.socket !== null) {
      return;
    }
    this.closedByUser = false;
    this.open();
  }

  public close(): void {
    this.closedByUser = true;
    this.clearTimers();
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    const socket = this.socket;
    this.socket = null;
    this.connected = false;
    if (socket !== null) {
      try {
        socket.close(1000, 'client shutdown');
      } catch {
        // Closing an already-closed socket is safe to ignore.
      }
    }
    this.emitStatus();
  }

  public updateTokens(tokens: readonly TokenMetadata[]): void {
    const previous = this.tokenMap;
    const next = new Map(tokens.map((token) => [token.tokenId, token]));
    const added = [...next.keys()].filter((tokenId) => !previous.has(tokenId));
    const removed = [...previous.keys()].filter((tokenId) => !next.has(tokenId));
    this.tokens = tokens;
    this.tokenMap = next;

    if (!this.connected) {
      return;
    }
    if (added.length > 0) {
      this.sendFrame({ assets_ids: added, operation: 'subscribe' });
    }
    if (removed.length > 0) {
      this.sendFrame({ assets_ids: removed, operation: 'unsubscribe' });
    }
  }

  public forceReconnect(): void {
    if (this.socket === null) {
      this.open();
      return;
    }
    try {
      this.socket.close(4000, 'forced reconnect');
    } catch {
      // The close handler will schedule the reconnect.
    }
  }

  private open(): void {
    if (this.closedByUser) {
      return;
    }
    this.emitStatus();
    let socket: WebSocketLike;
    try {
      socket = this.socketFactory(this.options.url);
    } catch (error) {
      this.error = errorMessage(error);
      this.emitStatus();
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;
    this.error = null;

    socket.addEventListener('open', () => {
      if (this.socket !== socket) {
        return;
      }
      this.connected = true;
      this.reconnectAttempt = 0;
      this.error = null;
      this.sendFrame({ assets_ids: this.tokens.map((token) => token.tokenId), type: 'market' });
      this.startTimers();
      this.emitStatus();
    });

    socket.addEventListener('message', (event) => {
      if (this.socket !== socket) {
        return;
      }
      const raw = (event as { data?: unknown }).data;
      if (raw === 'PONG' || raw === 'pong') {
        return;
      }
      this.lastMessageAt = this.now();
      let payload: unknown;
      try {
        payload = typeof raw === 'string' ? JSON.parse(raw) : raw;
      } catch {
        return;
      }
      const update = this.normalizer.ingest(payload, this.lastMessageAt);
      for (const book of update.books) {
        this.options.onBook(book);
      }
      if (this.options.onEvent !== undefined) {
        for (const marketEvent of update.events) {
          this.options.onEvent(marketEvent);
        }
      }
    });

    socket.addEventListener('error', (event) => {
      if (this.socket !== socket) {
        return;
      }
      const error = (event as { message?: unknown }).message;
      this.error = typeof error === 'string' ? error : 'websocket error';
      this.emitStatus();
    });

    socket.addEventListener('close', () => {
      if (this.socket !== socket) {
        return;
      }
      this.connected = false;
      this.socket = null;
      this.clearTimers();
      this.emitStatus();
      if (!this.closedByUser) {
        this.scheduleReconnect();
      }
    });
  }

  private startTimers(): void {
    this.clearTimers();
    this.heartbeatTimer = setInterval(() => {
      this.sendRaw('PING');
    }, this.heartbeatMs);
    this.staleTimer = setInterval(() => {
      if (!this.connected) {
        return;
      }
      if (this.lastMessageAt === null) {
        return;
      }
      if (this.now() - this.lastMessageAt > this.staleAfterMs) {
        this.forceReconnect();
      }
    }, this.heartbeatMs);
  }

  private clearTimers(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.staleTimer !== null) {
      clearInterval(this.staleTimer);
      this.staleTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.closedByUser || this.reconnectTimer !== null) {
      return;
    }
    const delay = Math.min(this.reconnectMaxMs, this.reconnectBaseMs * 2 ** this.reconnectAttempt);
    this.reconnectAttempt += 1;
    this.reconnects += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.closedByUser) {
        this.open();
      }
    }, delay);
  }

  private sendFrame(frame: Readonly<Record<string, unknown>>): void {
    this.sendRaw(JSON.stringify(frame));
  }

  private sendRaw(data: string): void {
    const socket = this.socket;
    if (socket === null || socket.readyState !== OPEN) {
      return;
    }
    try {
      socket.send(data);
    } catch (error) {
      this.error = errorMessage(error);
    }
  }

  private emitStatus(): void {
    this.options.onStatus?.({
      connected: this.connected,
      lastMessageAt: this.lastMessageAt,
      reconnectCount: this.reconnects,
      error: this.error,
    });
  }
}

export type { BookLevel, MarketEvent, NormalizedMarketUpdate };
