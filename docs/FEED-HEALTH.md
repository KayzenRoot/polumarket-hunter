# Feed health metrics

The engine keeps a rolling window of feed timing so an operator can tell a quiet market from a
broken feed. The window holds 512 samples; the age sampler runs on the 1s mark loop, so it covers
roughly the last 8.5 minutes.

## Definitions

| Signal           | Meaning                                                                    |
| ---------------- | -------------------------------------------------------------------------- |
| Book age         | `now - lastBookAt`; current freshness of the feed.                         |
| Sampled age      | Book age recorded once per mark-loop tick; used for p50/p95/p99.           |
| Message gap      | Time between consecutive book arrivals, across all subscribed tokens.      |
| Provider latency | Local arrival time minus the provider book timestamp; includes clock skew. |
| Reconnect count  | Market WebSocket reconnect attempts since process start.                   |
| Stale period     | A contiguous interval where book age exceeded `BOOK_STALE_MS`.             |

`BOOK_STALE_MS` (default 5s) is the tradeability threshold. `FEED_STALE_MS` (default 60s) is the
watchdog that auto-kills the engine. A feed can be stale for trading while the watchdog is still
waiting; the dashboard shows both.

## Prometheus metrics

| Metric                                 | Type    | Meaning                             |
| -------------------------------------- | ------- | ----------------------------------- |
| `polyhunter_book_age_ms`               | gauge   | Current book age (`-1` = no book)   |
| `polyhunter_book_age_p50_ms`           | gauge   | Median sampled age                  |
| `polyhunter_book_age_p95_ms`           | gauge   | P95 sampled age                     |
| `polyhunter_book_age_p99_ms`           | gauge   | P99 sampled age                     |
| `polyhunter_message_gap_p50_ms`        | gauge   | Median arrival gap                  |
| `polyhunter_message_gap_p95_ms`        | gauge   | P95 arrival gap                     |
| `polyhunter_message_gap_p99_ms`        | gauge   | P99 arrival gap                     |
| `polyhunter_message_gaps`              | gauge   | Arrivals in the rolling window      |
| `polyhunter_provider_latency_p50_ms`   | gauge   | Median provider timestamp lag       |
| `polyhunter_provider_latency_p95_ms`   | gauge   | P95 provider timestamp lag          |
| `polyhunter_provider_latency_p99_ms`   | gauge   | P99 provider timestamp lag          |
| `polyhunter_provider_reconnects_total` | counter | WebSocket reconnect attempts        |
| `polyhunter_feed_stale_periods_total`  | counter | Stale periods observed              |
| `polyhunter_feed_stale_ms_total`       | counter | Total time spent stale              |
| `polyhunter_last_book_age_ms`          | gauge   | Compatibility alias for current age |

The dashboard also shows these on the **Risk** page in the feed-health panel.

## Interpretation

- A p99 gap below `BOOK_STALE_MS` means the book is normally tradeable; a p99 above it means the
  strategy will spend real time in `HOLD` even when the feed is healthy.
- Provider latency near zero with a fresh local book is normal. A rising latency with a fresh
  arrival means the venue timestamp is lagging, not that the socket is down.
- Reconnects are attempts, not successes. A rising count with stale periods means the stream is
  flapping; inspect `/api/health` `provider.error` and the SQLite events.
- A stale period that closes on its own is a warning for research; a stale period that reaches
  `FEED_STALE_MS` triggers the auto-kill and must be reviewed before reset.
- A quiet market with no trades can have a large book age even though the socket is healthy. Check
  the token coverage in the recording before treating it as a provider incident.

## Where to look

- `GET /api/state` → `feedHealth`
- `GET /api/health` → `provider.lastMessageAt`, `provider.reconnectCount`, `provider.error`
- `GET /metrics` → the table above
- SQLite `events` → `auto_kill`, `scanner_refresh_failed`, `tick_size_change`, `market_resolved`

Do not raise `BOOK_STALE_MS` or `FEED_STALE_MS` to make a dashboard look green. If the feed is
genuinely slower, record it and document the research assumption.
