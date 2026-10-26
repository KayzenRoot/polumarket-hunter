import { clamp01, roundPrice, roundSize, roundToTick, sizeForNotional } from './money.js';
import {
  type BookUsability,
  depthShares,
  isBookUsable,
  orderBookImbalance,
  topOfBook,
} from './orderbook.js';
import type {
  OrderBook,
  Outcome,
  Position,
  Strategy,
  StrategyAction,
  StrategyConfig,
  StrategyContext,
  StrategyIntent,
  StrategyKind,
  TopOfBook,
} from './types.js';

export const DEFAULT_STRATEGY_CONFIG: StrategyConfig = {
  minEdge: 0.006,
  minImbalance: 0.15,
  maxSpread: 0.035,
  minDepthShares: 100,
  maxBookAgeMs: 5000,
  cooldownMs: 2500,
  takeProfitEdge: 0.012,
  stopLossEdge: 0.015,
  orderNotional: 10,
  tickSize: 0.01,
  momentumHorizon: 6,
};

const MOMENTUM_FAST_ALPHA = 0.35;
const MOMENTUM_SLOW_ALPHA = 0.08;

function hold(
  book: OrderBook,
  top: TopOfBook | null,
  fairValue: number,
  edge: number,
  confidence: number,
  reasons: readonly string[],
  createdAt: number,
): StrategyIntent {
  return {
    action: 'HOLD',
    tokenId: book.tokenId,
    marketId: book.marketId,
    outcome: book.outcome,
    price: 0,
    size: 0,
    fairValue: top === null ? 0 : fairValue,
    edge,
    confidence,
    reasons,
    createdAt,
  };
}

function confidenceFor(
  edge: number,
  imbalance: number,
  depth: number,
  config: StrategyConfig,
): number {
  const edgeScore = config.minEdge > 0 ? clamp01(edge / (config.minEdge * 3)) : 0;
  const imbalanceScore =
    config.minImbalance > 0 ? clamp01(Math.abs(imbalance) / (config.minImbalance * 2)) : 0;
  const depthScore = config.minDepthShares > 0 ? clamp01(depth / (config.minDepthShares * 4)) : 0;
  return roundPrice(edgeScore * 0.45 + imbalanceScore * 0.35 + depthScore * 0.2);
}

function unusable(
  book: OrderBook,
  top: TopOfBook | null,
  fairValue: number,
  createdAt: number,
  usability: BookUsability,
): StrategyIntent {
  return hold(book, top, fairValue, 0, 0, usability.reasons, createdAt);
}

function exitIntent(
  book: OrderBook,
  top: TopOfBook,
  position: Position,
  config: StrategyConfig,
  createdAt: number,
): StrategyIntent | null {
  const pnlPerShare = roundPrice(top.bid - position.avgPrice);
  const size = roundSize(position.shares);

  if (size <= 0) {
    return null;
  }

  if (pnlPerShare <= -config.stopLossEdge) {
    return {
      action: 'TAKE_SELL',
      tokenId: book.tokenId,
      marketId: book.marketId,
      outcome: book.outcome,
      price: top.bid,
      size,
      fairValue: top.microprice,
      edge: pnlPerShare,
      confidence: 1,
      reasons: [
        `stop loss: bid ${top.bid.toFixed(3)} <= avg ${position.avgPrice.toFixed(3)} - ${config.stopLossEdge.toFixed(3)}`,
      ],
      createdAt,
    };
  }

  if (pnlPerShare >= config.takeProfitEdge) {
    return {
      action: 'TAKE_SELL',
      tokenId: book.tokenId,
      marketId: book.marketId,
      outcome: book.outcome,
      price: top.bid,
      size,
      fairValue: top.microprice,
      edge: pnlPerShare,
      confidence: 1,
      reasons: [
        `take profit: bid ${top.bid.toFixed(3)} >= avg ${position.avgPrice.toFixed(3)} + ${config.takeProfitEdge.toFixed(3)}`,
      ],
      createdAt,
    };
  }

  if (top.microprice <= position.avgPrice - config.minEdge) {
    return {
      action: 'TAKE_SELL',
      tokenId: book.tokenId,
      marketId: book.marketId,
      outcome: book.outcome,
      price: top.bid,
      size,
      fairValue: top.microprice,
      edge: pnlPerShare,
      confidence: 0.7,
      reasons: [
        `edge decayed: microprice ${top.microprice.toFixed(4)} < avg ${position.avgPrice.toFixed(3)} - ${config.minEdge}`,
      ],
      createdAt,
    };
  }

  return null;
}

function baseEntryChecks(
  book: OrderBook,
  top: TopOfBook,
  config: StrategyConfig,
  context: StrategyContext,
  side: 'BUY' | 'SELL',
): string[] {
  const reasons: string[] = [];
  if (top.spread > config.maxSpread) {
    reasons.push(`spread ${top.spread.toFixed(4)} > max ${config.maxSpread}`);
  }
  const depth = depthShares(book, side, 3);
  if (depth < config.minDepthShares) {
    reasons.push(`depth ${depth.toFixed(2)} < min ${config.minDepthShares}`);
  }
  if (context.lastEntryAt !== null && context.now - context.lastEntryAt < config.cooldownMs) {
    reasons.push(`cooldown active (${config.cooldownMs}ms)`);
  }
  return reasons;
}

export class MicroMakerStrategy implements Strategy {
  public readonly kind: StrategyKind = 'micro-maker';
  private readonly config: StrategyConfig;

  public constructor(config: StrategyConfig) {
    this.config = config;
  }

  public evaluate(book: OrderBook, context: StrategyContext): StrategyIntent {
    const top = topOfBook(book);
    if (top === null) {
      return hold(book, null, 0, 0, 0, ['order book is empty'], context.now);
    }

    const usability = isBookUsable(book, this.config.maxBookAgeMs, context.now);
    if (!usability.ok) {
      return unusable(book, top, top.microprice, context.now, usability);
    }

    if (context.position !== null && context.position.shares > 0) {
      const exit = exitIntent(book, top, context.position, this.config, context.now);
      if (exit !== null) {
        return exit;
      }
      return hold(
        book,
        top,
        top.microprice,
        roundPrice(top.bid - context.position.avgPrice),
        0.5,
        ['position open; waiting for take-profit, stop or edge decay'],
        context.now,
      );
    }

    const imbalance = orderBookImbalance(top);
    const fair = top.microprice;
    const edgeAtBid = roundPrice(fair - top.bid);
    const depth = depthShares(book, 'BUY', 3);
    const confidence = confidenceFor(edgeAtBid, imbalance, depth, this.config);
    const rejections = baseEntryChecks(book, top, this.config, context, 'BUY');

    if (imbalance < this.config.minImbalance) {
      rejections.push(`imbalance ${imbalance.toFixed(3)} < min ${this.config.minImbalance}`);
    }
    if (edgeAtBid < this.config.minEdge) {
      rejections.push(`edge at bid ${edgeAtBid.toFixed(4)} < min ${this.config.minEdge}`);
    }
    if (rejections.length > 0) {
      return hold(book, top, fair, edgeAtBid, confidence, rejections, context.now);
    }

    const improvedBid = roundToTick(top.bid + this.config.tickSize, this.config.tickSize);
    const price =
      improvedBid < top.ask && roundPrice(fair - improvedBid) >= this.config.minEdge
        ? improvedBid
        : top.bid;
    const size = sizeForNotional(this.config.orderNotional, price);

    if (size <= 0) {
      return hold(
        book,
        top,
        fair,
        edgeAtBid,
        confidence,
        ['order notional is too small for the current price'],
        context.now,
      );
    }

    return {
      action: 'PLACE_BID',
      tokenId: book.tokenId,
      marketId: book.marketId,
      outcome: book.outcome,
      price,
      size,
      fairValue: fair,
      edge: roundPrice(fair - price),
      confidence,
      reasons: [
        `microprice edge ${roundPrice(fair - price).toFixed(4)} >= ${this.config.minEdge}`,
        `imbalance ${imbalance.toFixed(3)} >= ${this.config.minImbalance}`,
        `depth ${depth.toFixed(2)} >= ${this.config.minDepthShares}`,
      ],
      createdAt: context.now,
    };
  }

  public reset(): void {
    // Stateless.
  }
}

interface MomentumState {
  fast: number;
  slow: number;
  initialized: boolean;
}

export class MomentumTakerStrategy implements Strategy {
  public readonly kind: StrategyKind = 'momentum-taker';
  private readonly config: StrategyConfig;
  private readonly states = new Map<string, MomentumState>();

  public constructor(config: StrategyConfig) {
    this.config = config;
  }

  public evaluate(book: OrderBook, context: StrategyContext): StrategyIntent {
    const top = topOfBook(book);
    if (top === null) {
      return hold(book, null, 0, 0, 0, ['order book is empty'], context.now);
    }

    const usability = isBookUsable(book, this.config.maxBookAgeMs, context.now);
    if (!usability.ok) {
      return unusable(book, top, top.microprice, context.now, usability);
    }

    const previous = this.states.get(book.tokenId);
    if (previous === undefined || !previous.initialized) {
      this.states.set(book.tokenId, {
        fast: top.mid,
        slow: top.mid,
        initialized: true,
      });
      return hold(book, top, top.microprice, 0, 0, ['warming up momentum state'], context.now);
    }

    const fast = previous.fast + MOMENTUM_FAST_ALPHA * (top.mid - previous.fast);
    const slow = previous.slow + MOMENTUM_SLOW_ALPHA * (top.mid - previous.slow);
    this.states.set(book.tokenId, { fast, slow, initialized: true });

    const momentum = fast - slow;
    const forecast = roundPrice(top.mid + momentum * this.config.momentumHorizon);
    const imbalance = orderBookImbalance(top);

    if (context.position !== null && context.position.shares > 0) {
      const exit = exitIntent(book, top, context.position, this.config, context.now);
      if (exit !== null) {
        return exit;
      }
      if (forecast < top.bid - this.config.minEdge) {
        return {
          action: 'TAKE_SELL',
          tokenId: book.tokenId,
          marketId: book.marketId,
          outcome: book.outcome,
          price: top.bid,
          size: roundSize(context.position.shares),
          fairValue: forecast,
          edge: roundPrice(top.bid - context.position.avgPrice),
          confidence: 0.65,
          reasons: ['momentum reversed against the open position'],
          createdAt: context.now,
        };
      }
      return hold(
        book,
        top,
        forecast,
        roundPrice(forecast - top.ask),
        0.5,
        ['position open; waiting for exit'],
        context.now,
      );
    }

    const edge = roundPrice(forecast - top.ask);
    const depth = depthShares(book, 'BUY', 3);
    const confidence = confidenceFor(edge, imbalance, depth, this.config);
    const rejections = baseEntryChecks(book, top, this.config, context, 'BUY');

    if (imbalance < this.config.minImbalance) {
      rejections.push(`imbalance ${imbalance.toFixed(3)} < min ${this.config.minImbalance}`);
    }
    if (edge < this.config.minEdge) {
      rejections.push(`forecast edge ${edge.toFixed(4)} < min ${this.config.minEdge}`);
    }
    if (rejections.length > 0) {
      return hold(book, top, forecast, edge, confidence, rejections, context.now);
    }

    const size = sizeForNotional(this.config.orderNotional, top.ask);
    if (size <= 0) {
      return hold(book, top, forecast, edge, confidence, ['order size is zero'], context.now);
    }

    return {
      action: 'TAKE_BUY',
      tokenId: book.tokenId,
      marketId: book.marketId,
      outcome: book.outcome,
      price: top.ask,
      size,
      fairValue: forecast,
      edge,
      confidence,
      reasons: [
        `momentum ${momentum.toFixed(4)} implies forecast ${forecast.toFixed(4)}`,
        `forecast edge ${edge.toFixed(4)} >= ${this.config.minEdge}`,
        `imbalance ${imbalance.toFixed(3)} >= ${this.config.minImbalance}`,
      ],
      createdAt: context.now,
    };
  }

  public reset(tokenId?: string): void {
    if (tokenId === undefined) {
      this.states.clear();
      return;
    }
    this.states.delete(tokenId);
  }
}

export function createStrategy(kind: StrategyKind, config: StrategyConfig): Strategy {
  return kind === 'micro-maker'
    ? new MicroMakerStrategy(config)
    : new MomentumTakerStrategy(config);
}

export function actionToSide(action: StrategyAction): 'BUY' | 'SELL' | null {
  if (action === 'PLACE_BID' || action === 'TAKE_BUY') {
    return 'BUY';
  }
  if (action === 'PLACE_ASK' || action === 'TAKE_SELL') {
    return 'SELL';
  }
  return null;
}

export function outcomeLabel(outcome: Outcome): string {
  return outcome === 'YES' ? 'YES' : 'NO';
}
