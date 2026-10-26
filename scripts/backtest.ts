import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import {
  createStrategy,
  DEFAULT_RISK_LIMITS,
  DEFAULT_STRATEGY_CONFIG,
  decodeRecording,
  formatBacktestReport,
  runBacktest,
  type StrategyConfig,
  type StrategyKind,
} from '../packages/core/src/index.js';

function numberOption(value: string | boolean | undefined, fallback: number): number {
  if (typeof value !== 'string') {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function strategyOption(value: string | boolean | undefined): StrategyKind {
  return value === 'micro-maker' ? 'micro-maker' : 'momentum-taker';
}

const { values } = parseArgs({
  options: {
    file: { type: 'string' },
    strategy: { type: 'string', default: 'micro-maker' },
    cash: { type: 'string', default: '1000' },
    'fee-bps': { type: 'string', default: '0' },
    edge: { type: 'string' },
    imbalance: { type: 'string' },
    'max-spread': { type: 'string' },
    'take-profit': { type: 'string' },
    'stop-loss': { type: 'string' },
    'min-depth': { type: 'string' },
    json: { type: 'boolean', default: false },
    out: { type: 'string' },
  },
});

if (typeof values.file !== 'string') {
  console.error('Usage: npm run backtest -- --file data/recordings/polyhunter-YYYY-MM-DD.jsonl');
  process.exit(1);
}

const recording = decodeRecording(readFileSync(values.file, 'utf8'));
if (recording.errors.length > 0) {
  console.error(`Recording has ${recording.errors.length} invalid line(s):`);
  for (const error of recording.errors.slice(0, 10)) {
    console.error(`  ${error}`);
  }
  process.exit(1);
}
if (recording.books.length === 0) {
  console.error('Recording has no valid books.');
  process.exit(1);
}

const strategyKind = strategyOption(values.strategy);
const strategyConfig: StrategyConfig = {
  ...DEFAULT_STRATEGY_CONFIG,
  minEdge: numberOption(values.edge, DEFAULT_STRATEGY_CONFIG.minEdge),
  minImbalance: numberOption(values.imbalance, DEFAULT_STRATEGY_CONFIG.minImbalance),
  maxSpread: numberOption(values['max-spread'], DEFAULT_STRATEGY_CONFIG.maxSpread),
  minDepthShares: numberOption(values['min-depth'], DEFAULT_STRATEGY_CONFIG.minDepthShares),
  takeProfitEdge: numberOption(values['take-profit'], DEFAULT_STRATEGY_CONFIG.takeProfitEdge),
  stopLossEdge: numberOption(values['stop-loss'], DEFAULT_STRATEGY_CONFIG.stopLossEdge),
};

const result = runBacktest({
  books: recording.books,
  strategy: createStrategy(strategyKind, strategyConfig),
  strategyConfig,
  riskLimits: DEFAULT_RISK_LIMITS,
  startingCash: numberOption(values.cash, 1000),
  feeBps: numberOption(values['fee-bps'], 0),
  orderTtlMs: 15_000,
});

if (values.json) {
  const payload = JSON.stringify({ strategy: strategyKind, metrics: result.metrics }, null, 2);
  if (typeof values.out === 'string') {
    writeFileSync(values.out, payload);
    console.log(`Wrote ${values.out}`);
  } else {
    console.log(payload);
  }
} else {
  console.log(`Recording: ${values.file}`);
  console.log(`Books: ${recording.books.length}`);
  console.log(`Strategy: ${strategyKind}`);
  console.log(formatBacktestReport(result));
  if (typeof values.out === 'string') {
    writeFileSync(
      values.out,
      JSON.stringify({ strategy: strategyKind, metrics: result.metrics }, null, 2),
    );
    console.log(`Wrote ${values.out}`);
  }
}
