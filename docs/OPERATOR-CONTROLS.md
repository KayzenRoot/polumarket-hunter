# Operator controls and audit

All controls are available from the dashboard and `POST /api/control`:

```json
{ "action": "pause", "actor": "dashboard" }
```

`actor` is optional (1–64 chars) and defaults to `operator`. Every successful action is written to
the `events` table as an `operator_action` with the actor and timestamp, then exposed in
`GET /api/events` and the dashboard **Operator log**.

## Actions

| Action       | Effect                                                                                                             |
| ------------ | ------------------------------------------------------------------------------------------------------------------ |
| `start`      | Start a new paper session if stopped. No-op while running or paused.                                               |
| `stop`       | Stop timers/stream and close the session.                                                                          |
| `pause`      | Block new entries, cancel resting BUY orders, keep books/SSE/mark loop alive.                                      |
| `resume`     | Return a paused engine to running. Does not clear a kill.                                                          |
| `cancel-all` | Cancel every resting paper order. Positions are unchanged.                                                         |
| `flatten`    | Cancel orders, then market-sell each position at the current bid. Residual shares remain if depth is insufficient. |
| `kill`       | Kill switch: cancel all orders, latch the kill, close the session.                                                 |
| `reset-kill` | Explicitly clear a kill and resume the same session.                                                               |

`pause` leaves resting SELL orders in place so exits can still reduce exposure. If you want a
completely quiet book, use `cancel-all`.

`flatten` uses the same `PaperBroker` position checks as normal sells; it cannot sell more shares
than are held. It never creates a short position. The event records filled shares, residual shares,
cancelled orders and skipped tokens.

## Pause vs kill

- **Pause** is reversible without clearing risk state; the feed and dashboard stay live.
- **Kill** is latched and requires `reset-kill` before `start`. Auto-kill uses the same latch.

## API responses

The control endpoint returns the latest `StateResponse`. A failed action returns `409` with the
engine error. Invalid actions or actor lengths return `400`. The API token is required when the
server is bound to a non-loopback host.

## Audit trail

`GET /api/events?limit=50` returns newest first:

```json
{
  "at": 1793034000000,
  "kind": "operator_action",
  "severity": "info",
  "message": "operator action: flatten",
  "details": "{\"action\":\"flatten\",\"actor\":\"dashboard\",\"filledShares\":41.67,\"residualShares\":0}"
}
```

Keep the actor value meaningful when scripting. Do not put secrets in `actor`.
