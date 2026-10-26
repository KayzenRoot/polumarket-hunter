import { roundMoney, roundPrice, roundSize } from './money.js';
import type { Outcome, PortfolioSnapshot, Position, Side, Trade } from './types.js';

export interface PortfolioState {
  readonly startingCash: number;
  readonly cash: number;
  readonly realizedPnl: number;
  readonly positions: ReadonlyMap<string, Position>;
  readonly updatedAt: number;
}

export interface FillInput {
  readonly marketId: string;
  readonly tokenId: string;
  readonly outcome: Outcome;
  readonly side: Side;
  readonly price: number;
  readonly size: number;
  readonly fee: number;
}

export interface Settlement {
  readonly marketId: string;
  readonly tokenId: string;
  readonly outcome: Outcome;
  readonly shares: number;
  readonly avgPrice: number;
  readonly payout: number;
  readonly realizedPnl: number;
}

export class InsufficientCashError extends Error {
  public constructor(required: number, available: number) {
    super(`insufficient cash: required ${required.toFixed(2)}, available ${available.toFixed(2)}`);
    this.name = 'InsufficientCashError';
  }
}

export class InsufficientPositionError extends Error {
  public constructor(required: number, available: number) {
    super(
      `insufficient position: required ${required.toFixed(2)}, available ${available.toFixed(2)}`,
    );
    this.name = 'InsufficientPositionError';
  }
}

export function createPortfolio(startingCash: number, now: number): PortfolioState {
  const cash = roundMoney(Math.max(0, startingCash));
  return {
    startingCash: cash,
    cash,
    realizedPnl: 0,
    positions: new Map(),
    updatedAt: now,
  };
}

export function getPosition(state: PortfolioState, tokenId: string): Position | null {
  return state.positions.get(tokenId) ?? null;
}

export function positionsList(state: PortfolioState): Position[] {
  return [...state.positions.values()].sort((left, right) => {
    if (left.marketId === right.marketId) {
      return left.tokenId.localeCompare(right.tokenId);
    }
    return left.marketId.localeCompare(right.marketId);
  });
}

export function applyFill(
  state: PortfolioState,
  fill: FillInput,
  now: number,
): { state: PortfolioState; realizedPnl: number } {
  const size = roundSize(fill.size);
  if (size <= 0) {
    throw new Error('fill size must be positive');
  }
  const price = roundPrice(fill.price);
  const fee = roundMoney(Math.max(0, fill.fee));
  const gross = roundMoney(price * size);
  const positions = new Map(state.positions);
  const existing = positions.get(fill.tokenId);

  if (fill.side === 'BUY') {
    const cost = roundMoney(gross + fee);
    if (cost > state.cash) {
      throw new InsufficientCashError(cost, state.cash);
    }

    const previousShares = existing?.shares ?? 0;
    const previousAvg = existing?.avgPrice ?? 0;
    const nextShares = roundSize(previousShares + size);
    const costBasis = roundMoney(previousAvg * previousShares + gross + fee);
    const avgPrice = nextShares > 0 ? roundPrice(costBasis / nextShares) : price;
    const openedAt = existing?.openedAt ?? now;

    positions.set(fill.tokenId, {
      marketId: fill.marketId,
      tokenId: fill.tokenId,
      outcome: fill.outcome,
      shares: nextShares,
      avgPrice,
      openedAt,
      updatedAt: now,
    });

    return {
      state: {
        ...state,
        cash: roundMoney(state.cash - cost),
        positions,
        updatedAt: now,
      },
      realizedPnl: 0,
    };
  }

  const available = existing?.shares ?? 0;
  if (size > available) {
    throw new InsufficientPositionError(size, available);
  }

  const proceeds = roundMoney(gross - fee);
  const realizedPnl = roundMoney((price - (existing?.avgPrice ?? 0)) * size - fee);
  const nextShares = roundSize(available - size);

  if (nextShares <= 0) {
    positions.delete(fill.tokenId);
  } else if (existing !== undefined) {
    positions.set(fill.tokenId, {
      ...existing,
      shares: nextShares,
      updatedAt: now,
    });
  }

  return {
    state: {
      ...state,
      cash: roundMoney(state.cash + proceeds),
      realizedPnl: roundMoney(state.realizedPnl + realizedPnl),
      positions,
      updatedAt: now,
    },
    realizedPnl,
  };
}

export function markPortfolio(
  state: PortfolioState,
  marks: ReadonlyMap<string, number>,
  now: number,
  reservedCash = 0,
  openOrders = 0,
): PortfolioSnapshot {
  let exposure = 0;
  let unrealized = 0;

  for (const position of state.positions.values()) {
    const mark = marks.get(position.tokenId) ?? position.avgPrice;
    exposure += mark * position.shares;
    unrealized += (mark - position.avgPrice) * position.shares;
  }

  exposure = roundMoney(exposure);
  unrealized = roundMoney(unrealized);
  const equity = roundMoney(state.cash + exposure);

  return {
    startingCash: state.startingCash,
    cash: state.cash,
    reservedCash: roundMoney(reservedCash),
    equity,
    exposure,
    realizedPnl: state.realizedPnl,
    unrealizedPnl: unrealized,
    totalPnl: roundMoney(equity - state.startingCash),
    positions: positionsList(state),
    openOrders,
    updatedAt: now,
  };
}

export function settleMarket(
  state: PortfolioState,
  marketId: string,
  winningTokenId: string,
  now: number,
): { state: PortfolioState; settlements: readonly Settlement[] } {
  const positions = new Map(state.positions);
  const settlements: Settlement[] = [];
  let cash = state.cash;
  let realizedPnl = state.realizedPnl;

  for (const position of state.positions.values()) {
    if (position.marketId !== marketId) {
      continue;
    }

    const payout = position.tokenId === winningTokenId ? roundMoney(position.shares) : 0;
    const positionRealized = roundMoney(payout - position.avgPrice * position.shares);
    cash = roundMoney(cash + payout);
    realizedPnl = roundMoney(realizedPnl + positionRealized);
    settlements.push({
      marketId,
      tokenId: position.tokenId,
      outcome: position.outcome,
      shares: position.shares,
      avgPrice: position.avgPrice,
      payout,
      realizedPnl: positionRealized,
    });
    positions.delete(position.tokenId);
  }

  return {
    state: {
      ...state,
      cash,
      realizedPnl,
      positions,
      updatedAt: now,
    },
    settlements,
  };
}

export function tradePnl(trade: Trade): number {
  return trade.side === 'SELL' ? trade.realizedPnl : 0;
}
