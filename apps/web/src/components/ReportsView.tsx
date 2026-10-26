import type { MarketView, PaperSession, SessionReport } from '@polyhunter/core';
import {
  formatDateTime,
  formatDuration,
  formatPct,
  formatSignedUsd,
  formatUsd,
  shortToken,
} from '@polyhunter/core';
import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { EmptyState } from './EmptyState.js';
import { EquityChart } from './EquityChart.js';
import { KpiCard } from './KpiCard.js';
import { StatusPill } from './StatusPill.js';
import { TradesTable } from './TradesTable.js';

function download(filename: string, text: string, type: string): void {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function ReportsView({
  sessions,
  currentSession,
  markets,
}: {
  readonly sessions: readonly PaperSession[];
  readonly currentSession: PaperSession | null;
  readonly markets: readonly MarketView[];
}) {
  const [selectedId, setSelectedId] = useState<string>('current');
  const [report, setReport] = useState<SessionReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionId = selectedId === 'current' ? (currentSession?.id ?? null) : selectedId;

  useEffect(() => {
    if (sessionId === null) {
      setReport(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void api
      .sessionReport(sessionId)
      .then((next) => {
        if (!cancelled) {
          setReport(next);
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setReport(null);
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const downloadCsv = (): void => {
    if (sessionId === null) {
      return;
    }
    void api
      .sessionReportCsv(sessionId)
      .then((csv) => download(`session-${sessionId}.csv`, csv, 'text/csv;charset=utf-8'))
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : String(cause));
      });
  };

  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">Paper evidence</span>
          <h1>Session report</h1>
          <p>Reproducible from persisted sessions, fills, signals and equity snapshots.</p>
        </div>
        <div className="page-head-meta">
          <label className="select-label">
            Session
            <select
              className="select"
              value={selectedId}
              onChange={(event) => setSelectedId(event.target.value)}
              aria-label="Select report session"
            >
              <option value="current">
                Current{currentSession !== null ? ` · ${shortToken(currentSession.id)}` : ''}
              </option>
              {sessions
                .filter((session) => session.id !== currentSession?.id)
                .map((session) => (
                  <option key={session.id} value={session.id}>
                    {shortToken(session.id)} · {session.status}
                  </option>
                ))}
            </select>
          </label>
          <button
            type="button"
            className="ghost-button"
            onClick={() => {
              if (report !== null) {
                download(
                  `session-${report.session.id}.json`,
                  `${JSON.stringify(report, null, 2)}\n`,
                  'application/json',
                );
              }
            }}
            disabled={report === null}
          >
            Download JSON
          </button>
          <button
            type="button"
            className="ghost-button"
            onClick={downloadCsv}
            disabled={report === null}
          >
            Download CSV
          </button>
        </div>
      </div>

      {error !== null ? (
        <div className="error-banner" role="alert">
          <div>
            <strong>Report unavailable</strong>
            <p>{error}</p>
          </div>
        </div>
      ) : null}

      {loading && report === null ? <div className="skeleton-line" /> : null}

      {report === null && !loading ? (
        <EmptyState
          title="No session selected"
          message="Start the paper engine or select a persisted session to build a report."
        />
      ) : null}

      {report !== null ? (
        <>
          {report.metrics.incomplete ? (
            <div className="notice notice-warning">
              This session is still running. The report is a partial snapshot and will change until
              the engine stops.
            </div>
          ) : null}

          <section className="card report-meta">
            <div>
              <span className="eyebrow">Session</span>
              <h2>{report.session.id}</h2>
              <p className="muted">
                {formatDateTime(report.session.startedAt)} to{' '}
                {report.session.endedAt === null
                  ? 'running'
                  : formatDateTime(report.session.endedAt)}{' '}
                ·{' '}
                {formatDuration(
                  Math.max(0, (report.session.endedAt ?? Date.now()) - report.session.startedAt),
                )}
              </p>
            </div>
            <div className="report-meta-pills">
              <StatusPill
                tone={
                  report.session.status === 'stopped'
                    ? 'positive'
                    : report.session.status === 'killed'
                      ? 'warning'
                      : report.session.status === 'error'
                        ? 'negative'
                        : 'info'
                }
              >
                {report.session.status}
              </StatusPill>
              <StatusPill tone="neutral" dot={false}>
                {report.session.mode}
              </StatusPill>
              {report.session.stopReason !== null ? (
                <span className="muted">stop: {report.session.stopReason}</span>
              ) : null}
            </div>
          </section>

          <div className="kpi-grid kpi-grid-4">
            <KpiCard
              label="Trades"
              value={`${report.metrics.trades}`}
              sub={`${report.metrics.buys} buys / ${report.metrics.sells} sells`}
            />
            <KpiCard
              label="Realized PnL"
              value={formatSignedUsd(report.metrics.realizedPnl)}
              tone={report.metrics.realizedPnl >= 0 ? 'positive' : 'negative'}
              sub={`total ${formatSignedUsd(report.metrics.totalPnl)}`}
            />
            <KpiCard
              label="Win rate"
              value={
                report.metrics.wins + report.metrics.losses > 0
                  ? formatPct(report.metrics.winRate)
                  : '—'
              }
              sub={`${report.metrics.wins}W / ${report.metrics.losses}L`}
            />
            <KpiCard
              label="Fees"
              value={formatUsd(report.metrics.fees)}
              sub={`${report.metrics.signals} signals`}
            />
          </div>

          <div className="report-grid">
            <section className="card">
              <div className="card-head">
                <div>
                  <span className="eyebrow">Equity</span>
                  <h3>Session curve</h3>
                </div>
                <span className="muted">{report.equityCurve.length} snapshots</span>
              </div>
              <EquityChart points={report.equityCurve} />
            </section>

            <section className="card">
              <div className="card-head">
                <div>
                  <span className="eyebrow">Risk</span>
                  <h3>Rejections</h3>
                </div>
                <span className="muted">{report.metrics.rejectedSignals} blocked</span>
              </div>
              {report.rejections.length === 0 ? (
                <p className="muted">No blocked signals in this session.</p>
              ) : (
                <ul className="rejection-list">
                  {report.rejections
                    .slice(-8)
                    .reverse()
                    .map((rejection) => (
                      <li key={`${rejection.at}-${rejection.tokenId}-${rejection.action}`}>
                        <span>{formatDateTime(rejection.at)}</span>
                        <strong>{rejection.action}</strong>
                        <small>{rejection.reasons.join('; ')}</small>
                      </li>
                    ))}
                </ul>
              )}
            </section>
          </div>

          <section className="card">
            <div className="card-head">
              <div>
                <span className="eyebrow">Fills</span>
                <h3>Session ledger</h3>
              </div>
              <span className="muted">oldest first in the export</span>
            </div>
            <TradesTable trades={report.trades} markets={markets} />
          </section>
        </>
      ) : null}
    </>
  );
}
