import type { MarketDetail } from '@polyhunter/core';
import { formatDateTime, formatPct, formatPrice } from '@polyhunter/core';
import { EmptyState } from './EmptyState.js';
import { CloseIcon } from './Icons.js';
import { StatusPill } from './StatusPill.js';

function feeLabel(market: MarketDetail['market']): string {
  if (market.feesEnabled === false) {
    return 'fee-free';
  }
  const schedule = market.feeSchedule;
  if (schedule === null || schedule === undefined) {
    return 'fee unknown · FEE_BPS fallback';
  }
  if (schedule.rate <= 0) {
    return 'fee-free';
  }
  return `${schedule.takerOnly ? 'taker' : 'both sides'} rate ${formatPct(schedule.rate)} · p(1-p)`;
}

function marketFeeTone(market: MarketDetail['market']): 'neutral' | 'info' | 'warning' {
  if (market.feesEnabled === false) {
    return 'neutral';
  }
  const schedule = market.feeSchedule;
  if (schedule === null || schedule === undefined) {
    return 'warning';
  }
  return schedule.rate > 0 ? 'info' : 'neutral';
}

function actionTone(action: string): 'positive' | 'warning' | 'neutral' | 'info' {
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

interface OrderBookPanelProps {
  readonly detail: MarketDetail | null;
  readonly loading: boolean;
  readonly onClose: () => void;
}

export function OrderBookPanel({ detail, loading, onClose }: OrderBookPanelProps) {
  if (detail === null) {
    return (
      <EmptyState
        title="Select a market"
        message="Click a row in the scanner to inspect full depth, the current signal and the paper position."
      />
    );
  }

  const asks = detail.book?.asks.slice(0, 8).reverse() ?? [];
  const bids = detail.book?.bids.slice(0, 8) ?? [];
  const maxSize = Math.max(
    1,
    ...asks.map((level) => level.size),
    ...bids.map((level) => level.size),
  );
  const top = bids[0];
  const ask = asks[asks.length - 1];
  const spread = top !== undefined && ask !== undefined ? ask.price - top.price : null;

  return (
    <section className="book-panel" aria-label="Order book detail">
      <header className="book-head">
        <div>
          <span className="eyebrow">
            {detail.market.slug} · score {detail.score.toFixed(2)}
          </span>
          <h2>{detail.market.question}</h2>
        </div>
        <button
          type="button"
          className="icon-button"
          onClick={onClose}
          aria-label="Close order book"
        >
          <CloseIcon />
        </button>
      </header>

      <div className="book-meta">
        <StatusPill tone={actionTone(detail.decision?.action ?? 'HOLD')} dot={false}>
          {detail.decision?.action ?? 'HOLD'}
        </StatusPill>
        {detail.position !== null ? (
          <StatusPill tone="info" dot={false}>
            {detail.position.shares.toFixed(2)} shares @ {formatPrice(detail.position.avgPrice)}
          </StatusPill>
        ) : (
          <StatusPill tone="neutral" dot={false}>
            FLAT
          </StatusPill>
        )}
        <StatusPill tone={marketFeeTone(detail.market)} dot={false}>
          {feeLabel(detail.market)}
        </StatusPill>
        <span className="muted">
          last update {formatDateTime(detail.book?.timestamp ?? null)} · tick{' '}
          {formatPrice(detail.market.tickSize)}
        </span>
      </div>

      {loading ? <div className="skeleton-line" /> : null}

      <div className="book-grid">
        <div className="book-side">
          <div className="book-side-head">
            <span>Asks</span>
            <span>{asks.length} levels</span>
          </div>
          {asks.length === 0 ? <span className="muted">no asks</span> : null}
          {asks.map((level) => (
            <div className="book-row is-ask" key={`ask-${level.price}`}>
              <span className="book-depth" style={{ width: `${(level.size / maxSize) * 100}%` }} />
              <span className="book-price">{formatPrice(level.price)}</span>
              <span className="book-size">{level.size.toFixed(0)}</span>
            </div>
          ))}
        </div>

        <div className="book-spread">
          <span>spread</span>
          <strong>{spread === null ? '—' : formatPrice(spread)}</strong>
          <span>micro {detail.decision ? formatPrice(detail.decision.fairValue) : '—'}</span>
        </div>

        <div className="book-side">
          <div className="book-side-head">
            <span>Bids</span>
            <span>{bids.length} levels</span>
          </div>
          {bids.length === 0 ? <span className="muted">no bids</span> : null}
          {bids.map((level) => (
            <div className="book-row is-bid" key={`bid-${level.price}`}>
              <span className="book-depth" style={{ width: `${(level.size / maxSize) * 100}%` }} />
              <span className="book-price">{formatPrice(level.price)}</span>
              <span className="book-size">{level.size.toFixed(0)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="decision-box">
        <div className="decision-head">
          <span className="eyebrow">Strategy decision</span>
          {detail.decision ? (
            <span className="decision-edge">
              edge {formatPct(detail.decision.edge)} · confidence{' '}
              {formatPct(detail.decision.confidence)}
            </span>
          ) : null}
        </div>
        {detail.decision === null ? (
          <p className="muted">No decision has been computed for this token yet.</p>
        ) : (
          <ul className="reason-list">
            {detail.decision.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
