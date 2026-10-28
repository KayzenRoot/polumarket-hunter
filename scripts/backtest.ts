import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import {
  createStrategy,
  DEFAULT_RISK_LIMITS,
  DEFAULT_STRATEGY_CONFIG,
  decodeRecording,
  formatBacktestReport,
  formatValidationReport,
  runBacktest,
  type StrategyConfig,
  validateRecording,
} from '../packages/core/src/index.js';
import { numberOption, strategyOption } from './args.js';
import { type FeeSelection, feeSelection } from './fees.js';

const { values } = parseArgs({
  options: {
    file: { type: 'string' },
    strategy: { type: 'string', default: 'micro-maker' },
    cash: { type: 'string', default: '1000' },
    'fee-bps': { type: 'string', default: '0' },
    'fee-rate': { type: 'string' },
    'fee-exponent': { type: 'string' },
    'fee-both-sides': { type: 'boolean', default: false },
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
const validation = validateRecording(recording);
if (!validation.ok) {
  console.error('Recording failed validation; refusing to backtest.');
  console.error(formatValidationReport(validation));
  process.exit(1);
}
if (validation.warnings.length > 0) {
  console.warn(`Recording validation warnings (${validation.warnings.length}):`);
  for (const warning of validation.warnings) {
    console.warn(`  - ${warning}`);
  }
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

let fee: FeeSelection;
try {
  fee = feeSelection(values);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const result = runBacktest({
  books: recording.books,
  strategy: createStrategy(strategyKind, strategyConfig),
  strategyConfig,
  riskLimits: DEFAULT_RISK_LIMITS,
  startingCash: numberOption(values.cash, 1000),
  feeBps: fee.feeBps,
  feeSchedule: fee.feeSchedule,
  orderTtlMs: 15_000,
});

if (values.json) {
  const payload = JSON.stringify(
    {
      strategy: strategyKind,
      metrics: result.metrics,
      feeAssumption: result.feeAssumption,
    },
    null,
    2,
  );
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
      JSON.stringify(
        {
          strategy: strategyKind,
          metrics: result.metrics,
          feeAssumption: result.feeAssumption,
        },
        null,
        2,
      ),
    );
    console.log(`Wrote ${values.out}`);
  }
}
