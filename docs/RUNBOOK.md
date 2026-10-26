# Runbook

## Local development

```bash
npm ci
cp .env.example .env
npm run dev
```

- Dashboard: http://127.0.0.1:5173
- API: http://127.0.0.1:8787
- SSE: http://127.0.0.1:8787/api/stream
- Metrics: http://127.0.0.1:8787/metrics

The API autostarts the paper engine unless `POLYHUNTER_AUTOSTART=false`.

## Offline demo

```bash
# .env
DEMO_MODE=true
```

The demo generates three deterministic synthetic markets and never calls Polymarket. It is the
fastest way to verify the UI, SSE, risk panel, kill switch and paper ledger.

## Real public data, paper execution

```bash
# .env
DEMO_MODE=false
TRADING_MODE=paper
MAX_MARKETS=12
MIN_LIQUIDITY=25000
```

The engine discovers markets via Gamma, hydrates books via CLOB, then subscribes to the YES token
of each selected market over the public WebSocket. No credentials are used.

Verify provider reachability before starting:

```bash
npm run smoke
```

Expected on the current BR network: Gamma/CLOB/WS pass; geoblock is `BLOCKED (BR)`. That is not a
smoke failure for paper mode.

## Provider failure behavior

The paper engine fails closed; a provider fault must never create exposure.

- A stale, crossed, one-sided or missing book produces `HOLD` and no paper order. The last accepted
  book age is exported as `polyhunter_last_book_age_ms` (`-1` means no book yet).
- A silent or stale WebSocket triggers a reconnect. `/api/health` exposes
  `provider.lastMessageAt`, `provider.reconnectCount` and `provider.error`; the engine also records
  scanner failures as `scanner_refresh_failed` events.
- CLOB `429` and `5xx` responses are retried with exponential backoff. When the retry budget is
  exhausted the token result carries the provider error and is skipped for that scan.
- Tick-size changes and market resolutions are applied through the stream and persisted as
  `tick_size_change` / `market_resolved` audit events.

Inspect `/api/health`, `/metrics` and the SQLite `events` table before restarting after a provider
incident. Do not raise `BOOK_STALE_MS` or disable the stale/crossed checks to “make it trade”.

## Auto-kill and alerts

The engine can kill itself without operator input:

- **Daily loss:** `MAX_DAILY_LOSS` (default `$25`) — triggers when daily PnL is at or below the
  negative limit.
- **Drawdown:** `MAX_DRAWDOWN_PCT` (default `0.08`) — triggers when equity falls from its peak by
  that fraction.
- **Stale feed:** `FEED_STALE_MS` (default `60000`) — triggers when no book has arrived for that
  long, including a feed that never delivered a first book after start.

On trigger the engine cancels resting paper orders, sets the risk kill switch, marks the session
`killed`, persists an `auto_kill` event with the reason and timestamp, and emits a structured alert.
The dashboard’s risk panel shows the kill reason. Restarting is never automatic: an operator must
call reset-kill (or restart the process after the feed is healthy).

Set `ALERT_WEBHOOK_URL` to an `http`/`https` endpoint to receive a JSON POST such as:

```json
{
  "kind": "auto-kill",
  "reason": "drawdown limit: 0.082 >= 0.08",
  "at": 1790000000000,
  "mode": "paper",
  "sessionId": "ses_..."
}
```

The webhook is best-effort; a failure is logged and does not block the kill. The local SQLite
`events` row is the durable record. Keep the webhook on a trusted local network; do not put secrets
in the URL.

Recovery:

1. Confirm the feed, venue and risk state in `/api/health`, `/metrics` and the dashboard.
2. Fix the cause; do not raise a limit just to resume.
3. Reset the kill switch explicitly and watch the first books before leaving it unattended.

## Production-style local run

```bash
npm run build
npm start
```

Open http://127.0.0.1:8787. Fastify serves the built dashboard from `apps/web/dist`.

## Recording books

```bash
npm run record -- --minutes 10 --markets 8 --min-liquidity 50000
```

Output: `data/recordings/polyhunter-YYYY-MM-DD.jsonl` (one normalized book per line). Press
`Ctrl+C` to stop early; the recorder flushes before exit.

## Backtesting a recording

```bash
npm run backtest -- --file data/recordings/polyhunter-YYYY-MM-DD.jsonl
npm run backtest -- --file <file> --strategy momentum-taker --json --out metrics.json
```

Options: `--cash`, `--fee-bps`, `--edge`, `--imbalance`, `--max-spread`, `--take-profit`,
`--stop-loss`, `--min-depth`.

The backtest uses the same strategy/risk/broker code as the paper engine. It is still a simulation;
see [STRATEGY.md](STRATEGY.md) for the limitations.

## Kill switch

Dashboard → **Kill**. Or:

```bash
curl -X POST http://127.0.0.1:8787/api/control \
  -H 'content-type: application/json' \
  -d '{"action":"kill"}'
```

The switch cancels resting orders and blocks new exposure. It does not close existing paper
positions. Reset with `{"action":"reset-kill"}`.

If `API_TOKEN` is set:

```bash
curl -X POST http://127.0.0.1:8787/api/control \
  -H 'content-type: application/json' \
  -H "x-api-token: $API_TOKEN" \
  -d '{"action":"kill"}'
```

## API token and host binding

- Default `HOST=127.0.0.1`; no token required.
- A non-loopback bind (`0.0.0.0`, a LAN IP) without `API_TOKEN` is refused at startup.
- Set `API_TOKEN` in `.env`; the dashboard key button stores it in local storage.
- Use a TLS reverse proxy if the app is exposed beyond localhost. This build is not multi-tenant.

## Database

Default: `data/polyhunter.db` (SQLite WAL). Tables: markets, signals, trades,
portfolio_snapshots, events.

```bash
# Inspect with the sqlite3 CLI if installed
sqlite3 data/polyhunter.db '.tables'
sqlite3 data/polyhunter.db 'select count(*) from trades;'
```

The paper ledger resets on process start; the DB is an audit log, not a live account ledger.

## Logs

- `LOG_LEVEL=info` by default; `debug` for provider/engine detail.
- Development uses pretty logs; production uses JSON.
- Secrets and auth headers are redacted.
- Avoid logging full provider payloads with account data.

## Common failures

| Symptom                        | Likely cause                                  | Action                                                  |
| ------------------------------ | --------------------------------------------- | ------------------------------------------------------- |
| Dashboard “Engine unavailable” | API not running or wrong proxy                | `npm run dev`; check port 8787                          |
| `STREAM OFFLINE`               | WebSocket disconnected                        | Wait for backoff; check `npm run smoke`                 |
| No markets                     | Gamma filter/network/`MIN_LIQUIDITY` too high | Lower `MIN_LIQUIDITY`, check Gamma                      |
| All decisions HOLD             | spread/staleness/depth/edge filters           | Inspect the decision reasons in Markets                 |
| Orders never fill              | maker model requires the ask to cross the bid | Expected; record a longer period and backtest           |
| `429` from provider            | rate limit                                    | Reduce `MAX_MARKETS`, wait for backoff                  |
| Geoblock `BLOCKED`             | venue jurisdiction restriction                | Paper mode only; do not bypass                          |
| `EADDRINUSE`                   | port already in use                           | Change `PORT` or stop the old process                   |
| SQLite locked                  | another process holds the DB                  | Stop other instances or use a different `DATABASE_PATH` |

## Provider contract changes

The provider boundary is validated with Zod and fixture tests. If Polymarket changes a field:

1. Capture a sanitized sample in a test fixture.
2. Update `packages/polymarket/src/schemas.ts` and the mapper.
3. Add a failing test first.
4. Run `npm run smoke`.
5. Run the full `npm run ci`.

## Verification before merge

```bash
npm run lint
npm run typecheck
npm run test:coverage
npm run build
npm run test:e2e
```

CI repeats these on the exact commit. Do not merge on stale local output.
