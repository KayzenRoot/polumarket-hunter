import type { Outcome } from '@polyhunter/core';

export interface TokenMetadata {
  readonly marketId: string;
  readonly tokenId: string;
  readonly outcome: Outcome;
}

export type TokenResolver = (tokenId: string) => TokenMetadata | null;

export interface RawBook {
  readonly conditionId: string;
  readonly assetId: string;
  readonly timestamp: number;
  readonly hash: string | null;
  readonly bids: readonly { price: number; size: number }[];
  readonly asks: readonly { price: number; size: number }[];
  readonly lastTradePrice: number | null;
}

export interface BookFetchResult {
  readonly token: TokenMetadata;
  readonly book: RawBook | null;
  readonly error: string | null;
}

export type MarketEvent =
  | {
      readonly type: 'last_trade_price';
      readonly tokenId: string;
      readonly price: number;
      readonly size: number;
      readonly side: 'BUY' | 'SELL';
      readonly at: number;
    }
  | {
      readonly type: 'tick_size_change';
      readonly tokenId: string;
      readonly oldTickSize: number;
      readonly newTickSize: number;
      readonly at: number;
    }
  | {
      readonly type: 'market_resolved';
      readonly conditionId: string;
      readonly winningAssetId: string | null;
      readonly winningOutcome: string | null;
      readonly at: number;
    }
  | {
      readonly type: 'best_bid_ask';
      readonly tokenId: string;
      readonly bestBid: number | null;
      readonly bestAsk: number | null;
      readonly spread: number | null;
      readonly at: number;
    }
  | {
      readonly type: 'unknown';
      readonly rawType: string;
      readonly at: number;
    };

export interface NormalizedMarketUpdate {
  readonly books: readonly import('@polyhunter/core').OrderBook[];
  readonly events: readonly MarketEvent[];
  readonly ignored: boolean;
}

export interface SocketStatus {
  readonly connected: boolean;
  readonly lastMessageAt: number | null;
  readonly reconnectCount: number;
  readonly error: string | null;
}

export interface GeoblockResult {
  readonly status: 'ELIGIBLE' | 'BLOCKED' | 'UNKNOWN';
  readonly blocked: boolean | null;
  readonly ip: string | null;
  readonly country: string | null;
  readonly region: string | null;
  readonly checkedAt: number;
  readonly reason: string | null;
}
