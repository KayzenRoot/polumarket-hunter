import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { makePortfolio, makeSession, makeSignal, makeTrade } from '@polyhunter/testkit';
import { describe, expect, it } from 'vitest';
import { PolyHunterDb } from '../src/index.js';

describe('paper sessions', () => {
  it('stores, updates and lists runs', () => {
    const db = PolyHunterDb.inMemory();
    const session = makeSession({ id: 'session-a' });
    db.insertRun(session);
    db.insertRun(makeSession({ id: 'session-b', startedAt: 2_000_000, status: 'stopped' }));

    expect(db.getRun('session-a')).toEqual(session);
    expect(db.getRun('missing')).toBeNull();

    db.updateRun('session-a', {
      status: 'stopped',
      endedAt: 2_000_000,
      endingEquity: 1012.5,
      stopReason: 'engine stopped',
    });

    const updated = db.getRun('session-a');
    expect(updated).toMatchObject({
      status: 'stopped',
      endedAt: 2_000_000,
      endingEquity: 1012.5,
      stopReason: 'engine stopped',
    });
    expect(db.listRuns()).toHaveLength(2);
    expect(db.listRuns(1)[0]?.id).toBe('session-b');
    db.close();
  });

  it('filters signals, trades and snapshots by session', () => {
    const db = PolyHunterDb.inMemory();
    db.insertSignal(makeSignal({ id: 'signal-a', at: 1000 }), 'session-a');
    db.insertSignal(makeSignal({ id: 'signal-b', at: 2000 }), 'session-b');
    db.insertTrade(makeTrade({ id: 'trade-a', at: 1000 }), 'session-a');
    db.insertTrade(makeTrade({ id: 'trade-b', at: 2000 }), 'session-b');
    db.insertPortfolioSnapshot(makePortfolio({ updatedAt: 1000 }), 'session-a');
    db.insertPortfolioSnapshot(makePortfolio({ updatedAt: 2000 }), 'session-b');

    expect(db.listSignals(100, 'session-a').map((signal) => signal.id)).toEqual(['signal-a']);
    expect(db.listTrades(100, 'session-b').map((trade) => trade.id)).toEqual(['trade-b']);
    expect(db.listPortfolioSnapshots(100, 'session-a')).toHaveLength(1);
    expect(db.listSignals()).toHaveLength(2);
    expect(db.listTrades()).toHaveLength(2);
    expect(db.listPortfolioSnapshots()).toHaveLength(2);
    db.close();
  });

  it('keeps legacy rows readable', () => {
    const db = PolyHunterDb.inMemory();
    db.insertSignal(makeSignal({ id: 'legacy-signal' }));
    db.insertTrade(makeTrade({ id: 'legacy-trade' }));
    db.insertPortfolioSnapshot(makePortfolio());

    expect(db.listSignals()).toHaveLength(1);
    expect(db.listTrades()).toHaveLength(1);
    expect(db.listPortfolioSnapshots()).toHaveLength(1);
    db.close();
  });

  it('migrates a legacy database and stays repeatable', () => {
    const directory = mkdtempSync(join(tmpdir(), 'polyhunter-sessions-'));
    const path = join(directory, 'legacy.db');
    const legacy = new DatabaseSync(path);
    legacy.exec(`
      CREATE TABLE signals (
        id TEXT PRIMARY KEY, at INTEGER NOT NULL, market_id TEXT NOT NULL,
        token_id TEXT NOT NULL, outcome TEXT NOT NULL, action TEXT NOT NULL,
        fair_value REAL NOT NULL, market_price REAL NOT NULL, edge REAL NOT NULL,
        confidence REAL NOT NULL, accepted INTEGER NOT NULL, reasons TEXT NOT NULL
      );
      CREATE TABLE trades (
        id TEXT PRIMARY KEY, at INTEGER NOT NULL, market_id TEXT NOT NULL,
        token_id TEXT NOT NULL, outcome TEXT NOT NULL, side TEXT NOT NULL,
        price REAL NOT NULL, size REAL NOT NULL, notional REAL NOT NULL,
        fee REAL NOT NULL, realized_pnl REAL NOT NULL, order_id TEXT NOT NULL,
        mode TEXT NOT NULL
      );
      CREATE TABLE portfolio_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL,
        starting_cash REAL NOT NULL, cash REAL NOT NULL, reserved_cash REAL NOT NULL,
        equity REAL NOT NULL, exposure REAL NOT NULL, realized_pnl REAL NOT NULL,
        unrealized_pnl REAL NOT NULL, total_pnl REAL NOT NULL, positions TEXT NOT NULL,
        open_orders INTEGER NOT NULL
      );
      INSERT INTO signals VALUES (
        'legacy-signal', 1000, 'market-1', 'yes-token', 'YES', 'BUY',
        0.5, 0.5, 0, 0.5, 1, '[]'
      );
      INSERT INTO trades VALUES (
        'legacy-trade', 2000, 'market-1', 'yes-token', 'YES', 'BUY',
        0.5, 10, 5, 0.01, 0, 'order-1', 'paper'
      );
      INSERT INTO portfolio_snapshots VALUES (
        1, 3000, 1000, 995, 0, 995, 5, 0, 0, -5, '[]', 0
      );
    `);
    legacy.close();

    const db = new PolyHunterDb(path);
    expect(db.listSignals(100, 'legacy').map((signal) => signal.id)).toEqual(['legacy-signal']);
    expect(db.listTrades(100, 'legacy').map((trade) => trade.id)).toEqual(['legacy-trade']);
    expect(db.listPortfolioSnapshots(100, 'legacy')).toHaveLength(1);
    db.insertTrade(makeTrade({ id: 'session-trade' }), 'session-a');
    expect(db.listTrades(100, 'session-a').map((trade) => trade.id)).toEqual(['session-trade']);
    db.close();

    const reopened = new PolyHunterDb(path);
    expect(reopened.listTrades(100, 'legacy')).toHaveLength(1);
    expect(reopened.listTrades(100, 'session-a')).toHaveLength(1);
    reopened.close();
    rmSync(directory, { recursive: true, force: true });
  });
});
