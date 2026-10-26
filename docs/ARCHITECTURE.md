# Architecture

## Design goal

PolyHunter separates **provider facts**, **domain decisions**, **execution simulation** and
**presentation**. The boundaries exist so a provider change cannot silently alter risk math, and a
strategy change cannot leak into the UI or the database schema.

## Runtime topology

```text
┌──────────────────────┐       ┌──────────────────────────┐
│ Gamma REST (public)  │       │ CLOB REST (public)       │
└──────────┬───────────┘       └────────────┬─────────────┘
           │ markets                        │ book hydration
           ▼                                ▼
┌──────────────────────────────────────────────────────────┐
│ apps/server · PolyHunterEngine                          │
│  scanner → subscriptions → MarketSocket                 │
│  ingestBook → core strategy → risk → PaperBroker        │
│  persist signals/trades/snapshots → SSE state           │
└───────────┬───────────────────────────────┬──────────────┘
            │                               │
            ▼                               ▼
┌──────────────────────┐       ┌──────────────────────────┐
│ SQLite (node:sqlite) │       │ Fastify API + SSE        │
└──────────────────────┘       └────────────┬─────────────┘
                                            │
                                            ▼
                                 ┌──────────────────────┐
                                 │ React dashboard      │
                                 └──────────────────────┘
```

The server is a single Node process. SQLite is embedded, so there is no external service to run
for local paper trading. The dashboard is a static Vite build served by Fastify in production and
by Vite with an API proxy in development.

## Package boundaries

### `packages/core`

Pure domain logic with no network, filesystem or UI imports.

- `types.ts` — provider-neutral models and API DTOs.
- `money.ts` — price/size/money rounding and order sizing.
- `orderbook.ts` — normalization, top of book, microprice, imbalance, depth, VWAP walking.
- `strategy.ts` — Micro Maker and Momentum Taker.
- `risk.ts` — fail-closed risk checks, order-rate tracking, kill switch.
- `portfolio.ts` — cash/position ledger and settlement.
- `paper-broker.ts` — resting orders, market orders, partial fills, reservations, fees.
- `backtest.ts` — deterministic replay and metrics.
- `recording.ts` — JSONL book format.
- `synthetic.ts` — deterministic demo books.
- `format.ts` — UI formatting helpers.

### `packages/polymarket`

The only package that knows provider wire shapes.

- `gamma.ts` — active market discovery and mapping.
- `clob.ts` — public book/mid/spread REST with retries.
- `ws.ts` — market WebSocket: subscription, heartbeat (`PING`), normalization, reconnect.
- `geoblock.ts` — official geoblock check with fail-closed `UNKNOWN`.
- `schemas.ts` — Zod validation of external payloads.

Provider SDK objects never cross into `core`, `persistence`, `apps/server` business logic or the
browser.

### `packages/persistence`

Native `node:sqlite`; no native addon compilation. Tables:

- `markets` — latest scanner metadata.
- `signals` — every actionable decision, accepted or blocked, with reasons.
- `trades` — every paper fill and settlement.
- `portfolio_snapshots` — periodic equity/exposure time series for the chart.
- `runs` — one row per paper session: start/end, status, starting cash, ending equity, stop reason.
- `events` — engine lifecycle, risk events, provider resolution.

Signals, trades and portfolio snapshots carry a `session_id`; rows written before the migration
default to `legacy`. The database is an **audit log**, not the strategy state.

### Paper session semantics

- Starting the engine opens a new `runs` row and a fresh paper broker seeded with `STARTING_CASH`.
  Decisions, entry cooldowns and the risk controller are reset, so a restart never carries a
  position or a ledger into the new run.
- Stopping the engine or a failed autostart closes the run with an end time, ending equity and a
  reason.
- The kill switch marks the active run `killed` and timestamps the close. Resetting the kill switch
  reopens the same run rather than silently creating a new one.
- `GET /api/state` returns the current run, the last 20 runs and only the current run's ledger.
  `/api/sessions` lists runs newest first; `/api/trades` and `/api/signals` accept an optional
  `session=<id>` filter. Omitting the filter on those two endpoints returns all sessions from the
  SQLite audit log.

### `apps/server`

- `config.ts` — Zod-validated environment; refuses unsafe host/token combinations.
- `engine.ts` — orchestration, subscription lifecycle, risk calls, paper execution, settlement.
- `app.ts` — Fastify routes, SSE, rate limiting, security headers, API token.
- `recorder.ts` — append-only JSONL book recorder.
- `main.ts` — composition root and graceful shutdown.

### `apps/web`

React 19 + Vite. The dashboard consumes the `StateResponse` contract over `/api/stream` (SSE) with
a REST fallback. It does not import server code. It uses a custom design system in `styles.css`
rather than a generic component library.

## Hot path (per book update)

1. WebSocket message arrives at `MarketSocket`.
2. `MarketMessageNormalizer` validates the event, updates the local book and emits an `OrderBook`.
3. `PolyHunterEngine.ingestBook` normalizes and stores the book.
4. `PaperBroker.onBook` fills any resting order whose limit was crossed.
5. Strategy evaluates the new book with the current position and cooldown.
6. Risk evaluates the intent against the latest portfolio, book age, spread, depth, exposure,
   loss, drawdown and order-rate limits.
7. On approval, `PaperBroker.place` creates a resting limit order or executes a market IOC.
8. Signals and fills are persisted; the dashboard receives the next SSE snapshot.
9. The mark loop (1 s) updates marks, cancels TTL-expired orders, persists snapshots every 5 s and
   broadcasts state.

The design favors **correctness and auditability** over microsecond latency. The hot path is
single-process and allocation-light; the provider, not local compute, dominates freshness.

## Order lifecycle

```text
intent ──► risk allow? ──► broker validation ──► resting limit
                                   │                  │
                                   │                  ├─ book crosses → fill (possibly partial)
                                   │                  ├─ TTL expires → cancel
                                   │                  └─ stop/exit → market sell
                                   └─ reject → signal(rejected, reasons)
```

- Maker fills require the opposite side to cross the limit. The simulator does not assume a fill
  just because a quote is visible.
- Market orders are IOC: fill available depth within `maxSlippage`; cancel the remainder.
- Cash for resting buys and shares for resting sells are reserved, preventing double-spend.
- Positions are long-only. A sell larger than the held position is rejected.
- Settlement pays 1 per winning share and 0 per losing share.

## API

| Method | Route                   | Notes                                 |
| ------ | ----------------------- | ------------------------------------- |
| GET    | `/api/health`           | engine + provider + geoblock health   |
| GET    | `/api/state`            | full dashboard snapshot               |
| GET    | `/api/markets`          | scanner views                         |
| GET    | `/api/markets/:tokenId` | full book + decision + position       |
| GET    | `/api/trades?limit=`    | persisted fills                       |
| GET    | `/api/signals?limit=`   | persisted signals                     |
| GET    | `/api/portfolio`        | cash/equity/exposure                  |
| GET    | `/api/risk`             | limits + last checks                  |
| POST   | `/api/control`          | `start`, `stop`, `kill`, `reset-kill` |
| GET    | `/api/stream`           | SSE `state` events + heartbeat        |
| GET    | `/metrics`              | Prometheus text                       |

All JSON responses use `{ "ok": true, "data": ... }` or
`{ "ok": false, "error": { "code", "message" } }`.

## Security posture

- Loopback by default. Non-loopback binding requires `API_TOKEN`.
- `x-api-token` is compared in constant time for control actions.
- Rate limiting on the API and a stricter limit on control actions.
- Security headers, no framing, no referrer, restrictive CSP in production.
- Structured logs with redaction paths for auth headers, keys and secrets.
- No live signing code exists in the repository.

## Failure modes

| Failure                      | Behavior                                                      |
| ---------------------------- | ------------------------------------------------------------- |
| Gamma unavailable            | Start fails closed; dashboard shows engine error              |
| CLOB hydration fails         | Individual token books are missing; no trade without a book   |
| WebSocket disconnect         | Exponential reconnect; books age out and are rejected by risk |
| Malformed WS message         | Ignored; last valid book remains until stale                  |
| Stale book                   | Strategy/risk block new orders                                |
| Crossed book                 | Strategy/risk block new orders                                |
| Provider geoblock blocked    | Live mode refuses to start; paper mode continues              |
| Kill switch                  | Cancels resting orders and blocks new exposure                |
| Dashboard SSE loss           | UI marks stream offline and polls REST every 10 s             |
| JSONL recorder write failure | Logged; does not halt trading                                 |
| SQLite write failure         | Logged; in-memory paper state continues                       |

## Deployment notes

This build is optimized for a single-user local terminal. Do not expose it to the public internet
without adding authentication/authorization, TLS termination, per-user isolation and a full secrets
review. The multi-tenant/micro-SaaS direction from the older `poly-hunter` reference is **not**
implemented here.
