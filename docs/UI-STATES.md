# Dashboard states and recovery

The terminal must never show a blank screen when the API, SSE stream or a component fails.

## States

| State                  | What the user sees                                                                |
| ---------------------- | --------------------------------------------------------------------------------- |
| Initial load, no state | Branded loading screen with a retry once the request fails                        |
| API unreachable        | **Engine unavailable** fatal screen with Retry and `npm run dev`                  |
| SSE offline            | **Stream offline** banner; `/api/state` polling every 10s; dashboard stays usable |
| Control failure        | **Control action failed** banner with dismiss/retry                               |
| Render crash           | **Dashboard crashed** boundary with Reload and Try again                          |
| Empty markets          | **No markets yet** state in the scanner                                           |
| Empty ledger/signals   | **No paper fills yet** / **No actionable signals** states                         |
| Empty report           | **No session selected** state                                                     |
| Running report         | Partial-report notice and `metrics.incomplete: true`                              |

## SSE fallback

`useDashboard` opens `/api/stream`. If the EventSource errors, the connection becomes `offline`, the
banner appears and a 10-second poll of `/api/state` keeps the view current. The top bar shows
`STREAM OFFLINE`; the rest of the UI remains interactive. Reopening the page retries the SSE stream.

## Error boundary

`ErrorBoundary` wraps the React root. A render exception shows the error message, a **Reload
dashboard** button and a **Try again** button that resets the boundary state. The paper engine and
SQLite ledger are outside React, so a render crash does not lose data.

The boundary is intentionally not used for event-handler errors; those are caught by the control
path and shown in the control banner.

## Partial data

`useDashboard` normalizes missing `session`, `sessions`, `events` and `feedHealth` fields to safe
defaults so an older/partial API response does not crash the shell. A missing portfolio is still a
contract violation and is caught by the error boundary.

## E2E coverage

- SSE aborted → offline banner and dashboard still visible.
- Empty markets/trades → explicit empty states, no blank screen.
- Forced malformed state → crash boundary, then Reload recovers.

Run `npm run test:e2e` after UI changes.
