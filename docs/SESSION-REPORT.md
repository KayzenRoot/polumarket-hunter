# Session reports and export

A paper session report is rebuilt from SQLite on every request. It does not store a generated
snapshot, so the same rows always produce the same JSON/CSV.

## Endpoints

| Method | Path                           | Result           |
| ------ | ------------------------------ | ---------------- |
| GET    | `/api/sessions`                | Last 50 sessions |
| GET    | `/api/sessions/:id/report`     | JSON report      |
| GET    | `/api/sessions/:id/report.csv` | CSV download     |

Unknown sessions return `404 not_found`. A running session returns a report with
`metrics.incomplete: true`; the numbers continue to change until the session ends. A stopped or
killed session uses the persisted `endingEquity`.

## JSON shape

- `session` — id, start/end, status, mode, starting cash, ending equity, stop reason.
- `metrics` — trades, buys/sells, wins/losses, win rate, fees, realized/unrealized/total PnL,
  signals, accepted/rejected signals, rejections by reason, `incomplete`.
- `equityCurve` — portfolio snapshots in ascending time order.
- `trades` — every fill in ascending time order.
- `signals` — every accepted or blocked strategy signal in ascending time order.
- `rejections` — the blocked signals with their full reasons.

No `generatedAt` timestamp is included, so two exports of the same persisted data compare equal.

## CSV layout

The CSV is sectioned for humans and simple scripts:

```text
# session
id,startedAt,...
# metrics
metric,value
...
# trades
id,at,marketId,...
# signals
id,at,marketId,...
# equity
at,equity,exposure
```

Rows are ordered oldest first. Fields containing commas or quotes are escaped. The full event
history is in the JSON; the CSV is a single-file convenience export.

## Dashboard

The **Reports** view lets you select the current or a previous session, inspect the metadata,
equity curve, rejections and fills, and download JSON or CSV. Downloads use the same API token
header as the rest of the dashboard when `API_TOKEN` is configured.

## Reproducibility and limits

- The report is derived only from `runs`, `trades`, `signals` and `portfolio_snapshots` rows for the
  session id.
- Signals/trades written before the session migration belong to `legacy` and are not part of a
  numbered session.
- Fees are the persisted fill fees; the report does not re-derive a fee schedule.
- A running session may have no snapshot yet; `endingEquity` then falls back to starting cash.
