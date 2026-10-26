import type { EngineHealth, PaperSession } from '@polyhunter/core';
import { formatUsd, shortToken } from '@polyhunter/core';
import { MarketsIcon, OverviewIcon, ReportsIcon, RiskIcon, TradesIcon } from './Icons.js';
import { StatusPill } from './StatusPill.js';

export type View = 'overview' | 'markets' | 'trades' | 'reports' | 'risk';

interface SidebarProps {
  readonly view: View;
  readonly onChange: (view: View) => void;
  readonly health: EngineHealth;
  readonly equity: number;
  readonly demoMode: boolean;
  readonly session: PaperSession | null;
}

const ITEMS: readonly { id: View; label: string; icon: typeof OverviewIcon }[] = [
  { id: 'overview', label: 'Overview', icon: OverviewIcon },
  { id: 'markets', label: 'Markets', icon: MarketsIcon },
  { id: 'trades', label: 'Trades', icon: TradesIcon },
  { id: 'reports', label: 'Reports', icon: ReportsIcon },
  { id: 'risk', label: 'Risk', icon: RiskIcon },
];

export function Sidebar({ view, onChange, health, equity, demoMode, session }: SidebarProps) {
  return (
    <aside className="sidebar">
      <nav className="sidebar-nav" aria-label="Primary">
        <span className="sidebar-label">Terminal</span>
        {ITEMS.map((item) => {
          const Icon = item.icon;
          const active = item.id === view;
          return (
            <button
              key={item.id}
              type="button"
              className={`nav-item${active ? ' is-active' : ''}`}
              onClick={() => onChange(item.id)}
              aria-current={active ? 'page' : undefined}
            >
              <Icon width={17} height={17} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="sidebar-session">
        <span className="sidebar-label">Session</span>
        <div className="session-equity">{formatUsd(equity)}</div>
        <div className="session-caption">paper equity</div>
        {session !== null ? (
          <div className="session-caption">session {shortToken(session.id)}</div>
        ) : null}
        <div className="session-pills">
          <StatusPill
            tone={
              health.status === 'running'
                ? 'positive'
                : health.status === 'paused'
                  ? 'warning'
                  : health.status === 'killed'
                    ? 'warning'
                    : health.status === 'error'
                      ? 'negative'
                      : 'neutral'
            }
          >
            {health.status}
          </StatusPill>
          <StatusPill tone="neutral" dot={false}>
            {demoMode ? 'DEMO FEED' : `${health.markets} mkts`}
          </StatusPill>
        </div>
      </div>

      <div className="sidebar-note">
        <strong>Paper only</strong>
        <p>
          Live orders are blocked by the venue geoblock and intentionally disabled. No VPN or proxy
          bypass is built in.
        </p>
      </div>
    </aside>
  );
}
