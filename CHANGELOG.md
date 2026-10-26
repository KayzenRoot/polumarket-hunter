# Changelog

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
