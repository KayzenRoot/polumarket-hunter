import { parseArgs } from 'node:util';
import {
  createStrategy,
  DEFAULT_RISK_LIMITS,
  DEFAULT_STRATEGY_CONFIG,
  formatBacktestReport,
  generateSyntheticBooks,
  runBacktest,
  type StrategyConfig,
} from '../packages/core/src/index.js';
import { numberOption, strategyOption } from './args.js';

const { values } = parseArgs({
  options: {
    strategy: { type: 'string', default: 'momentum-taker' },
    seed: { type: 'string', default: '11' },
    count: { type: 'string', default: '400' },
    cash: { type: 'string', default: '1000' },
    trend: { type: 'string', default: '0.0006' },
    volatility: { type: 'string', default: '0.0005' },
    edge: { type: 'string', default: '0.0005' },
  },
});

const strategyKind = strategyOption(values.strategy);
const strategyConfig: StrategyConfig = {
  ...DEFAULT_STRATEGY_CONFIG,
  minEdge: numberOption(values.edge, 0.0005),
  minImbalance: 0.02,
  maxSpread: 0.05,
  minDepthShares: 10,
  cooldownMs: 0,
  takeProfitEdge: 0.01,
  stopLossEdge: 0.02,
  momentumHorizon: 8,
};

const books = generateSyntheticBooks({
  count: numberOption(values.count, 400),
  seed: numberOption(values.seed, 11),
  startPrice: 0.5,
  trend: numberOption(values.trend, 0.0006),
  volatility: numberOption(values.volatility, 0.0005),
  spread: 0.02,
  startAt: Date.now(),
});

const result = runBacktest({
  books,
  strategy: createStrategy(strategyKind, strategyConfig),
  strategyConfig,
  riskLimits: {
    ...DEFAULT_RISK_LIMITS,
    maxOrdersPerMinute: 1000,
    maxOpenPositions: 20,
    maxNotionalPerMarket: 500,
    maxTotalNotional: 1000,
    maxDailyLoss: 500,
    maxDrawdownPct: 0.9,
    minDepthShares: 10,
    maxSpread: 0.05,
  },
  startingCash: numberOption(values.cash, 1000),
  feeBps: 0,
  orderTtlMs: 15_000,
});

console.log(`Synthetic demo (${strategyKind})`);
console.log(formatBacktestReport(result));
