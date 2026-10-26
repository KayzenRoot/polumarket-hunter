import { runBacktest } from './backtest.js';
import { formatPct, formatSignedUsd, formatUsd } from './format.js';
import { topOfBook } from './orderbook.js';
import { createStrategy } from './strategy.js';
import type {
  BacktestMetrics,
  OrderBook,
  RiskLimits,
  Strategy,
  StrategyConfig,
  StrategyContext,
  StrategyIntent,
  StrategyKind,
} from './types.js';

export interface ResearchConfig {
  readonly strategy: StrategyKind;
  readonly strategyConfig: StrategyConfig;
  readonly riskLimits: RiskLimits;
  readonly startingCash: number;
  readonly feeBps: number;
  readonly orderTtlMs: number;
  readonly trainRatio: number;
}

export interface ResearchOptions extends ResearchConfig {
  readonly books: readonly OrderBook[];
  readonly configHash: string;
}

export interface ResearchConfigDescriptor {
  readonly strategy: StrategyKind;
  readonly strategyConfig: Readonly<Record<string, number>>;
  readonly riskLimits: Readonly<Record<string, number>>;
  readonly startingCash: number;
  readonly feeBps: number;
  readonly orderTtlMs: number;
  readonly trainRatio: number;
  readonly feeAssumption: string;
}

export interface ResearchSplit {
  readonly trainRatio: number;
  readonly boundaryAt: number;
  readonly trainStart: number;
  readonly trainEnd: number;
  readonly validationStart: number;
  readonly validationEnd: number;
  readonly trainBooks: number;
  readonly validationBooks: number;
}

export interface ResearchBaseline {
  readonly name: 'no-trade' | 'passive-hold';
  readonly description: string;
  readonly train: BacktestMetrics;
  readonly validation: BacktestMetrics;
}

export interface ResearchReport {
  readonly configHash: string;
  readonly config: ResearchConfigDescriptor;
  readonly split: ResearchSplit;
  readonly train: BacktestMetrics;
  readonly validation: BacktestMetrics;
  readonly baselines: readonly ResearchBaseline[];
  readonly notes: readonly string[];
}

export const BASELINE_RISK_LIMITS: RiskLimits = {
  maxNotionalPerMarket: 1_000_000,
  maxTotalNotional: 1_000_000,
  maxOpenPositions: 100,
  maxDailyLoss: 1_000_000,
  maxDrawdownPct: 1,
  maxOrdersPerMinute: 1_000,
  maxBookAgeMs: 120_000,
  maxSpread: 1,
  minDepthShares: 0,
};

function holdIntent(book: OrderBook, now: number, reason: string): StrategyIntent {
  return {
    action: 'HOLD',
    tokenId: book.tokenId,
    marketId: book.marketId,
    outcome: book.outcome,
    price: 0,
    size: 0,
    fairValue: 0,
    edge: 0,
    confidence: 0,
    reasons: [reason],
    createdAt: now,
  };
}

class HoldStrategy implements Strategy {
  public readonly kind: StrategyKind = 'micro-maker';

  public evaluate(book: OrderBook, context: StrategyContext): StrategyIntent {
    return holdIntent(book, context.now, 'no-trade baseline');
  }

  public reset(): void {
    // Stateless.
  }
}

class PassiveHoldStrategy implements Strategy {
  public readonly kind: StrategyKind = 'micro-maker';
  private readonly allocationPerMarket: number;
  private readonly enteredMarkets = new Set<string>();

  public constructor(allocationPerMarket: number) {
    this.allocationPerMarket = Math.max(0, allocationPerMarket);
  }

  public evaluate(book: OrderBook, context: StrategyContext): StrategyIntent {
    if (this.enteredMarkets.has(book.marketId)) {
      return holdIntent(book, context.now, 'passive-hold: market already entered');
    }
    if (this.allocationPerMarket <= 0) {
      return holdIntent(book, context.now, 'passive-hold: no allocation');
    }
    const top = topOfBook(book);
    if (top === null) {
      return holdIntent(book, context.now, 'passive-hold: no two-sided quote');
    }

    this.enteredMarkets.add(book.marketId);
    return {
      action: 'TAKE_BUY',
      tokenId: book.tokenId,
      marketId: book.marketId,
      outcome: book.outcome,
      price: top.ask,
      size: this.allocationPerMarket / top.ask,
      fairValue: top.mid,
      edge: 0,
      confidence: 1,
      reasons: ['passive-hold baseline: buy at the first ask and hold'],
      createdAt: context.now,
    };
  }

  public reset(): void {
    this.enteredMarkets.clear();
  }
}

export function splitBooksByTime(
  books: readonly OrderBook[],
  trainRatio = 0.7,
): {
  readonly train: readonly OrderBook[];
  readonly validation: readonly OrderBook[];
  readonly split: ResearchSplit;
} {
  if (books.length === 0) {
    throw new Error('cannot split an empty recording');
  }
  if (!(trainRatio > 0 && trainRatio < 1)) {
    throw new Error('trainRatio must be between 0 and 1');
  }

  let start = Number.POSITIVE_INFINITY;
  let end = Number.NEGATIVE_INFINITY;
  for (const book of books) {
    start = Math.min(start, book.timestamp);
    end = Math.max(end, book.timestamp);
  }
  if (!(end > start)) {
    throw new Error('recording has no time span to split');
  }

  const boundaryAt = start + Math.floor((end - start) * trainRatio);
  const train: OrderBook[] = [];
  const validation: OrderBook[] = [];
  let trainStart = Number.POSITIVE_INFINITY;
  let trainEnd = Number.NEGATIVE_INFINITY;
  let validationStart = Number.POSITIVE_INFINITY;
  let validationEnd = Number.NEGATIVE_INFINITY;
  for (const book of books) {
    if (book.timestamp < boundaryAt) {
      train.push(book);
      trainStart = Math.min(trainStart, book.timestamp);
      trainEnd = Math.max(trainEnd, book.timestamp);
    } else {
      validation.push(book);
      validationStart = Math.min(validationStart, book.timestamp);
      validationEnd = Math.max(validationEnd, book.timestamp);
    }
  }
  if (train.length === 0 || validation.length === 0) {
    throw new Error('recording time span is too short for the requested split');
  }

  return {
    train,
    validation,
    split: {
      trainRatio,
      boundaryAt,
      trainStart,
      trainEnd,
      validationStart,
      validationEnd,
      trainBooks: train.length,
      validationBooks: validation.length,
    },
  };
}

export function describeResearchConfig(config: ResearchConfig): ResearchConfigDescriptor {
  const strategy = config.strategyConfig;
  const risk = config.riskLimits;
  return {
    strategy: config.strategy,
    strategyConfig: {
      minEdge: strategy.minEdge,
      minImbalance: strategy.minImbalance,
      maxSpread: strategy.maxSpread,
      minDepthShares: strategy.minDepthShares,
      maxBookAgeMs: strategy.maxBookAgeMs,
      cooldownMs: strategy.cooldownMs,
      takeProfitEdge: strategy.takeProfitEdge,
      stopLossEdge: strategy.stopLossEdge,
      orderNotional: strategy.orderNotional,
      tickSize: strategy.tickSize,
      momentumHorizon: strategy.momentumHorizon,
    },
    riskLimits: {
      maxNotionalPerMarket: risk.maxNotionalPerMarket,
      maxTotalNotional: risk.maxTotalNotional,
      maxOpenPositions: risk.maxOpenPositions,
      maxDailyLoss: risk.maxDailyLoss,
      maxDrawdownPct: risk.maxDrawdownPct,
      maxOrdersPerMinute: risk.maxOrdersPerMinute,
      maxBookAgeMs: risk.maxBookAgeMs,
      maxSpread: risk.maxSpread,
      minDepthShares: risk.minDepthShares,
    },
    startingCash: config.startingCash,
    feeBps: config.feeBps,
    orderTtlMs: config.orderTtlMs,
    trainRatio: config.trainRatio,
    feeAssumption: `flat ${config.feeBps} bps on notional; per-market fee schedules are not modeled`,
  };
}

export function researchConfigJson(config: ResearchConfig): string {
  return JSON.stringify(describeResearchConfig(config));
}

function runMetrics(
  books: readonly OrderBook[],
  strategy: Strategy,
  config: ResearchConfig,
  riskLimits: RiskLimits,
): BacktestMetrics {
  return runBacktest({
    books,
    strategy,
    strategyConfig: config.strategyConfig,
    riskLimits,
    startingCash: config.startingCash,
    feeBps: config.feeBps,
    orderTtlMs: config.orderTtlMs,
  }).metrics;
}

function passiveAllocation(cash: number, markets: number, feeBps: number): number {
  if (markets <= 0) {
    return 0;
  }
  const feeMultiplier = 1 + Math.max(0, feeBps) / 10_000;
  return (cash / markets / feeMultiplier) * 0.995;
}

export function runResearch(options: ResearchOptions): ResearchReport {
  const { train, validation, split } = splitBooksByTime(options.books, options.trainRatio);

  const trainMetrics = runMetrics(
    train,
    createStrategy(options.strategy, options.strategyConfig),
    options,
    options.riskLimits,
  );
  const validationMetrics = runMetrics(
    validation,
    createStrategy(options.strategy, options.strategyConfig),
    options,
    options.riskLimits,
  );

  const trainMarkets = new Set(train.map((book) => book.marketId)).size;
  const validationMarkets = new Set(validation.map((book) => book.marketId)).size;
  const trainAllocation = passiveAllocation(options.startingCash, trainMarkets, options.feeBps);
  const validationAllocation = passiveAllocation(
    options.startingCash,
    validationMarkets,
    options.feeBps,
  );

  const noTradeTrain = runMetrics(train, new HoldStrategy(), options, BASELINE_RISK_LIMITS);
  const noTradeValidation = runMetrics(
    validation,
    new HoldStrategy(),
    options,
    BASELINE_RISK_LIMITS,
  );
  const passiveTrain = runMetrics(
    train,
    new PassiveHoldStrategy(trainAllocation),
    options,
    BASELINE_RISK_LIMITS,
  );
  const passiveValidation = runMetrics(
    validation,
    new PassiveHoldStrategy(validationAllocation),
    options,
    BASELINE_RISK_LIMITS,
  );

  return {
    configHash: options.configHash,
    config: describeResearchConfig(options),
    split,
    train: trainMetrics,
    validation: validationMetrics,
    baselines: [
      {
        name: 'no-trade',
        description: 'Hold cash for the whole split; the benchmark for doing nothing.',
        train: noTradeTrain,
        validation: noTradeValidation,
      },
      {
        name: 'passive-hold',
        description:
          'Buy once per market at the first two-sided ask with equal cash, subject to book depth and the simulator slippage cap, then mark at the final mid.',
        train: passiveTrain,
        validation: passiveValidation,
      },
    ],
    notes: [
      'Train and validation are simulated independently, each with the configured starting cash.',
      'Validation is held out. Do not tune the strategy on validation metrics.',
      'Baselines use permissive risk limits so their exposure is not shaped by the strategy risk policy.',
      'The config hash covers the strategy, risk limits, cash, fee bps, order TTL and split ratio.',
    ],
  };
}

export function formatResearchMarkdown(report: ResearchReport): string {
  const lines = [
    '# PolyHunter research report',
    '',
    `- Config hash: \`${report.configHash}\``,
    `- Strategy: \`${report.config.strategy}\``,
    `- Starting cash: ${formatUsd(report.config.startingCash)}`,
    `- Fee assumption: ${report.config.feeAssumption}`,
    `- Split: ${formatPct(report.split.trainRatio, 0)} train / ${formatPct(1 - report.split.trainRatio, 0)} validation at ${new Date(report.split.boundaryAt).toISOString()}`,
    `- Train window: ${new Date(report.split.trainStart).toISOString()} to ${new Date(report.split.trainEnd).toISOString()} (${report.split.trainBooks} books)`,
    `- Validation window: ${new Date(report.split.validationStart).toISOString()} to ${new Date(report.split.validationEnd).toISOString()} (${report.split.validationBooks} books)`,
    '',
    '> Validation is held out. Do not tune the strategy on these numbers.',
    '',
    '## Results',
    '',
    '| Run | Books | Signals | Fills | Closed | Win rate | PnL | Fees | Max drawdown | Fill rate |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ];

  const rows: readonly [string, BacktestMetrics][] = [
    ['Strategy train', report.train],
    ['Strategy validation', report.validation],
    ['No-trade train', noTradeMetrics(report, 'train')],
    ['No-trade validation', noTradeMetrics(report, 'validation')],
    ['Passive-hold train', passiveMetrics(report, 'train')],
    ['Passive-hold validation', passiveMetrics(report, 'validation')],
  ];
  for (const [label, metrics] of rows) {
    lines.push(
      `| ${label} | ${metrics.books} | ${metrics.signals} | ${metrics.fills} | ${metrics.trades} | ${formatPct(metrics.winRate)} | ${formatSignedUsd(metrics.totalPnl)} | ${formatUsd(metrics.fees)} | ${formatPct(metrics.maxDrawdownPct)} | ${formatPct(metrics.fillRate)} |`,
    );
  }

  lines.push('', '## Baseline definitions', '');
  for (const baseline of report.baselines) {
    lines.push(`- **${baseline.name}**: ${baseline.description}`);
  }

  lines.push('', '## Notes', '');
  for (const note of report.notes) {
    lines.push(`- ${note}`);
  }

  return lines.join('\n');
}

function noTradeMetrics(report: ResearchReport, split: 'train' | 'validation'): BacktestMetrics {
  const baseline = report.baselines.find((candidate) => candidate.name === 'no-trade');
  if (baseline === undefined) {
    throw new Error('missing no-trade baseline');
  }
  return baseline[split];
}

function passiveMetrics(report: ResearchReport, split: 'train' | 'validation'): BacktestMetrics {
  const baseline = report.baselines.find((candidate) => candidate.name === 'passive-hold');
  if (baseline === undefined) {
    throw new Error('missing passive-hold baseline');
  }
  return baseline[split];
}
