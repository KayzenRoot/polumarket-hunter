import { roundMoney, roundTo } from './money.js';
import { depthShares, isBookUsable, topOfBook } from './orderbook.js';
import type {
  OrderBook,
  PortfolioSnapshot,
  RiskCheck,
  RiskDecision,
  RiskLimits,
  RiskState,
  StrategyIntent,
} from './types.js';

export const DEFAULT_RISK_LIMITS: RiskLimits = {
  maxNotionalPerMarket: 25,
  maxTotalNotional: 100,
  maxOpenPositions: 6,
  maxDailyLoss: 25,
  maxDrawdownPct: 0.08,
  maxOrdersPerMinute: 20,
  maxBookAgeMs: 5000,
  maxSpread: 0.035,
  minDepthShares: 100,
};

export interface RiskEvaluationInput {
  readonly now: number;
  readonly portfolio: PortfolioSnapshot;
  readonly book: OrderBook;
  readonly intent: StrategyIntent;
  readonly hasOpenOrder: boolean;
}

function check(name: string, ok: boolean, detail: string): RiskCheck {
  return { name, ok, detail };
}

function marketNotional(
  portfolio: PortfolioSnapshot,
  marketId: string,
  tokenId: string,
  tokenPrice: number,
): number {
  let total = 0;
  for (const position of portfolio.positions) {
    if (position.marketId !== marketId) {
      continue;
    }
    const price = position.tokenId === tokenId ? tokenPrice : position.avgPrice;
    total += price * position.shares;
  }
  return roundMoney(total);
}

export class RiskController {
  private readonly limits: RiskLimits;
  private killed = false;
  private killReason: string | null = null;
  private orderTimestamps: number[] = [];
  private peakEquity: number;
  private dailyPnl = 0;

  public constructor(limits: RiskLimits, startingEquity: number) {
    this.limits = limits;
    this.peakEquity = roundMoney(startingEquity);
  }

  public get killSwitch(): boolean {
    return this.killed;
  }

  public get reason(): string | null {
    return this.killReason;
  }

  public kill(reason: string): void {
    this.killed = true;
    this.killReason = reason;
  }

  public resetKill(): void {
    this.killed = false;
    this.killReason = null;
  }

  public recordOrder(now: number): void {
    this.orderTimestamps.push(now);
    this.pruneOrders(now);
  }

  public ordersLastMinute(now: number): number {
    this.pruneOrders(now);
    return this.orderTimestamps.length;
  }

  public observeEquity(equity: number, totalPnl: number): void {
    if (equity > this.peakEquity) {
      this.peakEquity = roundMoney(equity);
    }
    this.dailyPnl = roundMoney(totalPnl);
  }

  public autoKillReason(portfolio: PortfolioSnapshot): string | null {
    if (this.killed) {
      return null;
    }
    if (this.dailyPnl <= -this.limits.maxDailyLoss) {
      return `daily loss limit: ${this.dailyPnl} <= -${this.limits.maxDailyLoss}`;
    }
    const drawdown = this.drawdownPct(portfolio);
    if (drawdown >= this.limits.maxDrawdownPct) {
      return `drawdown limit: ${drawdown} >= ${this.limits.maxDrawdownPct}`;
    }
    return null;
  }

  public drawdownPct(portfolio: PortfolioSnapshot): number {
    if (this.peakEquity <= 0) {
      return 0;
    }
    return roundTo(Math.max(0, (this.peakEquity - portfolio.equity) / this.peakEquity), 6);
  }

  public evaluate(input: RiskEvaluationInput): RiskDecision {
    const { now, portfolio, book, intent, hasOpenOrder } = input;
    const top = topOfBook(book);
    const side = intent.action === 'PLACE_ASK' || intent.action === 'TAKE_SELL' ? 'SELL' : 'BUY';
    const isBuy = side === 'BUY';
    const ageCheck = isBookUsable(book, this.limits.maxBookAgeMs, now);
    const openPositions = portfolio.positions.length;
    const existingPosition = portfolio.positions.find(
      (position) => position.tokenId === intent.tokenId,
    );
    const notional = roundMoney(intent.price * intent.size);
    const marketExposure = marketNotional(portfolio, intent.marketId, intent.tokenId, intent.price);
    const drawdown = this.drawdownPct(portfolio);

    const checks: RiskCheck[] = [
      check('kill-switch', !this.killed, this.killed ? (this.killReason ?? 'killed') : 'clear'),
      check(
        'action',
        intent.action !== 'HOLD',
        intent.action === 'HOLD' ? 'strategy intent is HOLD' : intent.action,
      ),
      check('order-size', Number.isFinite(intent.size) && intent.size > 0, `size=${intent.size}`),
      check(
        'order-price',
        Number.isFinite(intent.price) && intent.price > 0 && intent.price < 1,
        `price=${intent.price}`,
      ),
      check('book-usable', ageCheck.ok, ageCheck.reasons.join('; ') || 'ok'),
      check(
        'spread',
        top !== null && top.spread <= this.limits.maxSpread,
        top === null ? 'no top of book' : `${top.spread} <= ${this.limits.maxSpread}`,
      ),
      check(
        'depth',
        depthShares(book, side, 3) >= this.limits.minDepthShares,
        `${depthShares(book, side, 3)} >= ${this.limits.minDepthShares}`,
      ),
      check(
        'daily-loss',
        this.dailyPnl > -this.limits.maxDailyLoss,
        `dailyPnl=${this.dailyPnl} > -${this.limits.maxDailyLoss}`,
      ),
      check(
        'drawdown',
        drawdown < this.limits.maxDrawdownPct,
        `drawdown=${drawdown} < ${this.limits.maxDrawdownPct}`,
      ),
      check(
        'order-rate',
        this.ordersLastMinute(now) < this.limits.maxOrdersPerMinute,
        `${this.ordersLastMinute(now)} < ${this.limits.maxOrdersPerMinute}`,
      ),
      check('duplicate-order', !hasOpenOrder, hasOpenOrder ? 'open order already exists' : 'none'),
    ];

    if (isBuy) {
      checks.push(
        check(
          'market-notional',
          marketExposure + notional <= this.limits.maxNotionalPerMarket,
          `${roundMoney(marketExposure + notional)} <= ${this.limits.maxNotionalPerMarket}`,
        ),
        check(
          'total-exposure',
          portfolio.exposure + notional <= this.limits.maxTotalNotional,
          `${roundMoney(portfolio.exposure + notional)} <= ${this.limits.maxTotalNotional}`,
        ),
        check(
          'open-positions',
          existingPosition !== undefined || openPositions < this.limits.maxOpenPositions,
          existingPosition !== undefined
            ? 'existing position'
            : `${openPositions} < ${this.limits.maxOpenPositions}`,
        ),
        check(
          'available-cash',
          portfolio.cash - portfolio.reservedCash >= notional,
          `${roundMoney(portfolio.cash - portfolio.reservedCash)} >= ${notional}`,
        ),
      );
    } else {
      checks.push(
        check(
          'position-size',
          existingPosition !== undefined && existingPosition.shares >= intent.size,
          existingPosition === undefined
            ? 'no position'
            : `${existingPosition.shares} >= ${intent.size}`,
        ),
      );
    }

    const reasons = checks.filter((item) => !item.ok).map((item) => `${item.name}: ${item.detail}`);
    return {
      allowed: reasons.length === 0,
      checks,
      reasons,
    };
  }

  public snapshot(portfolio: PortfolioSnapshot, ordersLastMinute: number): RiskState {
    return {
      killSwitch: this.killed,
      dailyPnl: this.dailyPnl,
      peakEquity: this.peakEquity,
      drawdownPct: this.drawdownPct(portfolio),
      exposure: portfolio.exposure,
      openPositions: portfolio.positions.length,
      ordersLastMinute,
      limits: this.limits,
      checks: [],
    };
  }

  private pruneOrders(now: number): void {
    const cutoff = now - 60_000;
    this.orderTimestamps = this.orderTimestamps.filter((timestamp) => timestamp >= cutoff);
  }
}
