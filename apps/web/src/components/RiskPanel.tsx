import type { EngineHealth, PortfolioSnapshot, RiskState } from '@polyhunter/core';
import { formatPct, formatSignedUsd, formatUsd } from '@polyhunter/core';
import { AlertIcon, CheckIcon } from './Icons.js';
import { StatusPill } from './StatusPill.js';

function Meter({
  label,
  value,
  max,
  display,
  tone = 'ok',
}: {
  label: string;
  value: number;
  max: number;
  display: string;
  tone?: 'ok' | 'warn' | 'danger';
}) {
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return (
    <div className="meter">
      <div className="meter-head">
        <span>{label}</span>
        <strong>{display}</strong>
      </div>
      <div className="meter-track">
        <span className={`meter-fill meter-${tone}`} style={{ width: `${ratio * 100}%` }} />
      </div>
    </div>
  );
}

export function RiskPanel({
  risk,
  portfolio,
  health,
}: {
  risk: RiskState;
  portfolio: PortfolioSnapshot;
  health: EngineHealth;
}) {
  const lossUsage = Math.max(0, -risk.dailyPnl);
  const exposureTone = portfolio.exposure / risk.limits.maxTotalNotional > 0.8 ? 'warn' : 'ok';
  const drawdownTone = risk.drawdownPct / risk.limits.maxDrawdownPct > 0.8 ? 'danger' : 'ok';

  return (
    <section className="risk-panel" aria-label="Risk controls">
      <div className="risk-head">
        <div>
          <span className="eyebrow">Risk engine</span>
          <h2>Hard limits, fail closed</h2>
        </div>
        <StatusPill tone={risk.killSwitch ? 'negative' : 'positive'}>
          {risk.killSwitch ? 'KILL SWITCH ON' : 'ARMED'}
        </StatusPill>
      </div>

      <div className="meter-grid">
        <Meter
          label="Total exposure"
          value={portfolio.exposure}
          max={risk.limits.maxTotalNotional}
          display={`${formatUsd(portfolio.exposure)} / ${formatUsd(risk.limits.maxTotalNotional)}`}
          tone={exposureTone}
        />
        <Meter
          label="Open positions"
          value={risk.openPositions}
          max={risk.limits.maxOpenPositions}
          display={`${risk.openPositions} / ${risk.limits.maxOpenPositions}`}
        />
        <Meter
          label="Orders this minute"
          value={risk.ordersLastMinute}
          max={risk.limits.maxOrdersPerMinute}
          display={`${risk.ordersLastMinute} / ${risk.limits.maxOrdersPerMinute}`}
        />
        <Meter
          label="Drawdown"
          value={risk.drawdownPct}
          max={risk.limits.maxDrawdownPct}
          display={`${formatPct(risk.drawdownPct)} / ${formatPct(risk.limits.maxDrawdownPct)}`}
          tone={drawdownTone}
        />
        <Meter
          label="Daily loss budget"
          value={lossUsage}
          max={risk.limits.maxDailyLoss}
          display={`${formatUsd(lossUsage)} / ${formatUsd(risk.limits.maxDailyLoss)}`}
          tone={lossUsage / risk.limits.maxDailyLoss > 0.8 ? 'danger' : 'ok'}
        />
      </div>

      <div className="risk-pnl">
        <div>
          <span>Daily PnL</span>
          <strong className={risk.dailyPnl >= 0 ? 'is-positive' : 'is-negative'}>
            {formatSignedUsd(risk.dailyPnl)}
          </strong>
        </div>
        <div>
          <span>Peak equity</span>
          <strong>{formatUsd(risk.peakEquity)}</strong>
        </div>
        <div>
          <span>Reserved cash</span>
          <strong>{formatUsd(portfolio.reservedCash)}</strong>
        </div>
        <div>
          <span>Open orders</span>
          <strong>{portfolio.openOrders}</strong>
        </div>
      </div>

      <div className="risk-checks">
        <span className="eyebrow">Last decision checks</span>
        {risk.checks.length === 0 ? (
          <p className="muted">No actionable decision has been evaluated yet.</p>
        ) : (
          <ul>
            {risk.checks.map((check) => (
              <li key={check.name} className={check.ok ? 'check-ok' : 'check-fail'}>
                {check.ok ? (
                  <CheckIcon width={14} height={14} />
                ) : (
                  <AlertIcon width={14} height={14} />
                )}
                <span>{check.name}</span>
                <em>{check.detail}</em>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="geo-box">
        <span className="eyebrow">Venue eligibility</span>
        <div className="geo-row">
          <StatusPill
            tone={
              health.geoblock.status === 'BLOCKED'
                ? 'negative'
                : health.geoblock.status === 'ELIGIBLE'
                  ? 'positive'
                  : 'neutral'
            }
          >
            {health.geoblock.status}
          </StatusPill>
          <span>
            {health.geoblock.country ?? 'unknown country'}
            {health.geoblock.region ? ` · ${health.geoblock.region}` : ''}
          </span>
        </div>
        <p>{health.liveBlockReason ?? 'Live execution is disabled.'}</p>
        {health.geoblock.reason ? <p className="muted">{health.geoblock.reason}</p> : null}
      </div>

      <div className="limits-grid">
        <div>
          <span>Per market</span>
          <strong>{formatUsd(risk.limits.maxNotionalPerMarket)}</strong>
        </div>
        <div>
          <span>Max spread</span>
          <strong>{formatPct(risk.limits.maxSpread)}</strong>
        </div>
        <div>
          <span>Min depth</span>
          <strong>{risk.limits.minDepthShares} sh</strong>
        </div>
        <div>
          <span>Stale book</span>
          <strong>{(risk.limits.maxBookAgeMs / 1000).toFixed(1)}s</strong>
        </div>
      </div>

      <p className="risk-disclaimer">
        Paper trading only. This is a research terminal, not investment advice. No profit is
        guaranteed; prediction markets can lose the entire stake.
      </p>
    </section>
  );
}
