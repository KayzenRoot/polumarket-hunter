import { describe, expect, it } from 'vitest';
import {
  applyFill,
  createPortfolio,
  getPosition,
  InsufficientCashError,
  InsufficientPositionError,
  markPortfolio,
  settleMarket,
} from '../src/index.js';

describe('portfolio ledger', () => {
  it('creates a cash-only portfolio', () => {
    const state = createPortfolio(1000, 1_000_000);
    expect(state.cash).toBe(1000);
    expect(state.realizedPnl).toBe(0);
    expect(state.positions.size).toBe(0);
  });

  it('buys a position and includes the fee in the average price', () => {
    const state = createPortfolio(1000, 1_000_000);
    const result = applyFill(
      state,
      {
        marketId: 'market-1',
        tokenId: 'yes-token',
        outcome: 'YES',
        side: 'BUY',
        price: 0.5,
        size: 10,
        fee: 0.01,
      },
      1_000_000,
    );

    expect(result.state.cash).toBe(994.99);
    expect(getPosition(result.state, 'yes-token')?.shares).toBe(10);
    expect(getPosition(result.state, 'yes-token')?.avgPrice).toBe(0.501);
    expect(result.realizedPnl).toBe(0);
  });

  it('averages multiple buys', () => {
    let state = createPortfolio(1000, 1_000_000);
    state = applyFill(
      state,
      {
        marketId: 'market-1',
        tokenId: 'yes-token',
        outcome: 'YES',
        side: 'BUY',
        price: 0.4,
        size: 10,
        fee: 0,
      },
      1_000_000,
    ).state;
    state = applyFill(
      state,
      {
        marketId: 'market-1',
        tokenId: 'yes-token',
        outcome: 'YES',
        side: 'BUY',
        price: 0.6,
        size: 10,
        fee: 0,
      },
      1_000_000,
    ).state;

    expect(getPosition(state, 'yes-token')?.avgPrice).toBe(0.5);
    expect(getPosition(state, 'yes-token')?.shares).toBe(20);
  });

  it('sells a position and realizes net profit', () => {
    let state = createPortfolio(1000, 1_000_000);
    state = applyFill(
      state,
      {
        marketId: 'market-1',
        tokenId: 'yes-token',
        outcome: 'YES',
        side: 'BUY',
        price: 0.5,
        size: 10,
        fee: 0,
      },
      1_000_000,
    ).state;
    const result = applyFill(
      state,
      {
        marketId: 'market-1',
        tokenId: 'yes-token',
        outcome: 'YES',
        side: 'SELL',
        price: 0.6,
        size: 10,
        fee: 0.02,
      },
      1_000_000,
    );

    expect(result.realizedPnl).toBe(0.98);
    expect(result.state.cash).toBe(1000.98);
    expect(getPosition(result.state, 'yes-token')).toBeNull();
  });

  it('keeps a partial position after a partial sell', () => {
    let state = createPortfolio(1000, 1_000_000);
    state = applyFill(
      state,
      {
        marketId: 'market-1',
        tokenId: 'yes-token',
        outcome: 'YES',
        side: 'BUY',
        price: 0.5,
        size: 10,
        fee: 0,
      },
      1_000_000,
    ).state;
    const result = applyFill(
      state,
      {
        marketId: 'market-1',
        tokenId: 'yes-token',
        outcome: 'YES',
        side: 'SELL',
        price: 0.55,
        size: 4,
        fee: 0,
      },
      1_000_000,
    );

    expect(getPosition(result.state, 'yes-token')?.shares).toBe(6);
    expect(result.realizedPnl).toBe(0.2);
  });

  it('rejects a buy without cash', () => {
    const state = createPortfolio(1, 1_000_000);
    expect(() =>
      applyFill(
        state,
        {
          marketId: 'market-1',
          tokenId: 'yes-token',
          outcome: 'YES',
          side: 'BUY',
          price: 0.5,
          size: 10,
          fee: 0,
        },
        1_000_000,
      ),
    ).toThrow(InsufficientCashError);
  });

  it('rejects a sell without shares', () => {
    const state = createPortfolio(1000, 1_000_000);
    expect(() =>
      applyFill(
        state,
        {
          marketId: 'market-1',
          tokenId: 'yes-token',
          outcome: 'YES',
          side: 'SELL',
          price: 0.5,
          size: 10,
          fee: 0,
        },
        1_000_000,
      ),
    ).toThrow(InsufficientPositionError);
  });

  it('marks a portfolio to market', () => {
    let state = createPortfolio(1000, 1_000_000);
    state = applyFill(
      state,
      {
        marketId: 'market-1',
        tokenId: 'yes-token',
        outcome: 'YES',
        side: 'BUY',
        price: 0.5,
        size: 10,
        fee: 0,
      },
      1_000_000,
    ).state;
    const snapshot = markPortfolio(state, new Map([['yes-token', 0.6]]), 1_000_000, 2, 1);

    expect(snapshot.equity).toBe(1001);
    expect(snapshot.exposure).toBe(6);
    expect(snapshot.unrealizedPnl).toBe(1);
    expect(snapshot.totalPnl).toBe(1);
    expect(snapshot.reservedCash).toBe(2);
    expect(snapshot.openOrders).toBe(1);
  });

  it('settles a winning token at 1 and a losing token at 0', () => {
    let state = createPortfolio(1000, 1_000_000);
    state = applyFill(
      state,
      {
        marketId: 'market-1',
        tokenId: 'yes-token',
        outcome: 'YES',
        side: 'BUY',
        price: 0.4,
        size: 10,
        fee: 0,
      },
      1_000_000,
    ).state;
    state = applyFill(
      state,
      {
        marketId: 'market-1',
        tokenId: 'no-token',
        outcome: 'NO',
        side: 'BUY',
        price: 0.6,
        size: 10,
        fee: 0,
      },
      1_000_000,
    ).state;

    const result = settleMarket(state, 'market-1', 'yes-token', 1_000_000);

    expect(result.settlements).toHaveLength(2);
    expect(result.state.cash).toBe(1000);
    expect(result.state.realizedPnl).toBe(0);
    expect(result.state.positions.size).toBe(0);
  });
});
