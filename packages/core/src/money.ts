import type { FeeSchedule, LiquidityRole } from './types.js';

const PRICE_DECIMALS = 4;
const SIZE_DECIMALS = 2;
const MONEY_DECIMALS = 2;

export const ZERO_FEE_SCHEDULE: FeeSchedule = {
  rate: 0,
  exponent: 1,
  takerOnly: true,
  rebateRate: 0,
};

export function roundTo(value: number, decimals: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function roundPrice(value: number): number {
  return roundTo(value, PRICE_DECIMALS);
}

export function roundSize(value: number): number {
  return roundTo(value, SIZE_DECIMALS);
}

export function roundMoney(value: number): number {
  return roundTo(value, MONEY_DECIMALS);
}

export function notional(price: number, size: number): number {
  return roundMoney(price * size);
}

export function feeFor(amount: number, feeBps: number): number {
  if (!Number.isFinite(amount) || !Number.isFinite(feeBps) || amount <= 0 || feeBps <= 0) {
    return 0;
  }
  return roundMoney((amount * feeBps) / 10_000);
}

export function feeForSchedule(
  shares: number,
  price: number,
  schedule: FeeSchedule,
  liquidity: LiquidityRole,
): number {
  if (
    !Number.isFinite(shares) ||
    !Number.isFinite(price) ||
    shares <= 0 ||
    price <= 0 ||
    price >= 1
  ) {
    return 0;
  }
  if (schedule.takerOnly && liquidity === 'maker') {
    return 0;
  }
  if (!Number.isFinite(schedule.rate) || schedule.rate <= 0) {
    return 0;
  }
  const exponent =
    Number.isFinite(schedule.exponent) && schedule.exponent > 0 ? schedule.exponent : 1;
  const curve = (price * (1 - price)) ** exponent;
  return roundMoney(shares * schedule.rate * curve);
}

export function describeFeeModel(feeBps: number, schedule: FeeSchedule | null): string {
  if (schedule === null) {
    return `${Math.max(0, feeBps)} bps flat on notional (fallback)`;
  }
  const sides = schedule.takerOnly ? 'taker only' : 'maker and taker';
  return `rate ${schedule.rate} x (p x (1-p))^${schedule.exponent}, ${sides}`;
}

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

export function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

export function roundToTick(price: number, tickSize: number): number {
  if (!Number.isFinite(price) || !Number.isFinite(tickSize) || tickSize <= 0) {
    return roundPrice(price);
  }
  const tick = roundPrice(tickSize);
  const snapped = Math.round(price / tick) * tick;
  return roundPrice(clamp(snapped, tick, 1 - tick));
}

export function sizeForNotional(orderNotional: number, price: number): number {
  if (!Number.isFinite(orderNotional) || !Number.isFinite(price) || price <= 0) {
    return 0;
  }
  const shares = Math.floor((orderNotional / price) * 100) / 100;
  return shares >= 1 ? roundSize(shares) : 0;
}

export function basisPoints(value: number): number {
  return roundTo(value * 10_000, 2);
}
