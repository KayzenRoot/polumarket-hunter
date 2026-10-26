import { roundMoney, roundTo } from './money.js';
import { midPrice } from './orderbook.js';
import { PaperBroker } from './paper-broker.js';
import { RiskController } from './risk.js';
import type {
  BacktestMetrics,
  EquityPoint,
  OrderBook,
  PaperOrder,
  PortfolioSnapshot,
  RiskLimits,
  Signal,
  Strategy,
  StrategyConfig,
  Trade,
} from './types.js';

export interface BacktestOptions {
  readonly books: readonly OrderBook[];
  readonly strategy: Strategy;
  readonly strategyConfig: StrategyConfig;
  readonly riskLimits: RiskLimits;
  readonly startingCash: number;
  readonly feeBps: number;
  readonly orderTtlMs: number;
}

export interface BacktestResult {
  readonly metrics: BacktestMetrics;
  readonly trades: readonly Trade[];
  readonly signals: readonly Signal[];
  readonly orders: readonly PaperOrder[];
  readonly portfolio: PortfolioSnapshot;
}

function maxDrawdown(curve: readonly EquityPoint[]): number {
  let peak = 0;
  let worst = 0;
  for (const point of curve) {
    if (point.equity > peak) {
      peak = point.equity;
    }
    if (peak > 0) {
      worst = Math.max(worst, (peak - point.equity) / peak);
    }
  }
  return roundTo(worst, 6);
}

export function runBacktest(options: BacktestOptions): BacktestResult {
  const { books, strategy, riskLimits, startingCash, feeBps, orderTtlMs } = options;
  if (books.length === 0) {
    const emptyCurve: EquityPoint[] = [];
    return {
      metrics: {
        books: 0,
        signals: 0,
        acceptedSignals: 0,
        ordersPlaced: 0,
        fills: 0,
        trades: 0,
        wins: 0,
        losses: 0,
        winRate: 0,
        startingCash,
        endingEquity: startingCash,
        totalReturnPct: 0,
        realizedPnl: 0,
        unrealizedPnl: 0,
        totalPnl: 0,
        fees: 0,
        grossProfit: 0,
        grossLoss: 0,
        profitFactor: 0,
        avgTradePnl: 0,
        maxDrawdownPct: 0,
        maxExposure: 0,
        fillRate: 0,
        equityCurve: emptyCurve,
      },
      trades: [],
      signals: [],
      orders: [],
      portfolio: new PaperBroker({ startingCash, feeBps, now: () => Date.now() }).mark(new Map()),
    };
  }

  let clock = books[0]?.timestamp ?? Date.now();
  const broker = new PaperBroker({
    startingCash,
    feeBps,
    now: () => clock,
    idFactory: (() => {
      let counter = 0;
      return (prefix: string) => {
        counter += 1;
        return `${prefix}_bt_${counter.toString(36)}`;
      };
    })(),
  });
  const risk = new RiskController(riskLimits, startingCash);
  const signals: Signal[] = [];
  const orders: PaperOrder[] = [];
  const marks = new Map<string, number>();
  const equityCurve: EquityPoint[] = [];
  const lastEntryAt = new Map<string, number>();
  let acceptedSignals = 0;
  let ordersPlaced = 0;

  books.forEach((book, index) => {
    clock = book.timestamp > 0 ? book.timestamp : clock + 1;
    const now = clock;

    broker.onBook(book);

    const mid = midPrice(book);
    if (mid !== null) {
      marks.set(book.tokenId, mid);
    }

    for (const openOrder of broker.openOrders) {
      if (now - openOrder.createdAt > orderTtlMs) {
        broker.cancel(openOrder.id, 'time-to-live expired');
      }
    }

    const portfolio = broker.mark(marks);
    risk.observeEquity(portfolio.equity, portfolio.totalPnl);

    const position = broker.positionForToken(book.tokenId);
    const intent = strategy.evaluate(book, {
      now,
      position,
      lastEntryAt: lastEntryAt.get(book.tokenId) ?? null,
    });

    if (intent.action !== 'HOLD') {
      const decision = risk.evaluate({
        now,
        portfolio,
        book,
        intent,
        hasOpenOrder: broker.hasOpenOrder(
          book.tokenId,
          intent.action === 'PLACE_ASK' || intent.action === 'TAKE_SELL' ? 'SELL' : 'BUY',
        ),
      });

      let accepted = decision.allowed;
      if (accepted) {
        const isLimit = intent.action === 'PLACE_BID' || intent.action === 'PLACE_ASK';
        const result = broker.place(
          {
            marketId: intent.marketId,
            tokenId: intent.tokenId,
            outcome: intent.outcome,
            side: intent.action === 'PLACE_ASK' || intent.action === 'TAKE_SELL' ? 'SELL' : 'BUY',
            type: isLimit ? 'limit' : 'market',
            limitPrice: isLimit ? intent.price : null,
            size: intent.size,
            reason: intent.reasons.join('; '),
          },
          book,
        );
        orders.push(result.order);
        if (result.order.status !== 'rejected') {
          ordersPlaced += 1;
          risk.recordOrder(now);
          if (intent.action === 'PLACE_BID' || intent.action === 'TAKE_BUY') {
            lastEntryAt.set(book.tokenId, now);
          }
        } else {
          accepted = false;
        }
      }

      if (accepted) {
        acceptedSignals += 1;
      }

      signals.push({
        id: `sig_bt_${index.toString(36)}`,
        at: now,
        marketId: intent.marketId,
        tokenId: intent.tokenId,
        outcome: intent.outcome,
        action: intent.action,
        fairValue: intent.fairValue,
        marketPrice: intent.price,
        edge: intent.edge,
        confidence: intent.confidence,
        accepted,
        reasons: accepted ? intent.reasons : [...intent.reasons, ...decision.reasons],
      });
    }

    const after = broker.mark(marks);
    equityCurve.push({
      at: now,
      equity: after.equity,
      exposure: after.exposure,
    });
  });

  const portfolio = broker.mark(marks);
  const trades = broker.trades;
  const closed = trades.filter((trade) => trade.side === 'SELL');
  const wins = closed.filter((trade) => trade.realizedPnl > 0);
  const losses = closed.filter((trade) => trade.realizedPnl < 0);
  const grossProfit = roundMoney(wins.reduce((sum, trade) => sum + trade.realizedPnl, 0));
  const grossLoss = roundMoney(Math.abs(losses.reduce((sum, trade) => sum + trade.realizedPnl, 0)));
  const totalPnl = roundMoney(portfolio.equity - startingCash);
  const fees = roundMoney(trades.reduce((sum, trade) => sum + trade.fee, 0));
  const closedPnl = roundMoney(closed.reduce((sum, trade) => sum + trade.realizedPnl, 0));

  const metrics: BacktestMetrics = {
    books: books.length,
    signals: signals.length,
    acceptedSignals,
    ordersPlaced,
    fills: trades.length,
    trades: closed.length,
    wins: wins.length,
    losses: losses.length,
    winRate: closed.length > 0 ? roundTo(wins.length / closed.length, 4) : 0,
    startingCash,
    endingEquity: portfolio.equity,
    totalReturnPct: startingCash > 0 ? roundTo(totalPnl / startingCash, 6) : 0,
    realizedPnl: portfolio.realizedPnl,
    unrealizedPnl: portfolio.unrealizedPnl,
    totalPnl,
    fees,
    grossProfit,
    grossLoss,
    profitFactor: grossLoss > 0 ? roundTo(grossProfit / grossLoss, 4) : grossProfit > 0 ? 999 : 0,
    avgTradePnl: closed.length > 0 ? roundTo(closedPnl / closed.length, 4) : 0,
    maxDrawdownPct: maxDrawdown(equityCurve),
    maxExposure: roundMoney(Math.max(...equityCurve.map((point) => point.exposure), 0)),
    fillRate: ordersPlaced > 0 ? roundTo(trades.length / ordersPlaced, 4) : 0,
    equityCurve,
  };

  return { metrics, trades, signals, orders, portfolio };
}

export function formatBacktestReport(result: BacktestResult): string {
  const m = result.metrics;
  const lines = [
    'PolyHunter backtest',
    '-------------------',
    `books             ${m.books}`,
    `signals           ${m.signals} (${m.acceptedSignals} accepted)`,
    `orders placed     ${m.ordersPlaced}`,
    `fills             ${m.fills}`,
    `closed trades     ${m.trades} (${m.wins} win / ${m.losses} loss)`,
    `win rate          ${(m.winRate * 100).toFixed(2)}%`,
    `starting cash     $${m.startingCash.toFixed(2)}`,
    `ending equity     $${m.endingEquity.toFixed(2)}`,
    `total return      ${(m.totalReturnPct * 100).toFixed(2)}%`,
    `realized PnL      $${m.realizedPnl.toFixed(2)}`,
    `unrealized PnL    $${m.unrealizedPnl.toFixed(2)}`,
    `fees              $${m.fees.toFixed(2)}`,
    `profit factor     ${m.profitFactor.toFixed(2)}`,
    `max drawdown      ${(m.maxDrawdownPct * 100).toFixed(2)}%`,
    `max exposure      $${m.maxExposure.toFixed(2)}`,
    `fill rate         ${(m.fillRate * 100).toFixed(2)}%`,
  ];
  return lines.join('\n');
}
