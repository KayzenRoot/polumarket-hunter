import type { MarketView, Signal, StrategyAction } from '@polyhunter/core';
import { formatPct, formatTime } from '@polyhunter/core';
import { EmptyState } from './EmptyState.js';
import { StatusPill } from './StatusPill.js';

function tone(action: StrategyAction): 'positive' | 'warning' | 'neutral' | 'info' {
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

function marketName(markets: readonly MarketView[], marketId: string): string {
  return markets.find((view) => view.market.id === marketId)?.market.question ?? marketId;
}

export function SignalsFeed({
  signals,
  markets,
  limit = 9,
}: {
  signals: readonly Signal[];
  markets: readonly MarketView[];
  limit?: number;
}) {
  if (signals.length === 0) {
    return (
      <EmptyState
        title="No actionable signals"
        message="The strategy is holding. Rejections and fills will appear here as soon as an edge clears the thresholds."
      />
    );
  }

  return (
    <ol className="signal-feed">
      {signals.slice(0, limit).map((signal) => (
        <li key={signal.id} className={`signal-item${signal.accepted ? ' is-accepted' : ''}`}>
          <div className="signal-top">
            <StatusPill tone={tone(signal.action)} dot={false}>
              {signal.action}
            </StatusPill>
            <span className="signal-market">{marketName(markets, signal.marketId)}</span>
            <span className="signal-time">{formatTime(signal.at)}</span>
          </div>
          <div className="signal-stats">
            <span>edge {formatPct(signal.edge)}</span>
            <span>conf {formatPct(signal.confidence)}</span>
            <span className={signal.accepted ? 'is-positive' : 'is-warning'}>
              {signal.accepted ? 'accepted' : 'blocked'}
            </span>
          </div>
          <p className="signal-reasons">{signal.reasons.slice(0, 2).join(' · ')}</p>
        </li>
      ))}
    </ol>
  );
}
