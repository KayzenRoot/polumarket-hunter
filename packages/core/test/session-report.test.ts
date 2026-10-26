import { makePortfolio, makeSession, makeSignal, makeTrade } from '@polyhunter/testkit';
import { describe, expect, it } from 'vitest';
import { buildSessionReport, sessionReportCsv } from '../src/index.js';

const SESSION = makeSession({
  id: 'session-report',
  status: 'stopped',
  endedAt: 1_100_000,
  endingEquity: 1012.5,
  stopReason: 'engine stopped',
});

describe('session report', () => {
  it('builds deterministic metrics from persisted rows', () => {
    const buy = makeTrade({
      id: 'trade-buy',
      at: 1_010_000,
      side: 'BUY',
      price: 0.5,
      size: 10,
      notional: 5,
      fee: 0.01,
      realizedPnl: 0,
    });
    const sell = makeTrade({
      id: 'trade-sell',
      at: 1_020_000,
      side: 'SELL',
      price: 0.6,
      size: 10,
      notional: 6,
      fee: 0.02,
      realizedPnl: 0.97,
    });
    const accepted = makeSignal({ id: 'signal-a', at: 1_009_000, accepted: true });
    const rejected = makeSignal({
      id: 'signal-b',
      at: 1_019_000,
      accepted: false,
      reasons: ['kill-switch: operator, manual'],
    });
    const report = buildSessionReport({
      session: SESSION,
      trades: [sell, buy],
      signals: [rejected, accepted],
      snapshots: [
        makePortfolio({ updatedAt: 1_040_000, equity: 1008, exposure: 3 }),
        makePortfolio({ updatedAt: 1_030_000, equity: 1004, exposure: 5 }),
      ],
    });

    expect(report.trades.map((trade) => trade.id)).toEqual(['trade-buy', 'trade-sell']);
    expect(report.signals.map((signal) => signal.id)).toEqual(['signal-a', 'signal-b']);
    expect(report.metrics).toMatchObject({
      incomplete: false,
      startingCash: 1000,
      endingEquity: 1012.5,
      totalPnl: 12.5,
      totalReturnPct: 0.0125,
      fees: 0.03,
      trades: 2,
      buys: 1,
      sells: 1,
      wins: 1,
      losses: 0,
      winRate: 1,
      signals: 2,
      acceptedSignals: 1,
      rejectedSignals: 1,
      rejectionsByReason: { 'kill-switch': 1 },
    });
    expect(report.equityCurve.map((point) => point.at)).toEqual([1_030_000, 1_040_000]);
    expect(report.rejections[0]?.reasons[0]).toBe('kill-switch: operator, manual');
  });

  it('handles a running session with no ending equity', () => {
    const report = buildSessionReport({
      session: makeSession({ status: 'running', endedAt: null, endingEquity: null }),
      trades: [],
      signals: [],
      snapshots: [makePortfolio({ updatedAt: 1_050_000, equity: 1005, unrealizedPnl: 5 })],
    });
    expect(report.metrics.incomplete).toBe(true);
    expect(report.metrics.endingEquity).toBe(1005);
    expect(report.metrics.totalPnl).toBe(5);
    expect(report.metrics.unrealizedPnl).toBe(5);
  });

  it('handles an empty completed session', () => {
    const report = buildSessionReport({
      session: makeSession({ status: 'stopped', endedAt: 1_100_000, endingEquity: 1000 }),
      trades: [],
      signals: [],
      snapshots: [],
    });
    expect(report.metrics).toMatchObject({
      incomplete: false,
      endingEquity: 1000,
      totalPnl: 0,
      trades: 0,
      signals: 0,
      winRate: 0,
      rejectionsByReason: {},
    });
    expect(report.equityCurve).toEqual([]);
  });

  it('exports sectioned CSV with escaped reasons', () => {
    const rejected = makeSignal({
      id: 'signal-b',
      accepted: false,
      reasons: ['kill-switch: operator, manual'],
    });
    const csv = sessionReportCsv(
      buildSessionReport({
        session: SESSION,
        trades: [makeTrade({ id: 'trade-1', fee: 0.01 })],
        signals: [rejected],
        snapshots: [makePortfolio({ updatedAt: 1_030_000 })],
      }),
    );

    expect(csv).toContain('# session');
    expect(csv).toContain('session-report');
    expect(csv).toContain('# metrics');
    expect(csv).toContain('metric,value');
    expect(csv).toContain('# trades');
    expect(csv).toContain('trade-1');
    expect(csv).toContain('# signals');
    expect(csv).toContain('"kill-switch: operator, manual"');
    expect(csv).toContain('# equity');
  });
});
