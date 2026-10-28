import type { StateResponse, Trade } from '@polyhunter/core';
import {
  formatCompactUsd,
  formatDuration,
  formatPct,
  formatSignedUsd,
  formatUsd,
  shortToken,
} from '@polyhunter/core';
import { useEffect, useMemo, useState } from 'react';
import { api } from './api.js';
import { EquityChart } from './components/EquityChart.js';
import { FeedHealthPanel } from './components/FeedHealthPanel.js';
import { AlertIcon, LogoIcon, RefreshIcon } from './components/Icons.js';
import { KpiCard } from './components/KpiCard.js';
import { MarketsTable } from './components/MarketsTable.js';
import { OperatorLog } from './components/OperatorLog.js';
import { OrderBookPanel } from './components/OrderBookPanel.js';
import { PositionsTable } from './components/PositionsTable.js';
import { ReportsView } from './components/ReportsView.js';
import { RiskPanel } from './components/RiskPanel.js';
import { Sidebar, type View } from './components/Sidebar.js';
import { SignalsFeed } from './components/SignalsFeed.js';
import { StatusPill } from './components/StatusPill.js';
import { TopBar } from './components/TopBar.js';
import { TradesTable } from './components/TradesTable.js';
import { useDashboard, useMarketDetail } from './useDashboard.js';

function strategyLabel(strategy: StateResponse['config']['strategy']): string {
  switch (strategy) {
    case 'micro-maker':
      return 'Micro Maker Scalper';
    case 'maker-scalper':
      return 'Maker Scalper';
    case 'momentum-taker':
      return 'Momentum Taker';
  }
}

function ErrorBanner({
  title,
  message,
  onRetry,
  onDismiss,
}: {
  title: string;
  message: string;
  onRetry?: () => void;
  onDismiss?: () => void;
}) {
  return (
    <div className="error-banner" role="alert">
      <AlertIcon />
      <div>
        <strong>{title}</strong>
        <p>{message}</p>
      </div>
      {onRetry !== undefined ? (
        <button type="button" className="button button-ghost" onClick={onRetry}>
          <RefreshIcon width={14} height={14} />
          Retry
        </button>
      ) : null}
      {onDismiss !== undefined ? (
        <button type="button" className="button button-ghost" onClick={onDismiss}>
          Dismiss
        </button>
      ) : null}
    </div>
  );
}

function LoadingScreen({ message }: { message: string }) {
  return (
    <div className="loading-screen">
      <span className="brand-mark">
        <LogoIcon width={34} height={34} />
      </span>
      <strong>POLYHUNTER</strong>
      <p>{message}</p>
      <div className="skeleton-grid" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}

function FatalScreen({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="loading-screen">
      <span className="brand-mark is-danger">
        <AlertIcon width={30} height={30} />
      </span>
      <strong>Engine unavailable</strong>
      <p>{message}</p>
      <button type="button" className="button button-primary" onClick={onRetry}>
        <RefreshIcon width={14} height={14} />
        Retry
      </button>
      <code>npm run dev</code>
      <span className="muted">The dashboard expects the Fastify API at /api.</span>
    </div>
  );
}

function ConfigCard({ state }: { state: StateResponse }) {
  const { config } = state;
  const strategy = config.strategyConfig;
  return (
    <section className="card">
      <div className="card-head">
        <div>
          <span className="eyebrow">Configuration</span>
          <h2>{strategyLabel(config.strategy)}</h2>
        </div>
        <StatusPill tone="info" dot={false}>
          {config.demoMode ? 'DEMO' : 'PAPER'}
        </StatusPill>
      </div>
      <dl className="config-grid">
        <div>
          <dt>Order notional</dt>
          <dd>{formatUsd(strategy.orderNotional)}</dd>
        </div>
        <div>
          <dt>Min edge</dt>
          <dd>{formatPct(strategy.minEdge)}</dd>
        </div>
        <div>
          <dt>Min imbalance</dt>
          <dd>{formatPct(strategy.minImbalance)}</dd>
        </div>
        <div>
          <dt>Max spread</dt>
          <dd>{formatPct(strategy.maxSpread)}</dd>
        </div>
        <div>
          <dt>Take profit</dt>
          <dd>{formatPct(strategy.takeProfitEdge)}</dd>
        </div>
        <div>
          <dt>Stop loss</dt>
          <dd>{formatPct(strategy.stopLossEdge)}</dd>
        </div>
        <div>
          <dt>Cooldown</dt>
          <dd>{formatDuration(strategy.cooldownMs)}</dd>
        </div>
        <div>
          <dt>Fee</dt>
          <dd>{config.feeBps} bps</dd>
        </div>
        <div>
          <dt>Scanner size</dt>
          <dd>{config.maxMarkets} markets</dd>
        </div>
        <div>
          <dt>Starting cash</dt>
          <dd>{formatUsd(config.startingCash)}</dd>
        </div>
      </dl>
      <p className="config-note">
        These values come from the server configuration and are read-only here. Live execution is
        not implemented; every order is a paper order.
      </p>
    </section>
  );
}

function ComplianceCard({ state }: { state: StateResponse }) {
  return (
    <section className="card compliance-card">
      <div className="card-head">
        <div>
          <span className="eyebrow">Compliance boundary</span>
          <h2>Why this is paper only</h2>
        </div>
      </div>
      <ul className="compliance-list">
        <li>
          The official Polymarket geoblock endpoint reports{' '}
          <strong>{state.health.geoblock.status}</strong>
          {state.health.geoblock.country ? ` for ${state.health.geoblock.country}` : ''}.
        </li>
        <li>No VPN, proxy, account-sharing or geoblock bypass code exists in this repository.</li>
        <li>
          Live order submission requires a future audited adapter plus explicit authorization.
        </li>
        <li>Prediction-market prices are informational, not objective probabilities or advice.</li>
        <li>Paper results do not prove future returns; you can lose the entire stake.</li>
      </ul>
    </section>
  );
}

export default function App() {
  const {
    state,
    error,
    connection,
    controlPending,
    controlError,
    refresh,
    control,
    clearControlError,
  } = useDashboard();
  const [view, setView] = useState<View>('overview');
  const [selectedToken, setSelectedToken] = useState<string | null>(null);
  const [tradeSessionId, setTradeSessionId] = useState<string>('current');
  const [sessionLedger, setSessionLedger] = useState<{
    readonly id: string;
    readonly trades: readonly Trade[];
  } | null>(null);
  const detail = useMarketDetail(selectedToken);

  useEffect(() => {
    if (tradeSessionId === 'current') {
      setSessionLedger(null);
      return;
    }
    let cancelled = false;
    void api
      .trades(100, tradeSessionId)
      .then((next) => {
        if (!cancelled) {
          setSessionLedger({ id: tradeSessionId, trades: next });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSessionLedger({ id: tradeSessionId, trades: [] });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [tradeSessionId]);

  useEffect(() => {
    if (state === null || selectedToken !== null) {
      return;
    }
    const first = state.markets[0]?.market.yesTokenId ?? null;
    if (first !== null) {
      setSelectedToken(first);
    }
  }, [selectedToken, state]);

  const derived = useMemo(() => {
    if (state === null) {
      return null;
    }
    const closed = state.trades.filter((trade) => trade.side === 'SELL');
    const wins = closed.filter((trade) => trade.realizedPnl > 0).length;
    const losses = closed.filter((trade) => trade.realizedPnl < 0).length;
    const winRate = closed.length > 0 ? wins / closed.length : 0;
    const fees = state.trades.reduce((sum, trade) => sum + trade.fee, 0);
    return { closed, wins, losses, winRate, fees };
  }, [state]);

  if (state === null) {
    return error === null ? (
      <LoadingScreen message="Connecting to the paper engine and loading market state…" />
    ) : (
      <FatalScreen message={error} onRetry={() => void refresh()} />
    );
  }

  if (derived === null) {
    return <LoadingScreen message="Preparing dashboard…" />;
  }

  const {
    health,
    portfolio,
    risk,
    markets,
    trades,
    signals,
    config,
    equityCurve,
    session,
    sessions,
  } = state;
  const pnlTone = portfolio.totalPnl >= 0 ? 'positive' : 'negative';
  const exposureRatio =
    risk.limits.maxTotalNotional > 0 ? portfolio.exposure / risk.limits.maxTotalNotional : 0;
  const displayedTrades =
    tradeSessionId === 'current'
      ? trades
      : sessionLedger !== null && sessionLedger.id === tradeSessionId
        ? sessionLedger.trades
        : [];
  const viewClosed = displayedTrades.filter((trade) => trade.side === 'SELL');
  const viewWins = viewClosed.filter((trade) => trade.realizedPnl > 0).length;
  const viewLosses = viewClosed.filter((trade) => trade.realizedPnl < 0).length;
  const viewRealized = displayedTrades.reduce((sum, trade) => sum + trade.realizedPnl, 0);
  const viewFees = displayedTrades.reduce((sum, trade) => sum + trade.fee, 0);
  const selectedView =
    markets.find((viewItem) => viewItem.market.yesTokenId === selectedToken) ?? null;

  const selectMarket = (tokenId: string): void => {
    setSelectedToken(tokenId);
    setView('markets');
  };

  return (
    <div className="app-shell">
      <Sidebar
        view={view}
        onChange={setView}
        health={health}
        equity={portfolio.equity}
        demoMode={config.demoMode}
        session={session}
      />
      <div className="app-main">
        <TopBar
          health={health}
          connection={connection}
          controlPending={controlPending}
          onControl={(action) => void control(action)}
        />
        <main className="content">
          {error !== null ? (
            <ErrorBanner title="Stream degraded" message={error} onRetry={() => void refresh()} />
          ) : null}
          {connection === 'offline' && error === null ? (
            <ErrorBanner
              title="Stream offline"
              message="The live SSE stream is disconnected. Falling back to /api/state polling every 10 seconds; the dashboard remains usable."
              onRetry={() => void refresh()}
            />
          ) : null}
          {controlError !== null ? (
            <ErrorBanner
              title="Control action failed"
              message={controlError}
              onDismiss={clearControlError}
            />
          ) : null}

          {view === 'overview' ? (
            <>
              <div className="page-head">
                <div>
                  <span className="eyebrow">Paper session</span>
                  <h1>Microstructure, measured.</h1>
                  <p>
                    Live public Polymarket books, deterministic paper fills, hard risk limits. No
                    real money moves.
                  </p>
                </div>
                <div className="page-head-meta">
                  <StatusPill tone={health.status === 'running' ? 'positive' : 'warning'}>
                    {health.status}
                  </StatusPill>
                  <span>{health.markets} markets scanned</span>
                  <span>{health.subscriptions} subscriptions</span>
                </div>
              </div>

              <div className="kpi-grid">
                <KpiCard
                  label="Paper equity"
                  value={formatUsd(portfolio.equity)}
                  sub={`started with ${formatUsd(portfolio.startingCash)}`}
                  tone={portfolio.totalPnl >= 0 ? 'positive' : 'negative'}
                />
                <KpiCard
                  label="Total PnL"
                  value={formatSignedUsd(portfolio.totalPnl)}
                  sub={`realized ${formatSignedUsd(portfolio.realizedPnl)} · unrealized ${formatSignedUsd(portfolio.unrealizedPnl)}`}
                  tone={pnlTone}
                />
                <KpiCard
                  label="Exposure"
                  value={formatUsd(portfolio.exposure)}
                  sub={`limit ${formatUsd(risk.limits.maxTotalNotional)} · ${formatPct(exposureRatio)} used`}
                  tone={exposureRatio > 0.8 ? 'warning' : 'neutral'}
                />
                <KpiCard
                  label="Open positions"
                  value={`${portfolio.positions.length} / ${risk.limits.maxOpenPositions}`}
                  sub={`${portfolio.openOrders} resting orders · ${trades.length} fills`}
                  tone="neutral"
                />
                <KpiCard
                  label="Win rate"
                  value={derived.closed.length > 0 ? formatPct(derived.winRate) : '—'}
                  sub={
                    derived.closed.length > 0
                      ? `${derived.wins}W / ${derived.losses}L · fees ${formatUsd(derived.fees)}`
                      : 'no closed paper trades yet'
                  }
                  tone={
                    derived.closed.length === 0
                      ? 'neutral'
                      : derived.winRate >= 0.5
                        ? 'positive'
                        : 'negative'
                  }
                />
              </div>

              <div className="overview-grid">
                <div className="stack">
                  <section className="card">
                    <div className="card-head">
                      <div>
                        <span className="eyebrow">Performance</span>
                        <h2>Equity curve</h2>
                      </div>
                      <span className="muted">{equityCurve.length} snapshots</span>
                    </div>
                    <EquityChart points={equityCurve} />
                  </section>

                  <section className="card">
                    <div className="card-head">
                      <div>
                        <span className="eyebrow">Inventory</span>
                        <h2>Open paper positions</h2>
                      </div>
                      <span className="muted">{portfolio.positions.length} open</span>
                    </div>
                    <PositionsTable
                      positions={portfolio.positions}
                      markets={markets}
                      portfolio={portfolio}
                    />
                  </section>

                  <section className="card">
                    <div className="card-head">
                      <div>
                        <span className="eyebrow">Signal tape</span>
                        <h2>Latest decisions</h2>
                      </div>
                      <span className="muted">live</span>
                    </div>
                    <SignalsFeed signals={signals} markets={markets} />
                  </section>
                </div>

                <div className="stack">
                  <section className="card card-risk">
                    <RiskPanel
                      risk={risk}
                      portfolio={portfolio}
                      health={health}
                      controlPending={controlPending}
                      onControl={(action) => void control(action)}
                    />
                  </section>
                </div>
              </div>

              <section className="card">
                <div className="card-head">
                  <div>
                    <span className="eyebrow">Scanner</span>
                    <h2>Top markets</h2>
                  </div>
                  <button
                    type="button"
                    className="button button-ghost"
                    onClick={() => setView('markets')}
                  >
                    View all
                  </button>
                </div>
                <MarketsTable
                  markets={markets}
                  selectedToken={selectedToken}
                  onSelect={selectMarket}
                  compact
                />
              </section>
            </>
          ) : null}

          {view === 'markets' ? (
            <>
              <div className="page-head">
                <div>
                  <span className="eyebrow">Scanner + depth</span>
                  <h1>Market microstructure</h1>
                  <p>
                    Ranked by liquidity, volume, spread and two-sided quality. Click a row to
                    inspect the full book and the strategy decision.
                  </p>
                </div>
                <div className="page-head-meta">
                  <span>{markets.length} markets</span>
                  <span>
                    {formatCompactUsd(
                      markets.reduce((sum, item) => sum + item.market.volume24h, 0),
                    )}{' '}
                    24h volume
                  </span>
                </div>
              </div>
              <div className="markets-layout">
                <section className="card">
                  <div className="card-head">
                    <div>
                      <span className="eyebrow">Live scanner</span>
                      <h2>Eligible markets</h2>
                    </div>
                    <span className="muted">click to inspect</span>
                  </div>
                  <MarketsTable
                    markets={markets}
                    selectedToken={selectedToken}
                    onSelect={setSelectedToken}
                  />
                </section>
                <section className="card card-book">
                  <OrderBookPanel
                    detail={detail.detail}
                    loading={detail.loading}
                    onClose={() => {
                      setSelectedToken(null);
                      setView('overview');
                    }}
                  />
                </section>
              </div>
              {selectedView === null && selectedToken !== null ? (
                <p className="muted">
                  The selected token is no longer in the scanner subscription set.
                </p>
              ) : null}
            </>
          ) : null}

          {view === 'trades' ? (
            <>
              <div className="page-head">
                <div>
                  <span className="eyebrow">Paper ledger</span>
                  <h1>Fills and realized PnL</h1>
                  <p>Every fill is persisted to SQLite with price, size, fee and realized PnL.</p>
                </div>
                <div className="page-head-meta">
                  <label className="select-label">
                    Session
                    <select
                      className="select"
                      value={tradeSessionId}
                      onChange={(event) => setTradeSessionId(event.target.value)}
                      aria-label="Filter trades by session"
                    >
                      <option value="current">
                        Current{session !== null ? ` · ${shortToken(session.id)}` : ''}
                      </option>
                      {sessions
                        .filter((item) => item.id !== session?.id)
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            {shortToken(item.id)} · {item.status}
                          </option>
                        ))}
                    </select>
                  </label>
                </div>
              </div>
              <div className="kpi-grid kpi-grid-4">
                <KpiCard label="Fills" value={`${displayedTrades.length}`} sub="paper executions" />
                <KpiCard
                  label="Realized PnL"
                  value={formatSignedUsd(viewRealized)}
                  tone={viewRealized >= 0 ? 'positive' : 'negative'}
                  sub="net of fees"
                />
                <KpiCard
                  label="Win rate"
                  value={viewClosed.length > 0 ? formatPct(viewWins / viewClosed.length) : '—'}
                  sub={`${viewWins}W / ${viewLosses}L`}
                />
                <KpiCard label="Fees" value={formatUsd(viewFees)} sub="configured bps" />
              </div>
              <section className="card">
                <div className="card-head">
                  <div>
                    <span className="eyebrow">Audit log</span>
                    <h2>Trade history</h2>
                  </div>
                  <span className="muted">newest first</span>
                </div>
                <TradesTable trades={displayedTrades} markets={markets} />
              </section>
            </>
          ) : null}

          {view === 'reports' ? (
            <ReportsView sessions={sessions} currentSession={session} markets={markets} />
          ) : null}

          {view === 'risk' ? (
            <>
              <div className="page-head">
                <div>
                  <span className="eyebrow">Controls</span>
                  <h1>Risk and compliance</h1>
                  <p>
                    The engine fails closed on stale books, wide spreads, duplicate orders, loss
                    limits and the operator kill switch.
                  </p>
                </div>
              </div>
              <div className="risk-layout">
                <section className="card card-risk">
                  <RiskPanel
                    risk={risk}
                    portfolio={portfolio}
                    health={health}
                    controlPending={controlPending}
                    onControl={(action) => void control(action)}
                  />
                </section>
                <div className="stack">
                  <FeedHealthPanel feed={state.feedHealth} health={health} />
                  <OperatorLog events={state.events} />
                  <ConfigCard state={state} />
                  <ComplianceCard state={state} />
                </div>
              </div>
            </>
          ) : null}

          <footer className="footer">
            <span>POLYHUNTER · paper-first prediction market terminal</span>
            <span>
              {config.demoMode ? 'demo feed' : 'public Polymarket data'} · not investment advice ·
              geoblock enforced
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
