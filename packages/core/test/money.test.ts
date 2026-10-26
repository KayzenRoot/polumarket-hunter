import { describe, expect, it } from 'vitest';
import {
  describeFeeModel,
  feeFor,
  feeForSchedule,
  notional,
  roundMoney,
  roundPrice,
  roundSize,
  roundToTick,
  sizeForNotional,
  ZERO_FEE_SCHEDULE,
} from '../src/index.js';

describe('money helpers', () => {
  it('rounds to the expected precision', () => {
    expect(roundPrice(0.123456)).toBe(0.1235);
    expect(roundSize(10.987)).toBe(10.99);
    expect(roundMoney(1.005)).toBe(1.01);
  });

  it('guards against non-finite values', () => {
    expect(roundPrice(Number.NaN)).toBe(0);
    expect(roundMoney(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('computes notional and fees', () => {
    expect(notional(0.42, 10)).toBe(4.2);
    expect(feeFor(4.2, 100)).toBe(0.04);
    expect(feeFor(4.2, 0)).toBe(0);
    expect(feeFor(-1, 100)).toBe(0);
  });

  it('applies the venue fee curve to takers and leaves makers free', () => {
    const schedule = { rate: 0.07, exponent: 1, takerOnly: true, rebateRate: 0.2 };
    expect(feeForSchedule(100, 0.5, schedule, 'taker')).toBe(1.75);
    expect(feeForSchedule(100, 0.3, schedule, 'taker')).toBe(1.47);
    expect(feeForSchedule(100, 0.5, schedule, 'maker')).toBe(0);
    expect(feeForSchedule(100, 0.5, { ...schedule, takerOnly: false }, 'maker')).toBe(1.75);
    expect(feeForSchedule(100, 0.5, { ...schedule, exponent: 2 }, 'taker')).toBe(0.44);
    expect(feeForSchedule(100, 0.5, ZERO_FEE_SCHEDULE, 'taker')).toBe(0);
    expect(feeForSchedule(0, 0.5, schedule, 'taker')).toBe(0);
    expect(feeForSchedule(100, 1, schedule, 'taker')).toBe(0);
  });

  it('describes the fee assumption', () => {
    const schedule = { rate: 0.03, exponent: 1, takerOnly: true, rebateRate: null };
    expect(describeFeeModel(25, null)).toContain('25 bps flat');
    expect(describeFeeModel(0, schedule)).toContain('rate 0.03');
    expect(describeFeeModel(0, schedule)).toContain('taker only');
  });

  it('snaps prices to a tick and clamps to the probability range', () => {
    expect(roundToTick(0.483, 0.01)).toBe(0.48);
    expect(roundToTick(0.487, 0.01)).toBe(0.49);
    expect(roundToTick(0, 0.01)).toBe(0.01);
    expect(roundToTick(1, 0.01)).toBe(0.99);
    expect(roundToTick(0.1234, 0.001)).toBe(0.123);
  });

  it('sizes orders without exceeding the requested notional', () => {
    expect(sizeForNotional(10, 0.5)).toBe(20);
    expect(sizeForNotional(10, 0.48)).toBe(20.83);
    expect(sizeForNotional(10, 0.99)).toBe(10.1);
    expect(sizeForNotional(0.1, 0.5)).toBe(0);
    expect(sizeForNotional(10, 0)).toBe(0);
  });
});
