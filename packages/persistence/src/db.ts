import { DatabaseSync } from 'node:sqlite';
import type { Market, PortfolioSnapshot, Position, Signal, Trade } from '@polyhunter/core';

export interface EventRecord {
  readonly at: number;
  readonly kind: string;
  readonly severity: 'info' | 'warn' | 'error';
  readonly message: string;
  readonly details: string | null;
}

type SqlValue = string | number | bigint | Uint8Array | null;

function asString(value: SqlValue | undefined): string {
  if (typeof value === 'string') {
    return value;
  }
  if (value === null || value === undefined) {
    return '';
  }
  return String(value);
}

function asNumber(value: SqlValue | undefined): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === 'bigint') {
    return Number(value);
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asBoolean(value: SqlValue | undefined): boolean {
  return asNumber(value) !== 0;
}

function parseReasons(value: SqlValue | undefined): string[] {
  if (typeof value !== 'string') {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((item): item is string => typeof item === 'string');
  } catch {
    return [];
  }
}

function parsePositions(value: SqlValue | undefined): Position[] {
  if (typeof value !== 'string') {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((item): item is Position => {
      if (typeof item !== 'object' || item === null) {
        return false;
      }
      const candidate = item as Record<string, unknown>;
      return (
        typeof candidate.tokenId === 'string' &&
        typeof candidate.marketId === 'string' &&
        typeof candidate.shares === 'number' &&
        typeof candidate.avgPrice === 'number'
      );
    });
  } catch {
    return [];
  }
}

const MIGRATIONS = `
CREATE TABLE IF NOT EXISTS markets (
  id TEXT PRIMARY KEY,
  condition_id TEXT NOT NULL,
  slug TEXT NOT NULL,
  question TEXT NOT NULL,
  end_date TEXT,
  liquidity REAL NOT NULL,
  volume_24h REAL NOT NULL,
  yes_token_id TEXT NOT NULL,
  no_token_id TEXT NOT NULL,
  tick_size REAL NOT NULL,
  neg_risk INTEGER NOT NULL,
  active INTEGER NOT NULL,
  closed INTEGER NOT NULL,
  accepting_orders INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS signals (
  id TEXT PRIMARY KEY,
  at INTEGER NOT NULL,
  market_id TEXT NOT NULL,
  token_id TEXT NOT NULL,
  outcome TEXT NOT NULL,
  action TEXT NOT NULL,
  fair_value REAL NOT NULL,
  market_price REAL NOT NULL,
  edge REAL NOT NULL,
  confidence REAL NOT NULL,
  accepted INTEGER NOT NULL,
  reasons TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS signals_at_idx ON signals (at DESC);

CREATE TABLE IF NOT EXISTS trades (
  id TEXT PRIMARY KEY,
  at INTEGER NOT NULL,
  market_id TEXT NOT NULL,
  token_id TEXT NOT NULL,
  outcome TEXT NOT NULL,
  side TEXT NOT NULL,
  price REAL NOT NULL,
  size REAL NOT NULL,
  notional REAL NOT NULL,
  fee REAL NOT NULL,
  realized_pnl REAL NOT NULL,
  order_id TEXT NOT NULL,
  mode TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS trades_at_idx ON trades (at DESC);

CREATE TABLE IF NOT EXISTS portfolio_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  starting_cash REAL NOT NULL,
  cash REAL NOT NULL,
  reserved_cash REAL NOT NULL,
  equity REAL NOT NULL,
  exposure REAL NOT NULL,
  realized_pnl REAL NOT NULL,
  unrealized_pnl REAL NOT NULL,
  total_pnl REAL NOT NULL,
  positions TEXT NOT NULL,
  open_orders INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS portfolio_at_idx ON portfolio_snapshots (at DESC);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  kind TEXT NOT NULL,
  severity TEXT NOT NULL,
  message TEXT NOT NULL,
  details TEXT
);
CREATE INDEX IF NOT EXISTS events_at_idx ON events (at DESC);
`;

export class PolyHunterDb {
  private readonly db: DatabaseSync;

  public constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.db.exec(MIGRATIONS);
  }

  public static inMemory(): PolyHunterDb {
    return new PolyHunterDb(':memory:');
  }

  public close(): void {
    this.db.close();
  }

  public upsertMarket(market: Market, now: number): void {
    this.db
      .prepare(
        `INSERT INTO markets (
          id, condition_id, slug, question, end_date, liquidity, volume_24h,
          yes_token_id, no_token_id, tick_size, neg_risk, active, closed,
          accepting_orders, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          condition_id = excluded.condition_id,
          slug = excluded.slug,
          question = excluded.question,
          end_date = excluded.end_date,
          liquidity = excluded.liquidity,
          volume_24h = excluded.volume_24h,
          yes_token_id = excluded.yes_token_id,
          no_token_id = excluded.no_token_id,
          tick_size = excluded.tick_size,
          neg_risk = excluded.neg_risk,
          active = excluded.active,
          closed = excluded.closed,
          accepting_orders = excluded.accepting_orders,
          updated_at = excluded.updated_at`,
      )
      .run(
        market.id,
        market.conditionId,
        market.slug,
        market.question,
        market.endDate,
        market.liquidity,
        market.volume24h,
        market.yesTokenId,
        market.noTokenId,
        market.tickSize,
        market.negRisk ? 1 : 0,
        market.active ? 1 : 0,
        market.closed ? 1 : 0,
        market.acceptingOrders ? 1 : 0,
        now,
      );
  }

  public listMarkets(limit = 100): Market[] {
    const rows = this.db
      .prepare(
        `SELECT id, condition_id, slug, question, end_date, liquidity, volume_24h,
          yes_token_id, no_token_id, tick_size, neg_risk, active, closed, accepting_orders
        FROM markets ORDER BY volume_24h DESC LIMIT ?`,
      )
      .all(limit);

    return rows.map((row) => ({
      id: asString(row.id),
      conditionId: asString(row.condition_id),
      slug: asString(row.slug),
      question: asString(row.question),
      endDate: row.end_date === null ? null : asString(row.end_date),
      liquidity: asNumber(row.liquidity),
      volume24h: asNumber(row.volume_24h),
      yesTokenId: asString(row.yes_token_id),
      noTokenId: asString(row.no_token_id),
      tickSize: asNumber(row.tick_size),
      negRisk: asBoolean(row.neg_risk),
      active: asBoolean(row.active),
      closed: asBoolean(row.closed),
      acceptingOrders: asBoolean(row.accepting_orders),
    }));
  }

  public insertSignal(signal: Signal): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO signals (
          id, at, market_id, token_id, outcome, action, fair_value, market_price,
          edge, confidence, accepted, reasons
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        signal.id,
        signal.at,
        signal.marketId,
        signal.tokenId,
        signal.outcome,
        signal.action,
        signal.fairValue,
        signal.marketPrice,
        signal.edge,
        signal.confidence,
        signal.accepted ? 1 : 0,
        JSON.stringify(signal.reasons),
      );
  }

  public listSignals(limit = 100): Signal[] {
    const rows = this.db
      .prepare(
        `SELECT id, at, market_id, token_id, outcome, action, fair_value,
          market_price, edge, confidence, accepted, reasons
        FROM signals ORDER BY at DESC LIMIT ?`,
      )
      .all(limit);

    return rows.map((row) => ({
      id: asString(row.id),
      at: asNumber(row.at),
      marketId: asString(row.market_id),
      tokenId: asString(row.token_id),
      outcome: asString(row.outcome) === 'NO' ? 'NO' : 'YES',
      action: asString(row.action) as Signal['action'],
      fairValue: asNumber(row.fair_value),
      marketPrice: asNumber(row.market_price),
      edge: asNumber(row.edge),
      confidence: asNumber(row.confidence),
      accepted: asBoolean(row.accepted),
      reasons: parseReasons(row.reasons),
    }));
  }

  public insertTrade(trade: Trade): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO trades (
          id, at, market_id, token_id, outcome, side, price, size, notional,
          fee, realized_pnl, order_id, mode
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        trade.id,
        trade.at,
        trade.marketId,
        trade.tokenId,
        trade.outcome,
        trade.side,
        trade.price,
        trade.size,
        trade.notional,
        trade.fee,
        trade.realizedPnl,
        trade.orderId,
        trade.mode,
      );
  }

  public listTrades(limit = 100): Trade[] {
    const rows = this.db
      .prepare(
        `SELECT id, at, market_id, token_id, outcome, side, price, size, notional,
          fee, realized_pnl, order_id, mode
        FROM trades ORDER BY at DESC LIMIT ?`,
      )
      .all(limit);

    return rows.map((row) => ({
      id: asString(row.id),
      at: asNumber(row.at),
      marketId: asString(row.market_id),
      tokenId: asString(row.token_id),
      outcome: asString(row.outcome) === 'NO' ? 'NO' : 'YES',
      side: asString(row.side) === 'SELL' ? 'SELL' : 'BUY',
      price: asNumber(row.price),
      size: asNumber(row.size),
      notional: asNumber(row.notional),
      fee: asNumber(row.fee),
      realizedPnl: asNumber(row.realized_pnl),
      orderId: asString(row.order_id),
      mode: asString(row.mode) === 'live' ? 'live' : 'paper',
    }));
  }

  public insertPortfolioSnapshot(snapshot: PortfolioSnapshot): void {
    this.db
      .prepare(
        `INSERT INTO portfolio_snapshots (
          at, starting_cash, cash, reserved_cash, equity, exposure, realized_pnl,
          unrealized_pnl, total_pnl, positions, open_orders
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        snapshot.updatedAt,
        snapshot.startingCash,
        snapshot.cash,
        snapshot.reservedCash,
        snapshot.equity,
        snapshot.exposure,
        snapshot.realizedPnl,
        snapshot.unrealizedPnl,
        snapshot.totalPnl,
        JSON.stringify(snapshot.positions),
        snapshot.openOrders,
      );
  }

  public listPortfolioSnapshots(limit = 500): PortfolioSnapshot[] {
    const rows = this.db
      .prepare(
        `SELECT at, starting_cash, cash, reserved_cash, equity, exposure,
          realized_pnl, unrealized_pnl, total_pnl, positions, open_orders
        FROM portfolio_snapshots ORDER BY at DESC LIMIT ?`,
      )
      .all(limit);

    return rows.map((row) => ({
      startingCash: asNumber(row.starting_cash),
      cash: asNumber(row.cash),
      reservedCash: asNumber(row.reserved_cash),
      equity: asNumber(row.equity),
      exposure: asNumber(row.exposure),
      realizedPnl: asNumber(row.realized_pnl),
      unrealizedPnl: asNumber(row.unrealized_pnl),
      totalPnl: asNumber(row.total_pnl),
      positions: parsePositions(row.positions),
      openOrders: asNumber(row.open_orders),
      updatedAt: asNumber(row.at),
    }));
  }

  public insertEvent(event: EventRecord): void {
    this.db
      .prepare(`INSERT INTO events (at, kind, severity, message, details) VALUES (?, ?, ?, ?, ?)`)
      .run(event.at, event.kind, event.severity, event.message, event.details);
  }

  public listEvents(limit = 100): EventRecord[] {
    const rows = this.db
      .prepare(`SELECT at, kind, severity, message, details FROM events ORDER BY at DESC LIMIT ?`)
      .all(limit);

    return rows.map((row) => {
      const severity = asString(row.severity);
      return {
        at: asNumber(row.at),
        kind: asString(row.kind),
        severity: severity === 'warn' || severity === 'error' ? severity : 'info',
        message: asString(row.message),
        details: row.details === null ? null : asString(row.details),
      };
    });
  }
}
