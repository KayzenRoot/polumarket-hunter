# Production contract — PolyHunter v0.1.0

Status: **DRAFT — pending owner approval**
Target: v0.1.0, paper-first local production
Repository: https://github.com/KayzenRoot/polumarket-hunter
Owner: KayzenRoot

This document defines what “production” means for the first version. If a requirement is not in
this contract, it is not a v0.1.0 production requirement.

## 1. Product definition

PolyHunter v0.1.0 is a **local, single-user, paper-first prediction-market research terminal**.

It:

- discovers public Polymarket markets;
- streams public order books;
- runs the Micro Maker and Momentum Taker strategies;
- simulates paper fills, risk limits and settlement;
- records books and replays/backtests them;
- exposes a dashboard, API, SSE stream and metrics.

It does **not** submit live orders, connect a wallet, hold keys, or bypass a venue restriction.

## 2. Supported environment

| Item              | Requirement                                                 |
| ----------------- | ----------------------------------------------------------- |
| Primary OS        | Windows 10/11 x64                                           |
| Node.js           | 24 LTS or 26.x (`>=24 <27`)                                 |
| npm               | 11+                                                         |
| Browser           | Current Chromium-based browser, Firefox, or Safari          |
| Secondary runtime | Linux with Docker (reproducibility/CI)                      |
| Network           | Public HTTPS/WSS access to Polymarket endpoints             |
| Storage           | Local disk; SQLite + JSONL recordings                       |
| Accounts          | Single operator; no user accounts or multi-tenant isolation |

Unsupported for v0.1.0: mobile-native apps, public internet exposure without a TLS reverse proxy,
multi-tenant hosting, Windows 32-bit, Node 22 or older.

## 3. Operating model

- **Paper only.** `TRADING_MODE=paper` is the only mode that can complete a session.
- **Live is fail-closed.** `TRADING_MODE=live` requires explicit authorization and an eligible
  geoblock, and still fails because no live adapter exists.
- **Jurisdiction.** The official geoblock endpoint reported `blocked: true` for BR on 2026-10-26.
  No VPN, proxy, account-sharing or geoblock bypass is part of the product.
- **Single operator.** The API binds to `127.0.0.1` by default. A non-loopback bind requires
  `API_TOKEN`; TLS termination and a reverse proxy are the operator's responsibility.
- **No financial advice.** Prices are informational. No profit, fill, liquidity or resolution
  guarantee is made.

## 4. Data and storage

- SQLite database: `data/polyhunter.db` (configurable via `DATABASE_PATH`).
- JSONL recordings: `data/recordings/` (configurable via `RECORD_DIR`).
- The database is an audit log; the paper ledger resets on process restart in v0.1.0.
- Recordings are append-only JSONL. The recorder writes one normalized book per line.
- Default retention is defined by the operator; v0.1.0 must provide a documented prune and backup
  procedure before the release gate.
- Backups must be taken after a SQLite checkpoint or with the database stopped. Restore is tested on
  a copy, never against the only copy.
- No secrets, private keys, seed phrases, API passphrases or account data are stored.

## 5. Security

- No live signing code, wallet connection or withdrawal capability.
- No secrets are required for paper mode.
- Structured logs redact auth headers, API keys and common secret fields.
- Control actions require a constant-time API token check when `API_TOKEN` is set.
- The API has rate limits and security headers; production public exposure requires TLS and a
  separate review.
- CI must have no open high-severity CodeQL, secret-scanning or dependency findings at release.

## 6. Availability and recovery

- v0.1.0 is a local tool, not a 24/7 service. No SLA is offered.
- The engine must survive a provider disconnect through bounded reconnect and stale-data rejection.
- Kill switch, cancel-all and graceful shutdown are operator controls.
- On restart: start a new paper session; do not silently merge it with the previous session.
- A corrupted recording must be rejected by the data validator, not half-ingested.
- A failed SQLite write must be logged; in-memory paper state may continue, but the operator must
  see the degradation.

## 7. Observability

Minimum v0.1.0:

- `/api/health` with engine, provider and geoblock state;
- `/metrics` with counters/gauges;
- dashboard provider, last-book, book-age and risk state;
- feed-health percentiles (p50/p95/p99), gaps and reconnect counts;
- session report/export;
- `npm run doctor` diagnostics;
- persisted engine/risk events.

## 8. Upgrade and rollback

Upgrade procedure:

1. backup the SQLite database and recordings;
2. stop the process;
3. pull the target tag;
4. `npm ci`;
5. `npm run build`;
6. reopen the database and apply the migration;
7. run `npm run doctor` and `npm run smoke`;
8. start and verify a paper session.

Rollback: stop, restore the backup, checkout the previous tag, `npm ci`, `npm run build`, start.
The release notes must state whether the migration is reversible.

## 9. Quality and release gates

- `npm run ci` green on Linux and Windows.
- `npm run test:e2e` green.
- Coverage thresholds: ≥80% statements/lines/functions and ≥75% branches.
- No open high CodeQL/secret/dependency findings.
- Three validated recordings and a published research decision memo.
- Clean-checkout Windows runbook test passed.
- Release artifact with SBOM and SHA256 checksums.
- Owner approval recorded in issue #15.

## 10. Out of scope for v0.1.0

- live orders, signing, wallets, deposits/withdrawals;
- multi-tenant SaaS, user accounts, billing;
- guaranteed profitability or investment advice;
- geoblock bypass;
- mobile-native apps;
- 24/7 hosted availability;
- exchange-grade matching or colocation.

## 11. Known limitations and accepted risks

- The operator is the only reviewer; human code review is not enforced.
- The repository is new; Scorecard “Maintained” is expected to be low.
- Maker fills are deliberately conservative and may be rare.
- The paper ledger resets on restart; session identity is a v0.1.0 gate.
- Fee assumptions must be configured; the default of zero is not universal.
- Public provider APIs, tick sizes and fees can change.

## 12. Approval record

- [ ] Owner has read this contract.
- [ ] Owner accepts the paper-only and no-bypass boundaries.
- [ ] Owner accepts the supported environment and limitations.
- [ ] Owner approves v0.1.0 production scope.

Approval comment: _pending_

Linked plan: [PRODUCTION-PLAN.md](PRODUCTION-PLAN.md)
