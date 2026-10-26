import { makeMarket, makePortfolio, makeSignal, makeTrade } from '@polyhunter/testkit';
import { describe, expect, it } from 'vitest';
import { PolyHunterDb } from '../src/index.js';

describe('sqlite persistence', () => {
  it('creates an in-memory database and stores markets idempotently', () => {
    const db = PolyHunterDb.inMemory();
    db.upsertMarket(makeMarket(), 1_000_000);
    db.upsertMarket(makeMarket({ question: 'Updated question' }), 1_000_001);

    const markets = db.listMarkets();
    expect(markets).toHaveLength(1);
    expect(markets[0]?.question).toBe('Updated question');
    db.close();
  });

  it('stores and lists signals newest first', () => {
    const db = PolyHunterDb.inMemory();
    db.insertSignal(makeSignal({ id: 'a', at: 1000 }));
    db.insertSignal(makeSignal({ id: 'b', at: 2000, reasons: ['one', 'two'] }));

    const signals = db.listSignals();
    expect(signals.map((signal) => signal.id)).toEqual(['b', 'a']);
    expect(signals[0]?.reasons).toEqual(['one', 'two']);
    db.close();
  });

  it('stores and lists trades', () => {
    const db = PolyHunterDb.inMemory();
    db.insertTrade(makeTrade({ id: 't1', at: 1000, side: 'BUY' }));
    db.insertTrade(makeTrade({ id: 't2', at: 2000, side: 'SELL', realizedPnl: 1.25 }));

    const trades = db.listTrades();
    expect(trades.map((trade) => trade.id)).toEqual(['t2', 't1']);
    expect(trades[0]?.side).toBe('SELL');
    expect(trades[0]?.realizedPnl).toBe(1.25);
    db.close();
  });

  it('stores and lists portfolio snapshots', () => {
    const db = PolyHunterDb.inMemory();
    db.insertPortfolioSnapshot(
      makePortfolio({
        updatedAt: 1000,
        positions: [
          {
            marketId: 'market-1',
            tokenId: 'yes-token',
            outcome: 'YES',
            shares: 10,
            avgPrice: 0.5,
            openedAt: 900,
            updatedAt: 1000,
          },
        ],
      }),
    );

    const snapshots = db.listPortfolioSnapshots();
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]?.positions[0]?.tokenId).toBe('yes-token');
    db.close();
  });

  it('stores and lists risk events', () => {
    const db = PolyHunterDb.inMemory();
    db.insertEvent({
      at: 1000,
      kind: 'kill-switch',
      severity: 'warn',
      message: 'operator stop',
      details: null,
    });
    const events = db.listEvents();
    expect(events[0]).toMatchObject({ kind: 'kill-switch', severity: 'warn' });
    db.close();
  });

  it('respects list limits', () => {
    const db = PolyHunterDb.inMemory();
    for (let index = 0; index < 10; index += 1) {
      db.insertSignal(makeSignal({ id: `s${index}`, at: index }));
    }
    expect(db.listSignals(3)).toHaveLength(3);
    db.close();
  });
});
