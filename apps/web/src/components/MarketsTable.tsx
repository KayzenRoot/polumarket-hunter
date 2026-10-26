import type { MarketView, StrategyAction } from '@polyhunter/core';
import { formatCompactUsd, formatDuration, formatPct, formatPrice } from '@polyhunter/core';
import { EmptyState } from './EmptyState.js';
import { StatusPill } from './StatusPill.js';

function actionTone(action: StrategyAction): 'positive' | 'warning' | 'neutral' | 'info' {
  if (action === 'PLACE_BID' || action === 'TAKE_BUY') {
    return 'positive';
  }
  if (action === 'TAKE_SELL') {
    return 'warning';
  }
  if (action === 'PLACE_ASK') {
    return 'info';
  }
  return 'neutral';
}

function actionLabel(action: StrategyAction): string {
  switch (action) {
    case 'PLACE_BID':
      return 'BID';
    case 'TAKE_BUY':
      return 'TAKE BUY';
    case 'TAKE_SELL':
      return 'TAKE SELL';
    case 'PLACE_ASK':
      return 'ASK';
    default:
      return 'HOLD';
  }
}

function endLabel(endDate: string | null): string {
  if (endDate === null) {
    return 'no end date';
  }
  const parsed = new Date(endDate);
  if (Number.isNaN(parsed.getTime())) {
    return 'no end date';
  }
  return parsed.toLocaleDateString(undefined, { month: 'short', day: '2-digit' });
}

interface MarketsTableProps {
  readonly markets: readonly MarketView[];
  readonly selectedToken: string | null;
  readonly onSelect: (tokenId: string) => void;
  readonly compact?: boolean;
}

export function MarketsTable({
  markets,
  selectedToken,
  onSelect,
  compact = false,
}: MarketsTableProps) {
  if (markets.length === 0) {
    return (
      <EmptyState
        title="No markets yet"
        message="Start the engine. The scanner will subscribe to the highest-volume eligible markets."
      />
    );
  }

  const rows = compact ? markets.slice(0, 6) : markets;

  return (
    <section className="table-wrap" aria-label="Scanned markets">
      <table className="data-table markets-table">
        <thead>
          <tr>
            <th scope="col">Market</th>
            <th scope="col">Bid</th>
            <th scope="col">Ask</th>
            <th scope="col">Spread</th>
            <th scope="col">Edge</th>
            <th scope="col">Score</th>
            <th scope="col">Signal</th>
            <th scope="col">Book age</th>
            <th scope="col">Position</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((view) => {
            const selected = view.market.yesTokenId === selectedToken;
            const edge = view.decision?.action === 'HOLD' ? null : (view.decision?.edge ?? null);
            return (
              <tr key={view.market.id} className={selected ? 'is-selected' : undefined}>
                <td>
                  <div className="market-cell">
                    <button
                      type="button"
                      className="market-link"
                      onClick={() => onSelect(view.market.yesTokenId)}
                    >
                      {view.market.question}
                    </button>
                    <span className="market-meta">
                      {formatCompactUsd(view.market.volume24h)} 24h ·{' '}
                      {formatCompactUsd(view.market.liquidity)} liq · tick{' '}
                      {formatPrice(view.market.tickSize)} · ends {endLabel(view.market.endDate)}
                    </span>
                  </div>
                </td>
                <td className="num">{view.book ? formatPrice(view.book.bid) : '—'}</td>
                <td className="num">{view.book ? formatPrice(view.book.ask) : '—'}</td>
                <td className="num">{view.book ? formatPrice(view.book.spread) : '—'}</td>
                <td className={`num ${edge !== null && edge > 0 ? 'is-positive' : ''}`}>
                  {edge === null ? '—' : formatPct(edge)}
                </td>
                <td>
                  <div className="score-cell">
                    <div className="score-track">
                      <span style={{ width: `${Math.min(100, view.score * 100)}%` }} />
                    </div>
                    <span className="num">{view.score.toFixed(2)}</span>
                  </div>
                </td>
                <td>
                  <StatusPill tone={actionTone(view.decision?.action ?? 'HOLD')} dot={false}>
                    {actionLabel(view.decision?.action ?? 'HOLD')}
                  </StatusPill>
                </td>
                <td
                  className={`num ${view.bookAgeMs !== null && view.bookAgeMs > 5000 ? 'is-warning' : ''}`}
                >
                  {view.bookAgeMs === null ? '—' : formatDuration(view.bookAgeMs)}
                </td>
                <td>
                  {view.position === null ? (
                    <span className="muted">flat</span>
                  ) : (
                    <span className="position-chip">
                      {view.position.shares.toFixed(2)} @ {formatPrice(view.position.avgPrice)}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
