import type { EquityPoint } from '@polyhunter/core';
import { formatPct, formatUsd } from '@polyhunter/core';
import { useId } from 'react';
import { EmptyState } from './EmptyState.js';

const WIDTH = 640;
const HEIGHT = 200;
const PAD_X = 18;
const PAD_TOP = 18;
const PAD_BOTTOM = 26;

export function EquityChart({ points }: { points: readonly EquityPoint[] }) {
  const gradientId = useId().replace(/:/g, '');
  if (points.length < 2) {
    return (
      <EmptyState
        title="Collecting paper equity"
        message="The chart starts drawing after the engine records a few portfolio snapshots."
      />
    );
  }

  const equities = points.map((point) => point.equity);
  const rawMin = Math.min(...equities);
  const rawMax = Math.max(...equities);
  const padding = Math.max(0.01, (rawMax - rawMin) * 0.15);
  const min = rawMin - padding;
  const max = rawMax + padding;
  const span = max - min || 1;
  const innerWidth = WIDTH - PAD_X * 2;
  const innerHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;

  const coordinates = points.map((point, index) => {
    const x = PAD_X + (index / (points.length - 1)) * innerWidth;
    const y = PAD_TOP + (1 - (point.equity - min) / span) * innerHeight;
    return { x, y };
  });

  const path = coordinates
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(2)},${point.y.toFixed(2)}`)
    .join(' ');
  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];
  const area =
    first === undefined || last === undefined
      ? ''
      : `${path} L${last.x.toFixed(2)},${HEIGHT - PAD_BOTTOM} L${first.x.toFixed(2)},${HEIGHT - PAD_BOTTOM} Z`;

  const start = points[0]?.equity ?? 0;
  const end = points[points.length - 1]?.equity ?? 0;
  const change = start > 0 ? (end - start) / start : 0;
  const positive = end >= start;

  return (
    <div className="equity-chart">
      <div className="chart-head">
        <div>
          <span className="chart-label">Equity curve</span>
          <strong>{formatUsd(end)}</strong>
        </div>
        <span className={`chart-change ${positive ? 'is-positive' : 'is-negative'}`}>
          {positive ? '+' : ''}
          {formatPct(change)}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={`Paper equity curve from ${formatUsd(start)} to ${formatUsd(end)}`}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={positive ? '#3ddc97' : '#ff6b6b'} stopOpacity="0.28" />
            <stop offset="100%" stopColor={positive ? '#3ddc97' : '#ff6b6b'} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((fraction) => {
          const y = PAD_TOP + fraction * innerHeight;
          return (
            <line
              key={fraction}
              x1={PAD_X}
              x2={WIDTH - PAD_X}
              y1={y}
              y2={y}
              className="chart-grid"
            />
          );
        })}
        <path d={area} fill={`url(#${gradientId})`} />
        <path
          d={path}
          fill="none"
          className={positive ? 'chart-line is-positive' : 'chart-line is-negative'}
        />
        {last !== undefined ? (
          <circle
            cx={last.x}
            cy={last.y}
            r={3.2}
            className={positive ? 'chart-point is-positive' : 'chart-point is-negative'}
          />
        ) : null}
      </svg>
      <div className="chart-foot">
        <span>{formatUsd(rawMin)} low</span>
        <span>{formatUsd(rawMax)} high</span>
      </div>
    </div>
  );
}
