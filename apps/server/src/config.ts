import type { RiskLimits, StrategyConfig, StrategyKind, TradingMode } from '@polyhunter/core';
import { z } from 'zod';

const booleanish = z.union([z.boolean(), z.string(), z.number()]).transform((value) => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on';
});

const numberish = z.union([z.number(), z.string()]).transform((value, context) => {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    context.addIssue({ code: 'custom', message: `expected a number, received ${String(value)}` });
    return z.NEVER;
  }
  return parsed;
});

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: numberish.pipe(z.number().int().min(1).max(65535)).default(8787),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  API_TOKEN: z.string().optional(),
  WEB_DIST_PATH: z.string().default('apps/web/dist'),

  DATABASE_PATH: z.string().default('data/polyhunter.db'),
  RECORD_DIR: z.string().default('data/recordings'),
  RECORD_BOOKS: booleanish.default(false),

  TRADING_MODE: z.enum(['paper', 'live']).default('paper'),
  LIVE_TRADING_AUTHORIZED: booleanish.default(false),

  POLYMARKET_GAMMA_URL: z.string().url().default('https://gamma-api.polymarket.com'),
  POLYMARKET_CLOB_URL: z.string().url().default('https://clob.polymarket.com'),
  POLYMARKET_WS_URL: z
    .string()
    .url()
    .default('wss://ws-subscriptions-clob.polymarket.com/ws/market'),
  POLYMARKET_GEOBLOCK_URL: z.string().url().default('https://polymarket.com/api/geoblock'),

  MAX_MARKETS: numberish.pipe(z.number().int().min(1).max(50)).default(12),
  MIN_LIQUIDITY: numberish.pipe(z.number().min(0)).default(25_000),
  SCAN_INTERVAL_MS: numberish.pipe(z.number().int().min(5_000)).default(60_000),
  BOOK_STALE_MS: numberish.pipe(z.number().int().min(500)).default(5_000),
  FEED_STALE_MS: numberish.pipe(z.number().int().min(1_000)).default(60_000),
  RETENTION_DAYS: numberish.pipe(z.number().int().min(1)).default(30),
  RECORDING_RETENTION_DAYS: numberish.pipe(z.number().int().min(1)).default(30),
  STREAM_RECONNECT_MAX_MS: numberish.pipe(z.number().int().min(1_000)).default(30_000),
  ALERT_WEBHOOK_URL: z.preprocess(
    (value) => (value === '' || value === undefined ? undefined : value),
    z
      .string()
      .url()
      .refine(
        (value) => value.startsWith('http://') || value.startsWith('https://'),
        'alert webhook must use http or https',
      )
      .optional(),
  ),

  STRATEGY: z.enum(['micro-maker', 'momentum-taker']).default('micro-maker'),
  STARTING_CASH: numberish.pipe(z.number().positive()).default(1_000),
  ORDER_NOTIONAL: numberish.pipe(z.number().positive()).default(10),
  MIN_EDGE: numberish.pipe(z.number().min(0).max(1)).default(0.006),
  MIN_IMBALANCE: numberish.pipe(z.number().min(0).max(1)).default(0.15),
  MAX_SPREAD: numberish.pipe(z.number().positive().max(1)).default(0.035),
  MIN_DEPTH_SHARES: numberish.pipe(z.number().min(1)).default(100),
  TAKE_PROFIT_EDGE: numberish.pipe(z.number().min(0).max(1)).default(0.012),
  STOP_LOSS_EDGE: numberish.pipe(z.number().min(0).max(1)).default(0.015),
  COOLDOWN_MS: numberish.pipe(z.number().int().min(0)).default(2_500),
  ORDER_TTL_MS: numberish.pipe(z.number().int().min(1_000)).default(15_000),
  FEE_BPS: numberish.pipe(z.number().min(0).max(1_000)).default(0),
  MOMENTUM_HORIZON: numberish.pipe(z.number().min(1).max(60)).default(6),

  MAX_NOTIONAL_PER_MARKET: numberish.pipe(z.number().positive()).default(25),
  MAX_TOTAL_NOTIONAL: numberish.pipe(z.number().positive()).default(100),
  MAX_OPEN_POSITIONS: numberish.pipe(z.number().int().min(1)).default(6),
  MAX_DAILY_LOSS: numberish.pipe(z.number().positive()).default(25),
  MAX_DRAWDOWN_PCT: numberish.pipe(z.number().positive().max(1)).default(0.08),
  MAX_ORDERS_PER_MINUTE: numberish.pipe(z.number().int().min(1)).default(20),

  DEMO_MODE: booleanish.default(false),
});

export interface AppConfig {
  readonly env: 'development' | 'test' | 'production';
  readonly host: string;
  readonly port: number;
  readonly logLevel: string;
  readonly apiToken: string | null;
  readonly webDistPath: string;
  readonly databasePath: string;
  readonly recordDir: string;
  readonly recordBooks: boolean;
  readonly tradingMode: TradingMode;
  readonly liveAuthorized: boolean;
  readonly demoMode: boolean;
  readonly gammaUrl: string;
  readonly clobUrl: string;
  readonly wsUrl: string;
  readonly geoblockUrl: string;
  readonly maxMarkets: number;
  readonly minLiquidity: number;
  readonly scanIntervalMs: number;
  readonly bookStaleMs: number;
  readonly feedStaleMs: number;
  readonly retentionDays: number;
  readonly recordingRetentionDays: number;
  readonly streamReconnectMaxMs: number;
  readonly alertWebhookUrl: string | null;
  readonly strategy: StrategyKind;
  readonly startingCash: number;
  readonly orderTtlMs: number;
  readonly feeBps: number;
  readonly strategyConfig: StrategyConfig;
  readonly riskLimits: RiskLimits;
}

function isLoopback(host: string): boolean {
  return host === '127.0.0.1' || host === 'localhost' || host === '::1';
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`)
      .join('; ');
    throw new Error(`invalid PolyHunter configuration: ${issues}`);
  }
  const data = parsed.data;
  const apiToken = data.API_TOKEN?.trim() ?? '';

  if (!isLoopback(data.HOST) && apiToken.length === 0) {
    throw new Error(
      'refusing to bind a non-loopback host without API_TOKEN; set API_TOKEN or bind 127.0.0.1',
    );
  }
  if (data.TRADING_MODE === 'live' && !data.LIVE_TRADING_AUTHORIZED) {
    throw new Error(
      'TRADING_MODE=live requires LIVE_TRADING_AUTHORIZED=true; live execution is not implemented in this build',
    );
  }

  const strategyConfig: StrategyConfig = {
    minEdge: data.MIN_EDGE,
    minImbalance: data.MIN_IMBALANCE,
    maxSpread: data.MAX_SPREAD,
    minDepthShares: data.MIN_DEPTH_SHARES,
    maxBookAgeMs: data.BOOK_STALE_MS,
    cooldownMs: data.COOLDOWN_MS,
    takeProfitEdge: data.TAKE_PROFIT_EDGE,
    stopLossEdge: data.STOP_LOSS_EDGE,
    orderNotional: data.ORDER_NOTIONAL,
    tickSize: 0.01,
    momentumHorizon: data.MOMENTUM_HORIZON,
  };

  const riskLimits: RiskLimits = {
    maxNotionalPerMarket: data.MAX_NOTIONAL_PER_MARKET,
    maxTotalNotional: data.MAX_TOTAL_NOTIONAL,
    maxOpenPositions: data.MAX_OPEN_POSITIONS,
    maxDailyLoss: data.MAX_DAILY_LOSS,
    maxDrawdownPct: data.MAX_DRAWDOWN_PCT,
    maxOrdersPerMinute: data.MAX_ORDERS_PER_MINUTE,
    maxBookAgeMs: data.BOOK_STALE_MS,
    maxSpread: data.MAX_SPREAD,
    minDepthShares: data.MIN_DEPTH_SHARES,
  };

  return {
    env: data.NODE_ENV,
    host: data.HOST,
    port: data.PORT,
    logLevel: data.LOG_LEVEL,
    apiToken: apiToken.length > 0 ? apiToken : null,
    webDistPath: data.WEB_DIST_PATH,
    databasePath: data.DATABASE_PATH,
    recordDir: data.RECORD_DIR,
    recordBooks: data.RECORD_BOOKS,
    tradingMode: data.TRADING_MODE,
    liveAuthorized: data.LIVE_TRADING_AUTHORIZED,
    demoMode: data.DEMO_MODE,
    gammaUrl: data.POLYMARKET_GAMMA_URL,
    clobUrl: data.POLYMARKET_CLOB_URL,
    wsUrl: data.POLYMARKET_WS_URL,
    geoblockUrl: data.POLYMARKET_GEOBLOCK_URL,
    maxMarkets: data.MAX_MARKETS,
    minLiquidity: data.MIN_LIQUIDITY,
    scanIntervalMs: data.SCAN_INTERVAL_MS,
    bookStaleMs: data.BOOK_STALE_MS,
    feedStaleMs: data.FEED_STALE_MS,
    retentionDays: data.RETENTION_DAYS,
    recordingRetentionDays: data.RECORDING_RETENTION_DAYS,
    streamReconnectMaxMs: data.STREAM_RECONNECT_MAX_MS,
    alertWebhookUrl: data.ALERT_WEBHOOK_URL ?? null,
    strategy: data.STRATEGY,
    startingCash: data.STARTING_CASH,
    orderTtlMs: data.ORDER_TTL_MS,
    feeBps: data.FEE_BPS,
    strategyConfig,
    riskLimits,
  };
}
