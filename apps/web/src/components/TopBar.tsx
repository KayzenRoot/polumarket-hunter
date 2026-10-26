import type { ControlRequest, EngineHealth } from '@polyhunter/core';
import { formatDuration, formatTime } from '@polyhunter/core';
import { useState } from 'react';
import { getApiToken, setApiToken } from '../api.js';
import type { ConnectionState } from '../useDashboard.js';
import { KeyIcon, KillIcon, LogoIcon, PauseIcon, PlayIcon, StopIcon } from './Icons.js';
import { StatusPill } from './StatusPill.js';

interface TopBarProps {
  readonly health: EngineHealth;
  readonly connection: ConnectionState;
  readonly controlPending: boolean;
  readonly onControl: (action: ControlRequest['action']) => void;
}

function geoTone(health: EngineHealth): 'positive' | 'negative' | 'warning' | 'neutral' {
  if (health.geoblock.status === 'BLOCKED') {
    return 'negative';
  }
  if (health.geoblock.status === 'ELIGIBLE') {
    return 'positive';
  }
  return 'neutral';
}

function geoLabel(health: EngineHealth): string {
  if (health.geoblock.status === 'BLOCKED') {
    return `LIVE BLOCKED${health.geoblock.country ? ` · ${health.geoblock.country}` : ''}`;
  }
  if (health.geoblock.status === 'ELIGIBLE') {
    return `LIVE ELIGIBLE${health.geoblock.country ? ` · ${health.geoblock.country}` : ''}`;
  }
  return 'GEO UNKNOWN';
}

export function TopBar({ health, connection, controlPending, onControl }: TopBarProps) {
  const [token, setTokenState] = useState(getApiToken() ?? '');
  const running = health.status === 'running';
  const paused = health.status === 'paused';

  const editToken = (): void => {
    const next = window.prompt(
      'API token (only needed when the server is bound to a non-loopback host). Leave blank to clear.',
      token,
    );
    if (next === null) {
      return;
    }
    setApiToken(next);
    setTokenState(next);
  };

  return (
    <header className="topbar">
      <div className="topbar-brand">
        <span className="brand-mark" aria-hidden="true">
          <LogoIcon width={24} height={24} />
        </span>
        <div className="brand-copy">
          <strong>POLYHUNTER</strong>
          <span>PREDICTION MARKET TERMINAL</span>
        </div>
      </div>

      <div className="topbar-status">
        <StatusPill tone="info" dot={false}>
          PAPER
        </StatusPill>
        <StatusPill tone={geoTone(health)}>{geoLabel(health)}</StatusPill>
        <StatusPill
          tone={
            connection === 'live'
              ? 'positive'
              : connection === 'connecting'
                ? 'warning'
                : 'negative'
          }
        >
          {connection === 'live'
            ? 'STREAM LIVE'
            : connection === 'connecting'
              ? 'CONNECTING'
              : 'STREAM OFFLINE'}
        </StatusPill>
        <span className="topbar-meta">
          <span>uptime {formatDuration(health.uptimeMs)}</span>
          <span>last book {formatTime(health.lastBookAt)}</span>
        </span>
      </div>

      <div className="topbar-actions">
        <button
          type="button"
          className="icon-button"
          onClick={editToken}
          title="Set API token"
          aria-label="Set API token"
        >
          <KeyIcon />
        </button>
        {health.status === 'killed' ? (
          <button
            type="button"
            className="button button-primary"
            disabled={controlPending}
            onClick={() => onControl('reset-kill')}
          >
            <PlayIcon width={14} height={14} />
            Reset kill
          </button>
        ) : paused ? (
          <>
            <button
              type="button"
              className="button button-primary"
              disabled={controlPending}
              onClick={() => onControl('resume')}
            >
              <PlayIcon width={14} height={14} />
              Resume
            </button>
            <button
              type="button"
              className="button button-ghost"
              disabled={controlPending}
              onClick={() => onControl('stop')}
            >
              <StopIcon width={14} height={14} />
              Stop
            </button>
          </>
        ) : running ? (
          <>
            <button
              type="button"
              className="button button-ghost"
              disabled={controlPending}
              onClick={() => onControl('pause')}
            >
              <PauseIcon width={14} height={14} />
              Pause
            </button>
            <button
              type="button"
              className="button button-ghost"
              disabled={controlPending}
              onClick={() => onControl('stop')}
            >
              <StopIcon width={14} height={14} />
              Stop
            </button>
          </>
        ) : (
          <button
            type="button"
            className="button button-primary"
            disabled={controlPending}
            onClick={() => onControl('start')}
          >
            <PlayIcon width={14} height={14} />
            Start
          </button>
        )}
        <button
          type="button"
          className="button button-danger"
          disabled={controlPending}
          onClick={() => {
            if (window.confirm('Activate the kill switch? All paper orders will be cancelled.')) {
              onControl('kill');
            }
          }}
        >
          <KillIcon width={14} height={14} />
          Kill
        </button>
      </div>
    </header>
  );
}
