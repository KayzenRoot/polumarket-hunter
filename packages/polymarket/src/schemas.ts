import { z } from 'zod';

const numericString = z.union([z.string(), z.number()]).transform((value) => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
});

const booleanish = z.union([z.boolean(), z.string(), z.number()]).transform((value) => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  return value.toLowerCase() === 'true' || value === '1';
});

const optionalString = z.string().nullable().optional();

export const gammaMarketSchema = z
  .object({
    id: z.union([z.string(), z.number()]).transform((value) => String(value)),
    conditionId: z.string().optional().default(''),
    slug: z.string().optional().default(''),
    question: z.string().optional().default(''),
    endDate: optionalString,
    liquidity: numericString.optional().default(0),
    volume24hr: numericString.optional().default(0),
    clobTokenIds: z
      .union([z.string(), z.array(z.string())])
      .optional()
      .default('[]'),
    orderPriceMinTickSize: numericString.optional(),
    tickSize: numericString.optional(),
    negRisk: booleanish.optional().default(false),
    active: booleanish.optional().default(false),
    closed: booleanish.optional().default(true),
    acceptingOrders: booleanish.optional().default(false),
    enableOrderBook: booleanish.optional().default(false),
    feesEnabled: z.unknown().optional(),
    feeSchedule: z.unknown().optional(),
  })
  .passthrough();

export type GammaMarketRaw = z.infer<typeof gammaMarketSchema>;

export const clobLevelSchema = z.object({
  price: numericString,
  size: numericString,
});

export const clobBookSchema = z
  .object({
    market: z.string().optional().default(''),
    asset_id: z.string(),
    timestamp: z.union([z.string(), z.number()]).optional(),
    hash: z.string().nullable().optional(),
    bids: z.array(clobLevelSchema),
    asks: z.array(clobLevelSchema),
    last_trade_price: numericString.nullable().optional(),
    tick_size: numericString.nullable().optional(),
    event_type: z.string().optional(),
  })
  .passthrough();

export const priceChangeSchema = z.object({
  asset_id: z.string(),
  price: numericString,
  size: numericString,
  side: z.enum(['BUY', 'SELL']),
  hash: z.string().nullable().optional(),
  best_bid: numericString.nullable().optional(),
  best_ask: numericString.nullable().optional(),
});

export const priceChangeEventSchema = z
  .object({
    event_type: z.literal('price_change'),
    market: z.string().optional().default(''),
    price_changes: z.array(priceChangeSchema),
    timestamp: z.union([z.string(), z.number()]).optional(),
  })
  .passthrough();

export const lastTradeEventSchema = z
  .object({
    event_type: z.literal('last_trade_price'),
    market: z.string().optional().default(''),
    asset_id: z.string(),
    price: numericString,
    size: numericString.optional().default(0),
    side: z.enum(['BUY', 'SELL']),
    timestamp: z.union([z.string(), z.number()]).optional(),
  })
  .passthrough();

export const tickSizeEventSchema = z
  .object({
    event_type: z.literal('tick_size_change'),
    market: z.string().optional().default(''),
    asset_id: z.string(),
    old_tick_size: numericString.nullable().optional(),
    new_tick_size: numericString,
    timestamp: z.union([z.string(), z.number()]).optional(),
  })
  .passthrough();

export const bestBidAskEventSchema = z
  .object({
    event_type: z.literal('best_bid_ask'),
    market: z.string().optional().default(''),
    asset_id: z.string(),
    best_bid: numericString.nullable().optional(),
    best_ask: numericString.nullable().optional(),
    spread: numericString.nullable().optional(),
    timestamp: z.union([z.string(), z.number()]).optional(),
  })
  .passthrough();

export const marketResolvedEventSchema = z
  .object({
    event_type: z.literal('market_resolved'),
    market: z.string().optional().default(''),
    winning_asset_id: z.string().nullable().optional(),
    winning_outcome: z.string().nullable().optional(),
    timestamp: z.union([z.string(), z.number()]).optional(),
  })
  .passthrough();

export const geoblockSchema = z
  .object({
    blocked: z.boolean(),
    ip: z.string().nullable().optional(),
    country: z.string().nullable().optional(),
    region: z.string().nullable().optional(),
  })
  .passthrough();

export function parseTimestamp(value: string | number | undefined | null): number {
  if (value === undefined || value === null) {
    return 0;
  }
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }
  return parsed < 1_000_000_000_000 ? parsed * 1000 : parsed;
}
