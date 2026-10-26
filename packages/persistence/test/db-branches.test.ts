import { makeMarket, makePortfolio, makeSignal, makeTrade } from '@polyhunter/testkit';
import { describe, expect, it } from 'vitest';
import { PolyHunterDb } from '../src/index.js';

describe('sqlite persistence branches', () => {
  it('preserves nullable end dates and risk flags', () => {
    const db = PolyHunterDb.inMemory();
    db.upsertMarket(makeMarket({ endDate: null, negRisk: true }), 1_000_000);
    const market = db.listMarkets()[0];
    expect(market?.endDate).toBeNull();
    expect(market?.negRisk).toBe(true);
    expect(db.listMarkets(1)).toHaveLength(1);
    db.close();
  });

  it('round-trips NO outcomes and sell trades', () => {
    const db = PolyHunterDb.inMemory();
    db.insertSignal(
      makeSignal({
        id: 'no-signal',
        outcome: 'NO',
        action: 'TAKE_SELL',
        accepted: false,
        reasons: [],
      }),
    );
    db.insertTrade(
      makeTrade({
        id: 'sell-trade',
        outcome: 'NO',
        side: 'SELL',
        mode: 'live',
        realizedPnl: -1.5,
      }),
    );

    const signal = db.listSignals()[0];
    const trade = db.listTrades()[0];
    expect(signal?.outcome).toBe('NO');
    expect(signal?.action).toBe('TAKE_SELL');
    expect(signal?.accepted).toBe(false);
    expect(trade?.side).toBe('SELL');
    expect(trade?.mode).toBe('live');
    db.close();
  });

  it('round-trips event severities', () => {
    const db = PolyHunterDb.inMemory();
    db.insertEvent({ at: 1, kind: 'a', severity: 'error', message: 'a', details: null });
    db.insertEvent({ at: 2, kind: 'b', severity: 'info', message: 'b', details: 'x' });
    const events = db.listEvents();
    expect(events.map((event) => event.severity)).toEqual(['info', 'error']);
    expect(events[0]?.details).toBe('x');
    db.close();
  });

  it('returns empty snapshots when no data exists', () => {
    const db = PolyHunterDb.inMemory();
    expect(db.listPortfolioSnapshots()).toEqual([]);
    expect(db.listMarkets()).toEqual([]);
    expect(db.listSignals()).toEqual([]);
    expect(db.listTrades()).toEqual([]);
    expect(db.listEvents()).toEqual([]);
    db.close();
  });

  it('stores a portfolio snapshot with empty positions', () => {
    const db = PolyHunterDb.inMemory();
    db.insertPortfolioSnapshot(makePortfolio({ positions: [], updatedAt: 5 }));
    const snapshot = db.listPortfolioSnapshots()[0];
    expect(snapshot?.positions).toEqual([]);
    expect(snapshot?.updatedAt).toBe(5);
    db.close();
  });
});
