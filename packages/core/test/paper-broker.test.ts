import { makeBook, makeClock } from '@polyhunter/testkit';
import { describe, expect, it } from 'vitest';
import { type FeeSchedule, PaperBroker } from '../src/index.js';

function broker(startingCash = 1000, feeBps = 0, feeSchedule: FeeSchedule | null = null) {
  const clock = makeClock();
  let counter = 0;
  const instance = new PaperBroker({
    startingCash,
    feeBps,
    now: clock.now,
    idFactory: (prefix) => {
      counter += 1;
      return `${prefix}-${counter}`;
    },
    maxSlippage: 0.02,
    ...(feeSchedule === null ? {} : { feeScheduleForMarket: () => feeSchedule }),
  });
  return { broker: instance, clock };
}

describe('paper broker', () => {
  it('places a resting limit order and fills it when the ask crosses', () => {
    const { broker: instance } = broker();
    const placed = instance.place({
      marketId: 'market-1',
      tokenId: 'yes-token',
      outcome: 'YES',
      side: 'BUY',
      type: 'limit',
      limitPrice: 0.48,
      size: 10,
      reason: 'test',
    });

    expect(placed.order.status).toBe('open');
    expect(instance.openOrders).toHaveLength(1);

    const fills = instance.onBook(
      makeBook({
        asks: [{ price: 0.47, size: 100 }],
        bids: [{ price: 0.45, size: 100 }],
      }),
    );

    expect(fills).toHaveLength(1);
    expect(fills[0]?.price).toBe(0.47);
    expect(fills[0]?.size).toBe(10);
    expect(instance.positionForToken('yes-token')?.shares).toBe(10);
    expect(instance.openOrders).toHaveLength(0);
  });

  it('charges the venue taker curve on market orders only', () => {
    const schedule: FeeSchedule = { rate: 0.07, exponent: 1, takerOnly: true, rebateRate: 0 };
    const { broker: instance } = broker(1000, 0, schedule);
    const book = makeBook({
      asks: [{ price: 0.5, size: 1000 }],
      bids: [{ price: 0.48, size: 1000 }],
    });
    const taker = instance.place(
      {
        marketId: 'market-1',
        tokenId: 'yes-token',
        outcome: 'YES',
        side: 'BUY',
        type: 'market',
        limitPrice: null,
        size: 100,
        reason: 'test',
      },
      book,
    );
    expect(taker.fills[0]?.fee).toBe(1.75);
    expect(instance.trades[0]?.fee).toBe(1.75);

    const { broker: makerBroker } = broker(1000, 0, schedule);
    makerBroker.place({
      marketId: 'market-1',
      tokenId: 'yes-token',
      outcome: 'YES',
      side: 'BUY',
      type: 'limit',
      limitPrice: 0.48,
      size: 100,
      reason: 'test',
    });
    const fills = makerBroker.onBook(
      makeBook({ asks: [{ price: 0.47, size: 1000 }], bids: [{ price: 0.45, size: 1000 }] }),
    );
    expect(fills[0]?.fee).toBe(0);
  });

  it('falls back to flat bps when the market schedule is missing', () => {
    const { broker: instance } = broker(1000, 100);
    const result = instance.place(
      {
        marketId: 'market-unknown',
        tokenId: 'yes-token',
        outcome: 'YES',
        side: 'BUY',
        type: 'market',
        limitPrice: null,
        size: 100,
        reason: 'test',
      },
      makeBook({ asks: [{ price: 0.5, size: 1000 }], bids: [{ price: 0.48, size: 1000 }] }),
    );
    expect(result.fills[0]?.fee).toBe(0.5);
  });

  it('keeps a partially filled order open', () => {
    const { broker: instance } = broker();
    instance.place({
      marketId: 'market-1',
      tokenId: 'yes-token',
      outcome: 'YES',
      side: 'BUY',
      type: 'limit',
      limitPrice: 0.48,
      size: 20,
      reason: 'test',
    });

    const first = instance.onBook(
      makeBook({ asks: [{ price: 0.47, size: 5 }], bids: [{ price: 0.45, size: 100 }] }),
    );
    expect(first[0]?.size).toBe(5);
    expect(instance.openOrders).toHaveLength(1);
    expect(instance.openOrders[0]?.filledSize).toBe(5);

    const second = instance.onBook(
      makeBook({ asks: [{ price: 0.47, size: 20 }], bids: [{ price: 0.45, size: 100 }] }),
    );
    expect(second[0]?.size).toBe(15);
    expect(instance.openOrders).toHaveLength(0);
    expect(instance.positionForToken('yes-token')?.shares).toBe(20);
  });

  it('rejects a buy without cash', () => {
    const { broker: instance } = broker(5);
    const result = instance.place({
      marketId: 'market-1',
      tokenId: 'yes-token',
      outcome: 'YES',
      side: 'BUY',
      type: 'limit',
      limitPrice: 0.48,
      size: 20,
      reason: 'test',
    });

    expect(result.order.status).toBe('rejected');
    expect(result.order.rejectionReason).toContain('insufficient cash');
  });

  it('rejects a sell without a position', () => {
    const { broker: instance } = broker();
    const result = instance.place({
      marketId: 'market-1',
      tokenId: 'yes-token',
      outcome: 'YES',
      side: 'SELL',
      type: 'limit',
      limitPrice: 0.55,
      size: 10,
      reason: 'test',
    });

    expect(result.order.status).toBe('rejected');
    expect(result.order.rejectionReason).toContain('insufficient position');
  });

  it('executes a market buy across levels within slippage', () => {
    const { broker: instance } = broker();
    const result = instance.place(
      {
        marketId: 'market-1',
        tokenId: 'yes-token',
        outcome: 'YES',
        side: 'BUY',
        type: 'market',
        limitPrice: null,
        size: 15,
        reason: 'test',
      },
      makeBook({
        asks: [
          { price: 0.5, size: 10 },
          { price: 0.51, size: 10 },
        ],
        bids: [{ price: 0.48, size: 100 }],
      }),
    );

    expect(result.order.status).toBe('filled');
    expect(result.fills).toHaveLength(1);
    expect(result.fills[0]?.size).toBe(15);
    expect(result.fills[0]?.price).toBeCloseTo(0.5033, 4);
  });

  it('marks a partial market order as an IOC cancellation', () => {
    const { broker: instance } = broker();
    const result = instance.place(
      {
        marketId: 'market-1',
        tokenId: 'yes-token',
        outcome: 'YES',
        side: 'BUY',
        type: 'market',
        limitPrice: null,
        size: 30,
        reason: 'test',
      },
      makeBook({
        asks: [
          { price: 0.5, size: 10 },
          { price: 0.6, size: 10 },
        ],
        bids: [{ price: 0.48, size: 100 }],
      }),
    );

    expect(result.order.status).toBe('cancelled');
    expect(result.order.rejectionReason).toContain('partial fill');
    expect(result.fills[0]?.size).toBe(10);
  });

  it('reserves cash for resting buys', () => {
    const { broker: instance } = broker(10);
    const first = instance.place({
      marketId: 'market-1',
      tokenId: 'yes-token',
      outcome: 'YES',
      side: 'BUY',
      type: 'limit',
      limitPrice: 0.5,
      size: 10,
      reason: 'first',
    });
    const second = instance.place({
      marketId: 'market-2',
      tokenId: 'other-token',
      outcome: 'YES',
      side: 'BUY',
      type: 'limit',
      limitPrice: 0.5,
      size: 10,
      reason: 'second',
    });
    const third = instance.place({
      marketId: 'market-3',
      tokenId: 'third-token',
      outcome: 'YES',
      side: 'BUY',
      type: 'limit',
      limitPrice: 0.5,
      size: 10,
      reason: 'third',
    });

    expect(first.order.status).toBe('open');
    expect(second.order.status).toBe('open');
    expect(third.order.status).toBe('rejected');
    expect(instance.mark(new Map()).reservedCash).toBe(10);
  });

  it('cancels a resting order', () => {
    const { broker: instance } = broker();
    const placed = instance.place({
      marketId: 'market-1',
      tokenId: 'yes-token',
      outcome: 'YES',
      side: 'BUY',
      type: 'limit',
      limitPrice: 0.48,
      size: 10,
      reason: 'test',
    });

    const cancelled = instance.cancel(placed.order.id, 'operator');
    expect(cancelled?.status).toBe('cancelled');
    expect(instance.openOrders).toHaveLength(0);
    expect(instance.cancel(placed.order.id)).toBeNull();
  });

  it('fills a resting sell when the bid rises through the limit', () => {
    const { broker: instance } = broker();
    instance.place(
      {
        marketId: 'market-1',
        tokenId: 'yes-token',
        outcome: 'YES',
        side: 'BUY',
        type: 'market',
        limitPrice: null,
        size: 10,
        reason: 'buy',
      },
      makeBook({
        asks: [{ price: 0.5, size: 100 }],
        bids: [{ price: 0.48, size: 100 }],
      }),
    );

    const sell = instance.place({
      marketId: 'market-1',
      tokenId: 'yes-token',
      outcome: 'YES',
      side: 'SELL',
      type: 'limit',
      limitPrice: 0.55,
      size: 10,
      reason: 'sell',
    });
    expect(sell.order.status).toBe('open');

    const fills = instance.onBook(
      makeBook({
        bids: [{ price: 0.56, size: 100 }],
        asks: [{ price: 0.58, size: 100 }],
      }),
    );
    expect(fills[0]?.price).toBe(0.56);
    expect(fills[0]?.realizedPnl).toBe(0.6);
    expect(instance.positionForToken('yes-token')).toBeNull();
  });

  it('charges fees on fills', () => {
    const { broker: instance } = broker(1000, 100);
    const result = instance.place(
      {
        marketId: 'market-1',
        tokenId: 'yes-token',
        outcome: 'YES',
        side: 'BUY',
        type: 'market',
        limitPrice: null,
        size: 10,
        reason: 'test',
      },
      makeBook({
        asks: [{ price: 0.5, size: 100 }],
        bids: [{ price: 0.48, size: 100 }],
      }),
    );

    expect(result.fills[0]?.fee).toBe(0.05);
    expect(instance.mark(new Map()).cash).toBe(994.95);
  });

  it('settles a winning position at one dollar per share', () => {
    const { broker: instance } = broker();
    instance.place(
      {
        marketId: 'market-1',
        tokenId: 'yes-token',
        outcome: 'YES',
        side: 'BUY',
        type: 'market',
        limitPrice: null,
        size: 10,
        reason: 'test',
      },
      makeBook({
        asks: [{ price: 0.4, size: 100 }],
        bids: [{ price: 0.38, size: 100 }],
      }),
    );

    const trades = instance.settle('market-1', 'yes-token');
    expect(trades).toHaveLength(1);
    expect(trades[0]?.price).toBe(1);
    expect(trades[0]?.realizedPnl).toBe(6);
    expect(instance.mark(new Map()).cash).toBe(1006);
  });

  it('tracks open orders by token and side', () => {
    const { broker: instance } = broker();
    instance.place({
      marketId: 'market-1',
      tokenId: 'yes-token',
      outcome: 'YES',
      side: 'BUY',
      type: 'limit',
      limitPrice: 0.48,
      size: 10,
      reason: 'test',
    });

    expect(instance.hasOpenOrder('yes-token', 'BUY')).toBe(true);
    expect(instance.hasOpenOrder('yes-token', 'SELL')).toBe(false);
    expect(instance.positions()).toHaveLength(0);
  });
});
