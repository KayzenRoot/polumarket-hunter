import {
  makeBook,
  makeIntent,
  makePortfolio,
  makePosition,
  makeRiskLimits,
} from '@polyhunter/testkit';
import { describe, expect, it } from 'vitest';
import { createPortfolio, markPortfolio, RiskController } from '../src/index.js';

function allowedInput() {
  return {
    now: 1_000_000,
    portfolio: makePortfolio(),
    book: makeBook(),
    intent: makeIntent(),
    hasOpenOrder: false,
  };
}

describe('risk controller', () => {
  it('allows a healthy order', () => {
    const risk = new RiskController(makeRiskLimits(), 1000);
    const decision = risk.evaluate(allowedInput());
    expect(decision.allowed).toBe(true);
    expect(decision.reasons).toEqual([]);
  });

  it('blocks everything after a kill switch', () => {
    const risk = new RiskController(makeRiskLimits(), 1000);
    risk.kill('operator emergency');
    const decision = risk.evaluate(allowedInput());
    expect(decision.allowed).toBe(false);
    expect(decision.reasons.join(' ')).toContain('kill-switch');
    risk.resetKill();
    expect(risk.evaluate(allowedInput()).allowed).toBe(true);
  });

  it('blocks a duplicate open order', () => {
    const risk = new RiskController(makeRiskLimits(), 1000);
    const decision = risk.evaluate({ ...allowedInput(), hasOpenOrder: true });
    expect(decision.allowed).toBe(false);
    expect(decision.reasons.join(' ')).toContain('duplicate-order');
  });

  it('blocks after the daily loss limit', () => {
    const risk = new RiskController(makeRiskLimits({ maxDailyLoss: 10 }), 1000);
    risk.observeEquity(980, -20);
    const decision = risk.evaluate(allowedInput());
    expect(decision.allowed).toBe(false);
    expect(decision.reasons.join(' ')).toContain('daily-loss');
  });

  it('blocks after the drawdown limit', () => {
    const risk = new RiskController(makeRiskLimits({ maxDrawdownPct: 0.1 }), 1000);
    risk.observeEquity(1000, 0);
    const decision = risk.evaluate({
      ...allowedInput(),
      portfolio: makePortfolio({ equity: 850, totalPnl: -150 }),
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reasons.join(' ')).toContain('drawdown');
  });

  it('blocks a market notional breach', () => {
    const risk = new RiskController(makeRiskLimits({ maxNotionalPerMarket: 10 }), 1000);
    const decision = risk.evaluate({
      ...allowedInput(),
      portfolio: makePortfolio({
        positions: [makePosition({ shares: 20, avgPrice: 0.5 })],
        exposure: 10,
      }),
      intent: makeIntent({ price: 0.49, size: 20 }),
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reasons.join(' ')).toContain('market-notional');
  });

  it('blocks a total exposure breach', () => {
    const risk = new RiskController(makeRiskLimits({ maxTotalNotional: 100 }), 1000);
    const decision = risk.evaluate({
      ...allowedInput(),
      portfolio: makePortfolio({ exposure: 95 }),
      intent: makeIntent({ price: 0.49, size: 20 }),
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reasons.join(' ')).toContain('total-exposure');
  });

  it('blocks a new position when the open-position cap is reached', () => {
    const risk = new RiskController(makeRiskLimits({ maxOpenPositions: 1 }), 1000);
    const decision = risk.evaluate({
      ...allowedInput(),
      portfolio: makePortfolio({
        positions: [makePosition({ tokenId: 'other-token', marketId: 'other-market' })],
      }),
      intent: makeIntent({ tokenId: 'new-token' }),
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reasons.join(' ')).toContain('open-positions');
  });

  it('blocks a buy without available cash', () => {
    const risk = new RiskController(makeRiskLimits(), 1000);
    const decision = risk.evaluate({
      ...allowedInput(),
      portfolio: makePortfolio({ cash: 5, equity: 5, startingCash: 5 }),
      intent: makeIntent({ price: 0.49, size: 20 }),
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reasons.join(' ')).toContain('available-cash');
  });

  it('blocks a sell without enough position', () => {
    const risk = new RiskController(makeRiskLimits(), 1000);
    const decision = risk.evaluate({
      ...allowedInput(),
      intent: makeIntent({ action: 'TAKE_SELL', price: 0.49, size: 10 }),
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reasons.join(' ')).toContain('position-size');
  });

  it('blocks when the order rate limit is exhausted', () => {
    const risk = new RiskController(makeRiskLimits({ maxOrdersPerMinute: 2 }), 1000);
    risk.recordOrder(1_000_000);
    risk.recordOrder(1_000_000);
    const decision = risk.evaluate(allowedInput());
    expect(decision.allowed).toBe(false);
    expect(decision.reasons.join(' ')).toContain('order-rate');
  });

  it('prunes order timestamps older than one minute', () => {
    const risk = new RiskController(makeRiskLimits({ maxOrdersPerMinute: 1 }), 1000);
    risk.recordOrder(1_000_000);
    expect(risk.ordersLastMinute(1_000_000)).toBe(1);
    expect(risk.ordersLastMinute(1_061_000)).toBe(0);
  });

  it('builds a risk snapshot', () => {
    const portfolio = markPortfolio(createPortfolio(1000, 1_000_000), new Map(), 1_000_000);
    const risk = new RiskController(makeRiskLimits(), 1000);
    risk.observeEquity(1000, 0);
    const snapshot = risk.snapshot(portfolio, 3);
    expect(snapshot.killSwitch).toBe(false);
    expect(snapshot.ordersLastMinute).toBe(3);
    expect(snapshot.limits.maxOpenPositions).toBe(10);
  });
});
