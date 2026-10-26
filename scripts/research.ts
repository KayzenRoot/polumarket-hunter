import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { parseArgs } from 'node:util';
import {
  DEFAULT_RISK_LIMITS,
  DEFAULT_STRATEGY_CONFIG,
  decodeRecording,
  formatResearchMarkdown,
  formatValidationReport,
  type ResearchConfig,
  researchConfigJson,
  runResearch,
  type StrategyConfig,
  type StrategyKind,
  validateRecording,
} from '../packages/core/src/index.js';
import { numberOption } from './args.js';
import { type FeeSelection, feeSelection } from './fees.js';

function strategyOption(value: string | boolean | undefined): StrategyKind {
  return value === 'micro-maker' ? 'micro-maker' : 'momentum-taker';
}

const { values } = parseArgs({
  options: {
    file: { type: 'string' },
    out: { type: 'string', default: 'data/reports' },
    strategy: { type: 'string', default: 'micro-maker' },
    cash: { type: 'string', default: '1000' },
    'fee-bps': { type: 'string', default: '0' },
    'fee-rate': { type: 'string' },
    'fee-exponent': { type: 'string' },
    'fee-both-sides': { type: 'boolean', default: false },
    'train-ratio': { type: 'string', default: '0.7' },
    edge: { type: 'string' },
    imbalance: { type: 'string' },
    'max-spread': { type: 'string' },
    'take-profit': { type: 'string' },
    'stop-loss': { type: 'string' },
    'min-depth': { type: 'string' },
  },
});

if (typeof values.file !== 'string') {
  console.error(
    'Usage: npm run research -- --file data/recordings/polyhunter-YYYY-MM-DD.jsonl [--strategy micro-maker]',
  );
  process.exit(1);
}

const trainRatio = numberOption(values['train-ratio'], 0.7);
if (!(trainRatio > 0 && trainRatio < 1)) {
  console.error('--train-ratio must be between 0 and 1');
  process.exit(1);
}

let text: string;
try {
  // Local operator CLI: --file is an explicit filesystem path, not untrusted remote input.
  text = readFileSync(values.file, 'utf8'); // NOSONAR
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Cannot read ${values.file}: ${message}`);
  process.exit(1);
}

const recording = decodeRecording(text);
const validation = validateRecording(recording);
if (!validation.ok) {
  console.error('Recording failed validation; refusing to run research.');
  console.error(formatValidationReport(validation));
  process.exit(1);
}
if (validation.warnings.length > 0) {
  console.warn(`Recording validation warnings (${validation.warnings.length}):`);
  for (const warning of validation.warnings) {
    console.warn(`  - ${warning}`);
  }
}

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

const config: ResearchConfig = {
  strategy: strategyOption(values.strategy),
  strategyConfig,
  riskLimits: DEFAULT_RISK_LIMITS,
  startingCash: numberOption(values.cash, 1000),
  feeBps: fee.feeBps,
  feeSchedule: fee.feeSchedule,
  orderTtlMs: 15_000,
  trainRatio,
};

const configHash = createHash('sha256').update(researchConfigJson(config)).digest('hex');
const report = runResearch({ books: recording.books, ...config, configHash });

const out = typeof values.out === 'string' ? values.out : 'data/reports';
// Local operator CLI: the operator chooses where reports are written.
mkdirSync(out, { recursive: true }); // NOSONAR
const base = basename(values.file)
  .replace(/\.jsonl$/i, '')
  .replace(/[^a-zA-Z0-9._-]+/g, '-');
const prefix = `research-${base}-${configHash.slice(0, 8)}`;
const jsonPath = join(out, `${prefix}.json`);
const markdownPath = join(out, `${prefix}.md`);
const markdown = formatResearchMarkdown(report);
writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`); // NOSONAR
writeFileSync(markdownPath, `${markdown}\n`); // NOSONAR

console.log(markdown);
console.log(`\nWrote ${jsonPath}`);
console.log(`Wrote ${markdownPath}`);
