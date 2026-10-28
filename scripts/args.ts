import type { StrategyKind } from '../packages/core/src/index.js';

export function numberOption(value: string | boolean | undefined, fallback: number): number {
  if (typeof value !== 'string') {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function strategyOption(
  value: string | boolean | undefined,
  fallback: StrategyKind = 'micro-maker',
): StrategyKind {
  if (typeof value !== 'string') {
    return fallback;
  }
  if (value === 'micro-maker' || value === 'maker-scalper' || value === 'momentum-taker') {
    return value;
  }
  throw new Error(`invalid strategy: ${value}`);
}
