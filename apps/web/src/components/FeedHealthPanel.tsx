import type { EngineHealth, FeedHealthSnapshot } from '@polyhunter/core';
import { formatDuration } from '@polyhunter/core';
import { StatusPill } from './StatusPill.js';

function ageLabel(value: number | null): string {
  return value === null ? '—' : `${Math.round(value)} ms`;
}

function gapLabel(value: number | null): string {
  return value === null ? '—' : formatDuration(value);
}

export function FeedHealthPanel({
  feed,
  health,
}: {
  readonly feed: FeedHealthSnapshot;
  readonly health: EngineHealth;
}) {
  const stale = feed.ageMs !== null && feed.ageMs > feed.bookStaleMs;
  const tone = stale ? 'negative' : health.provider.connected ? 'positive' : 'warning';
  return (
    <section className="card feed-panel" aria-label="Feed health">
      <div className="feed-head">
        <div>
          <span className="eyebrow">Feed health</span>
          <h2>Freshness and provider latency</h2>
        </div>
        <StatusPill tone={tone}>
          {stale ? 'STALE' : health.provider.connected ? 'LIVE' : 'DOWN'}
        </StatusPill>
      </div>

      <div className="feed-grid">
        <div className="feed-stat">
          <span>Current age</span>
          <strong>{ageLabel(feed.ageMs)}</strong>
          <small>threshold {formatDuration(feed.bookStaleMs)}</small>
        </div>
        <div className="feed-stat">
          <span>Age p50 / p95 / p99</span>
          <strong>
            {ageLabel(feed.ageP50Ms)} / {ageLabel(feed.ageP95Ms)} / {ageLabel(feed.ageP99Ms)}
          </strong>
          <small>sampled on the 1s mark loop</small>
        </div>
        <div className="feed-stat">
          <span>Gap p50 / p95 / p99</span>
          <strong>
            {gapLabel(feed.gapP50Ms)} / {gapLabel(feed.gapP95Ms)} / {gapLabel(feed.gapP99Ms)}
          </strong>
          <small>{feed.messageGaps} arrivals in the rolling window</small>
        </div>
        <div className="feed-stat">
          <span>Provider latency p50 / p95 / p99</span>
          <strong>
            {gapLabel(feed.providerLatencyP50Ms)} / {gapLabel(feed.providerLatencyP95Ms)} /{' '}
            {gapLabel(feed.providerLatencyP99Ms)}
          </strong>
          <small>local arrival minus provider timestamp</small>
        </div>
        <div className="feed-stat">
          <span>Reconnects</span>
          <strong>{health.provider.reconnectCount}</strong>
          <small>{health.provider.error ?? 'no provider error'}</small>
        </div>
        <div className="feed-stat">
          <span>Stale periods</span>
          <strong>{feed.stalePeriods}</strong>
          <small>{formatDuration(feed.staleMs)} total</small>
        </div>
      </div>
    </section>
  );
}
