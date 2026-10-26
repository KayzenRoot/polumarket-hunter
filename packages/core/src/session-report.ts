import { roundMoney, roundTo } from './money.js';
import type { EquityPoint, PaperSession, PortfolioSnapshot, Signal, Trade } from './types.js';

export interface SessionReportRejection {
  readonly at: number;
  readonly marketId: string;
  readonly tokenId: string;
  readonly action: Signal['action'];
  readonly reasons: readonly string[];
}

export interface SessionReportMetrics {
  readonly incomplete: boolean;
  readonly startingCash: number;
  readonly endingEquity: number;
  readonly totalReturnPct: number;
  readonly realizedPnl: number;
  readonly unrealizedPnl: number;
  readonly totalPnl: number;
  readonly fees: number;
  readonly trades: number;
  readonly buys: number;
  readonly sells: number;
  readonly wins: number;
  readonly losses: number;
  readonly winRate: number;
  readonly signals: number;
  readonly acceptedSignals: number;
  readonly rejectedSignals: number;
  readonly rejectionsByReason: Readonly<Record<string, number>>;
}

export interface SessionReport {
  readonly session: PaperSession;
  readonly metrics: SessionReportMetrics;
  readonly equityCurve: readonly EquityPoint[];
  readonly trades: readonly Trade[];
  readonly signals: readonly Signal[];
  readonly rejections: readonly SessionReportRejection[];
}

export interface SessionReportInput {
  readonly session: PaperSession;
  readonly trades: readonly Trade[];
  readonly signals: readonly Signal[];
  readonly snapshots: readonly PortfolioSnapshot[];
}

function sortByAt<T extends { readonly at: number; readonly id?: string }>(
  items: readonly T[],
): T[] {
  return [...items].sort((left, right) => {
    const delta = left.at - right.at;
    if (delta !== 0) {
      return delta;
    }
    return (left.id ?? '').localeCompare(right.id ?? '');
  });
}

function rejectionReason(reasons: readonly string[]): string {
  const first = reasons[0]?.trim();
  if (first === undefined || first.length === 0) {
    return 'unknown';
  }
  const prefix = first.split(':')[0]?.trim();
  return prefix !== undefined && prefix.length > 0 ? prefix : first;
}

export function buildSessionReport(input: SessionReportInput): SessionReport {
  const { session } = input;
  const trades = sortByAt(input.trades);
  const signals = sortByAt(input.signals);
  const snapshots = [...input.snapshots].sort((left, right) => left.updatedAt - right.updatedAt);
  const latestSnapshot = snapshots.at(-1) ?? null;

  const closed = trades.filter((trade) => trade.side === 'SELL');
  const wins = closed.filter((trade) => trade.realizedPnl > 0).length;
  const losses = closed.filter((trade) => trade.realizedPnl < 0).length;
  const realizedPnl = roundMoney(closed.reduce((sum, trade) => sum + trade.realizedPnl, 0));
  const fees = roundMoney(trades.reduce((sum, trade) => sum + trade.fee, 0));
  const endingEquity = roundMoney(
    session.endingEquity ?? latestSnapshot?.equity ?? session.startingCash,
  );
  const totalPnl = roundMoney(endingEquity - session.startingCash);
  const acceptedSignals = signals.filter((signal) => signal.accepted).length;
  const rejected = signals.filter((signal) => !signal.accepted);

  const reasonCounts = new Map<string, number>();
  for (const signal of rejected) {
    const reason = rejectionReason(signal.reasons);
    reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
  }
  const rejectionsByReason = Object.fromEntries(
    [...reasonCounts.entries()].sort(([left], [right]) => left.localeCompare(right)),
  );

  return {
    session,
    metrics: {
      incomplete: session.endedAt === null,
      startingCash: session.startingCash,
      endingEquity,
      totalReturnPct: session.startingCash > 0 ? roundTo(totalPnl / session.startingCash, 6) : 0,
      realizedPnl,
      unrealizedPnl: roundMoney(latestSnapshot?.unrealizedPnl ?? 0),
      totalPnl,
      fees,
      trades: trades.length,
      buys: trades.filter((trade) => trade.side === 'BUY').length,
      sells: closed.length,
      wins,
      losses,
      winRate: wins + losses > 0 ? roundTo(wins / (wins + losses), 4) : 0,
      signals: signals.length,
      acceptedSignals,
      rejectedSignals: rejected.length,
      rejectionsByReason,
    },
    equityCurve: snapshots.map((snapshot) => ({
      at: snapshot.updatedAt,
      equity: snapshot.equity,
      exposure: snapshot.exposure,
    })),
    trades,
    signals,
    rejections: rejected.map((signal) => ({
      at: signal.at,
      marketId: signal.marketId,
      tokenId: signal.tokenId,
      action: signal.action,
      reasons: signal.reasons,
    })),
  };
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function csvRow(cells: readonly unknown[]): string {
  return cells.map(csvCell).join(',');
}

export function sessionReportCsv(report: SessionReport): string {
  const lines: string[] = [];
  const session = report.session;
  const metrics = report.metrics;

  lines.push('# session');
  lines.push(
    csvRow([
      'id',
      'startedAt',
      'endedAt',
      'status',
      'mode',
      'startingCash',
      'endingEquity',
      'stopReason',
    ]),
  );
  lines.push(
    csvRow([
      session.id,
      session.startedAt,
      session.endedAt,
      session.status,
      session.mode,
      session.startingCash,
      session.endingEquity,
      session.stopReason,
    ]),
  );

  lines.push('');
  lines.push('# metrics');
  lines.push(csvRow(['metric', 'value']));
  for (const [key, value] of Object.entries(metrics)) {
    if (key === 'rejectionsByReason') {
      continue;
    }
    lines.push(csvRow([key, value]));
  }
  for (const [reason, count] of Object.entries(metrics.rejectionsByReason)) {
    lines.push(csvRow([`rejection:${reason}`, count]));
  }

  lines.push('');
  lines.push('# trades');
  lines.push(
    csvRow([
      'id',
      'at',
      'marketId',
      'tokenId',
      'outcome',
      'side',
      'price',
      'size',
      'notional',
      'fee',
      'realizedPnl',
      'orderId',
      'mode',
    ]),
  );
  for (const trade of report.trades) {
    lines.push(
      csvRow([
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
      ]),
    );
  }

  lines.push('');
  lines.push('# signals');
  lines.push(
    csvRow([
      'id',
      'at',
      'marketId',
      'tokenId',
      'outcome',
      'action',
      'fairValue',
      'marketPrice',
      'edge',
      'confidence',
      'accepted',
      'reasons',
    ]),
  );
  for (const signal of report.signals) {
    lines.push(
      csvRow([
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
        signal.accepted,
        signal.reasons.join(' | '),
      ]),
    );
  }

  lines.push('');
  lines.push('# equity');
  lines.push(csvRow(['at', 'equity', 'exposure']));
  for (const point of report.equityCurve) {
    lines.push(csvRow([point.at, point.equity, point.exposure]));
  }

  return `${lines.join('\n')}\n`;
}
