import type { FeeSchedule } from '../packages/core/src/index.js';
import { numberOption } from './args.js';

export interface FeeCliValues {
  readonly 'fee-bps'?: string | boolean;
  readonly 'fee-rate'?: string | boolean;
  readonly 'fee-exponent'?: string | boolean;
  readonly 'fee-both-sides'?: boolean;
}

export interface FeeSelection {
  readonly feeBps: number;
  readonly feeSchedule: FeeSchedule | null;
}

export function feeSelection(values: FeeCliValues): FeeSelection {
  const feeBps = numberOption(values['fee-bps'], 0);
  const rawRate = values['fee-rate'];
  if (typeof rawRate !== 'string') {
    return { feeBps, feeSchedule: null };
  }

  const rate = Number(rawRate);
  if (!Number.isFinite(rate) || rate < 0 || rate > 1) {
    throw new Error('--fee-rate must be between 0 and 1');
  }
  const exponent = numberOption(values['fee-exponent'], 1);
  if (!(exponent > 0)) {
    throw new Error('--fee-exponent must be positive');
  }

  return {
    feeBps,
    feeSchedule: {
      rate,
      exponent,
      takerOnly: values['fee-both-sides'] !== true,
      rebateRate: null,
    },
  };
}
