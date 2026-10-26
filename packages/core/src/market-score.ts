import { clamp01, roundTo } from './money.js';
import type { Market, TopOfBook } from './types.js';

/**
 * Ranks markets for the scanner. This is a liquidity/execution-quality score,
 * not a profitability score and not a trading recommendation.
 */
export function scoreMarket(market: Market, top: TopOfBook | null): number {
  const liquidityScore = clamp01(Math.log10(market.liquidity + 1) / 7);
  const volumeScore = clamp01(Math.log10(market.volume24h + 1) / 7);
  const spreadScore = top === null ? 0 : clamp01(1 - top.spread / 0.1);
  const twoSided = top === null || top.crossed ? 0 : 1;
  return roundTo(liquidityScore * 0.3 + volumeScore * 0.3 + spreadScore * 0.3 + twoSided * 0.1, 4);
}
