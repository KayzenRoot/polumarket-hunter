import { feeFor, feeForSchedule, roundMoney, roundPrice, roundSize } from './money.js';
import { normalizeBook, topOfBook, walkBook } from './orderbook.js';
import {
  applyFill,
  createPortfolio,
  getPosition,
  InsufficientCashError,
  InsufficientPositionError,
  markPortfolio,
  type PortfolioState,
  positionsList,
  settleMarket,
} from './portfolio.js';
import type {
  FeeSchedule,
  LiquidityRole,
  OrderBook,
  OrderRequest,
  PaperOrder,
  PortfolioSnapshot,
  Position,
  Side,
  Trade,
} from './types.js';

export interface PaperBrokerOptions {
  readonly startingCash: number;
  readonly feeBps: number;
  readonly now: () => number;
  readonly idFactory?: (prefix: string) => string;
  readonly maxSlippage?: number;
  readonly feeScheduleForMarket?: (marketId: string) => FeeSchedule | null;
}

export interface PlaceResult {
  readonly order: PaperOrder;
  readonly fills: readonly Trade[];
}

interface FillResult {
  readonly order: PaperOrder;
  readonly trade: Trade;
}

let fallbackId = 0;

function defaultIdFactory(prefix: string): string {
  fallbackId += 1;
  return `${prefix}_${Date.now().toString(36)}_${fallbackId.toString(36)}`;
}

function withStatus(
  order: PaperOrder,
  status: PaperOrder['status'],
  reason: string | null,
  now: number,
): PaperOrder {
  return {
    ...order,
    status,
    rejectionReason: reason,
    updatedAt: now,
  };
}

function remainingOf(order: PaperOrder): number {
  return roundSize(order.size - order.filledSize);
}

export class PaperBroker {
  private state: PortfolioState;
  private readonly orders = new Map<string, PaperOrder>();
  private readonly tradeLog: Trade[] = [];
  private readonly feeBps: number;
  private readonly now: () => number;
  private readonly idFactory: (prefix: string) => string;
  private readonly maxSlippage: number;
  private readonly feeScheduleForMarket: (marketId: string) => FeeSchedule | null;

  public constructor(options: PaperBrokerOptions) {
    this.state = createPortfolio(options.startingCash, options.now());
    this.feeBps = Math.max(0, options.feeBps);
    this.now = options.now;
    this.idFactory = options.idFactory ?? defaultIdFactory;
    this.maxSlippage = Math.max(0, options.maxSlippage ?? 0.005);
    this.feeScheduleForMarket = options.feeScheduleForMarket ?? (() => null);
  }

  public get trades(): readonly Trade[] {
    return this.tradeLog;
  }

  public get openOrders(): readonly PaperOrder[] {
    return [...this.orders.values()]
      .filter((order) => order.status === 'open')
      .sort((left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id));
  }

  public get portfolioState(): PortfolioState {
    return this.state;
  }

  public positionForToken(tokenId: string): Position | null {
    return getPosition(this.state, tokenId);
  }

  public positions(): readonly Position[] {
    return positionsList(this.state);
  }

  public hasOpenOrder(tokenId: string, side: Side): boolean {
    return [...this.orders.values()].some(
      (order) => order.status === 'open' && order.tokenId === tokenId && order.side === side,
    );
  }

  public place(request: OrderRequest, book?: OrderBook): PlaceResult {
    const now = this.now();
    const size = roundSize(request.size);
    const limitPrice = request.limitPrice === null ? null : roundPrice(request.limitPrice);
    const base: PaperOrder = {
      id: this.idFactory('ord'),
      marketId: request.marketId,
      tokenId: request.tokenId,
      outcome: request.outcome,
      side: request.side,
      type: request.type,
      limitPrice,
      size,
      filledSize: 0,
      avgFillPrice: 0,
      fee: 0,
      status: 'open',
      reason: request.reason,
      rejectionReason: null,
      createdAt: now,
      updatedAt: now,
    };

    if (size <= 0) {
      return { order: withStatus(base, 'rejected', 'order size must be positive', now), fills: [] };
    }
    if (limitPrice !== null && (limitPrice <= 0 || limitPrice >= 1)) {
      return {
        order: withStatus(base, 'rejected', 'limit price must be between 0 and 1', now),
        fills: [],
      };
    }
    if (request.type === 'limit' && limitPrice === null) {
      return {
        order: withStatus(base, 'rejected', 'limit order requires a limit price', now),
        fills: [],
      };
    }
    if (request.type === 'market' && book === undefined) {
      return {
        order: withStatus(base, 'rejected', 'market order requires an order book', now),
        fills: [],
      };
    }

    const price = limitPrice ?? (book === undefined ? 0 : this.referencePrice(book, request.side));
    const marketable =
      request.type === 'market' ||
      (book !== undefined && limitPrice !== null && this.isMarketable(base, book));
    const liquidity: LiquidityRole = marketable ? 'taker' : 'maker';
    if (request.side === 'BUY') {
      const cost = roundMoney(
        price * size + this.feeForFill(base.marketId, price, size, liquidity),
      );
      const available = roundMoney(this.state.cash - this.reservedCash());
      if (cost > available) {
        return {
          order: withStatus(
            base,
            'rejected',
            `insufficient cash: need ${cost.toFixed(2)}, have ${available.toFixed(2)}`,
            now,
          ),
          fills: [],
        };
      }
    } else {
      const position = getPosition(this.state, request.tokenId);
      const available = roundSize((position?.shares ?? 0) - this.reservedShares(request.tokenId));
      if (size > available) {
        return {
          order: withStatus(
            base,
            'rejected',
            `insufficient position: need ${size}, have ${available}`,
            now,
          ),
          fills: [],
        };
      }
    }

    if (request.type === 'market' && book !== undefined) {
      return this.executeMarket(base, book);
    }

    if (book !== undefined && limitPrice !== null && this.isMarketable(base, book)) {
      const result = this.fillAgainstBook(base, book, 'taker');
      return { order: result.order, fills: result.fills };
    }

    this.orders.set(base.id, base);
    return { order: base, fills: [] };
  }

  public cancel(orderId: string, reason = 'cancelled'): PaperOrder | null {
    const order = this.orders.get(orderId);
    if (order === undefined || order.status !== 'open') {
      return null;
    }
    const cancelled = withStatus(order, 'cancelled', reason, this.now());
    this.orders.delete(orderId);
    return cancelled;
  }

  public cancelAll(reason: string): readonly PaperOrder[] {
    const cancelled: PaperOrder[] = [];
    for (const order of [...this.orders.values()]) {
      const result = this.cancel(order.id, reason);
      if (result !== null) {
        cancelled.push(result);
      }
    }
    return cancelled;
  }

  public onBook(rawBook: OrderBook): readonly Trade[] {
    const book = normalizeBook(rawBook);
    const fills: Trade[] = [];
    for (const order of [...this.orders.values()]) {
      if (order.status !== 'open' || order.tokenId !== book.tokenId) {
        continue;
      }
      const top = topOfBook(book);
      if (top === null || order.limitPrice === null) {
        continue;
      }
      const marketable =
        order.side === 'BUY' ? top.ask <= order.limitPrice : top.bid >= order.limitPrice;
      if (!marketable) {
        continue;
      }
      const result = this.fillAgainstBook(order, book, 'maker');
      fills.push(...result.fills);
    }
    return fills;
  }

  public mark(marks: ReadonlyMap<string, number>): PortfolioSnapshot {
    return markPortfolio(
      this.state,
      marks,
      this.now(),
      this.reservedCash(),
      this.openOrders.length,
    );
  }

  public settle(marketId: string, winningTokenId: string): readonly Trade[] {
    const now = this.now();
    const result = settleMarket(this.state, marketId, winningTokenId, now);
    this.state = result.state;
    this.cancelAllForMarket(marketId, 'market settled');

    const trades: Trade[] = result.settlements.map((settlement) => ({
      id: this.idFactory('trd'),
      at: now,
      marketId: settlement.marketId,
      tokenId: settlement.tokenId,
      outcome: settlement.outcome,
      side: 'SELL',
      price: settlement.shares > 0 ? roundPrice(settlement.payout / settlement.shares) : 0,
      size: settlement.shares,
      notional: settlement.payout,
      fee: 0,
      realizedPnl: settlement.realizedPnl,
      orderId: 'settlement',
      mode: 'paper',
    }));
    this.tradeLog.push(...trades);
    return trades;
  }

  private feeForFill(
    marketId: string,
    price: number,
    shares: number,
    liquidity: LiquidityRole,
  ): number {
    const schedule = this.feeScheduleForMarket(marketId);
    if (schedule !== null) {
      return feeForSchedule(shares, price, schedule, liquidity);
    }
    return feeFor(roundMoney(price * shares), this.feeBps);
  }

  private referencePrice(book: OrderBook, side: Side): number {
    const top = topOfBook(book);
    if (top === null) {
      return 0;
    }
    return side === 'BUY' ? top.ask : top.bid;
  }

  private executeMarket(order: PaperOrder, book: OrderBook): PlaceResult {
    const top = topOfBook(book);
    if (top === null) {
      return { order: withStatus(order, 'rejected', 'no liquidity', this.now()), fills: [] };
    }
    const now = this.now();
    const limit =
      order.side === 'BUY'
        ? roundPrice(Math.min(0.9999, top.ask + this.maxSlippage))
        : roundPrice(Math.max(0.0001, top.bid - this.maxSlippage));
    const levels = order.side === 'BUY' ? book.asks : book.bids;
    const walk = walkBook(levels, order.side, order.size, limit);
    if (walk.filled <= 0) {
      return {
        order: withStatus(order, 'rejected', 'no fill within slippage limit', now),
        fills: [],
      };
    }

    const fill = this.executeFill(order, walk.vwap, walk.filled, 'taker');
    if (fill === null) {
      return {
        order: withStatus(order, 'rejected', 'fill rejected by portfolio', now),
        fills: [],
      };
    }

    if (fill.order.filledSize >= fill.order.size) {
      return { order: fill.order, fills: [fill.trade] };
    }

    this.orders.delete(order.id);
    return {
      order: withStatus(fill.order, 'cancelled', 'partial fill (IOC)', now),
      fills: [fill.trade],
    };
  }

  private fillAgainstBook(
    order: PaperOrder,
    rawBook: OrderBook,
    liquidity: LiquidityRole,
  ): { order: PaperOrder; fills: readonly Trade[] } {
    const book = normalizeBook(rawBook);
    const levels = order.side === 'BUY' ? book.asks : book.bids;
    const remaining = remainingOf(order);
    if (remaining <= 0 || order.limitPrice === null) {
      return { order, fills: [] };
    }
    const walk = walkBook(levels, order.side, remaining, order.limitPrice);
    if (walk.filled <= 0) {
      return { order, fills: [] };
    }
    const fill = this.executeFill(order, walk.vwap, walk.filled, liquidity);
    if (fill === null) {
      return { order, fills: [] };
    }
    return { order: fill.order, fills: [fill.trade] };
  }

  private executeFill(
    order: PaperOrder,
    price: number,
    size: number,
    liquidity: LiquidityRole,
  ): FillResult | null {
    const now = this.now();
    const normalizedSize = roundSize(size);
    const normalizedPrice = roundPrice(price);
    if (normalizedSize <= 0 || normalizedPrice <= 0 || normalizedPrice >= 1) {
      return null;
    }

    const gross = roundMoney(normalizedPrice * normalizedSize);
    const fee = this.feeForFill(order.marketId, normalizedPrice, normalizedSize, liquidity);
    const realizedBefore = this.state.realizedPnl;

    try {
      const result = applyFill(
        this.state,
        {
          marketId: order.marketId,
          tokenId: order.tokenId,
          outcome: order.outcome,
          side: order.side,
          price: normalizedPrice,
          size: normalizedSize,
          fee,
        },
        now,
      );
      this.state = result.state;
    } catch (error) {
      if (error instanceof InsufficientCashError || error instanceof InsufficientPositionError) {
        const current = this.orders.get(order.id) ?? order;
        this.orders.set(order.id, withStatus(current, 'rejected', error.message, now));
        return null;
      }
      throw error;
    }

    const realized =
      order.side === 'SELL' ? roundMoney(this.state.realizedPnl - realizedBefore) : 0;
    const trade: Trade = {
      id: this.idFactory('trd'),
      at: now,
      marketId: order.marketId,
      tokenId: order.tokenId,
      outcome: order.outcome,
      side: order.side,
      price: normalizedPrice,
      size: normalizedSize,
      notional: gross,
      fee,
      realizedPnl: realized,
      orderId: order.id,
      mode: 'paper',
    };

    const current = this.orders.get(order.id) ?? order;
    const nextFilled = roundSize(current.filledSize + normalizedSize);
    const nextNotional = roundMoney(current.avgFillPrice * current.filledSize + gross);
    const updated: PaperOrder = {
      ...current,
      filledSize: nextFilled,
      avgFillPrice: nextFilled > 0 ? roundPrice(nextNotional / nextFilled) : 0,
      fee: roundMoney(current.fee + fee),
      status: nextFilled >= current.size ? 'filled' : 'open',
      updatedAt: now,
    };
    this.orders.set(order.id, updated);
    if (updated.status === 'filled') {
      this.orders.delete(order.id);
    }

    this.tradeLog.push(trade);
    return { trade, order: updated };
  }

  private isMarketable(order: PaperOrder, book: OrderBook): boolean {
    const top = topOfBook(book);
    if (top === null || order.limitPrice === null) {
      return false;
    }
    return order.side === 'BUY' ? top.ask <= order.limitPrice : top.bid >= order.limitPrice;
  }

  private reservedCash(): number {
    let total = 0;
    for (const order of this.orders.values()) {
      if (order.status !== 'open' || order.side !== 'BUY' || order.limitPrice === null) {
        continue;
      }
      const remaining = remainingOf(order);
      total +=
        order.limitPrice * remaining +
        this.feeForFill(order.marketId, order.limitPrice, remaining, 'maker');
    }
    return roundMoney(total);
  }

  private reservedShares(tokenId: string): number {
    let total = 0;
    for (const order of this.orders.values()) {
      if (order.status === 'open' && order.side === 'SELL' && order.tokenId === tokenId) {
        total += remainingOf(order);
      }
    }
    return roundSize(total);
  }

  private cancelAllForMarket(marketId: string, reason: string): void {
    for (const order of [...this.orders.values()]) {
      if (order.marketId === marketId) {
        this.cancel(order.id, reason);
      }
    }
  }
}
