# Changelog

## 0.1.1 — 2026-10-27

### Added

- OpenAPI 3.0.3 contract served at `/openapi.json`, with route coverage, snapshot tests and
  `docs/API.md`.
- Axe accessibility, keyboard navigation and 390px mobile Playwright coverage.
- systemd, logrotate and Windows Task Scheduler supervisor recipes with configuration tests.
- Packaged-artifact smoke test in the release workflow: health, dashboard, kill and reset before
  publishing.
- npm audit gate with time-bounded owner exceptions in `security/audit-exceptions.json`.
- Hash-pinned Semgrep requirements and digest-pinned Docker base images.
- `docs/DEPENDENCY-POLICY.md`, `docs/SUPERVISOR.md` and the solo-owner review decision.

### Changed

- Raised the faint-label contrast to WCAG AA (`#7c93a8`).
- Tightened the release workflow top-level token to `contents: read`; write is scoped to the release
  job.
- Corrected the release runbook's extraction and working-directory instructions.
- Documented the two accepted medium Python scanner advisories; they are scanner-only and dismissed
  as tolerable risk.

### Safety

- Live execution is not implemented and fails closed.
- No wallet, private key, seed phrase, API secret or geoblock bypass is included.
- The paper strategy has no verified edge; no profitability claim is made.

## 0.1.0 — 2026-10-26

### Added

- Paper-first Polymarket microstructure engine with Gamma discovery, CLOB REST hydration and
  public market WebSocket streaming.
- Micro Maker and Momentum Taker strategies with deterministic paper fills, fees, reserved cash,
  partial fills and settlement.
- Fail-closed risk engine: stale/crossed books, spread, depth, per-market and total notional, open
  positions, daily loss, drawdown, order rate, duplicate orders and kill switch.
- Native SQLite audit log via `node:sqlite`.
- Fastify API, SSE state stream, Prometheus metrics and React terminal dashboard.
- JSONL book recorder, replay/backtest CLI, synthetic demo mode and live public-data smoke test.
- Playwright E2E for dashboard navigation and kill/reset flow.
- CI: Biome, strict typecheck, Vitest coverage, build, Playwright.
- Security: CodeQL, Semgrep, Gitleaks, OSV-Scanner, dependency review, actionlint, zizmor,
  OpenSSF Scorecard, harden-runner, Dependabot.
- Curated ECC 2.2.3 skills/rules and OpenCode plugin configuration.

### Safety

- Live execution is not implemented and fails closed.
- Official geoblock reports `BLOCKED` for BR; no bypass is included.
- No wallet connection, private key, seed phrase or API secret is requested.
