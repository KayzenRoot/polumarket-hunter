# PolyHunter — agent operating instructions

## Source of truth

- Repository: `https://github.com/KayzenRoot/polumarket-hunter`
- The repository is the canonical source for code, configuration, tests and decisions.
- Prior art lives in the older `KayzenRoot/poly-hunter` repository. It is reference only; do not
  silently copy its governance layers or treat it as the current implementation.
- `AGENTS.md` and `.ecc/instructions/OPERATING-LOOP.md` are the project-level agent contract.

## Product boundary

PolyHunter is a **paper-first Polymarket microstructure terminal**. It uses public market data,
deterministic paper fills, a hard risk engine, replay/backtest and a dashboard.

Hard rules:

1. **Live execution is not implemented.** `TRADING_MODE=live` must fail closed even when
   `LIVE_TRADING_AUTHORIZED=true`.
2. **Never bypass a venue geoblock.** No VPN, proxy, account-sharing, jurisdiction-spoofing or
   geoblock-evasion code. The official endpoint currently reports `BLOCKED` for BR.
3. **No secrets in the repository.** Never request, print, persist or commit private keys, seed
   phrases, API secrets, passphrases or session keys. The app needs none of them for paper mode.
4. **No financial advice.** Prediction-market prices are informational, not objective probabilities
   or recommendations. Do not promise profit or “risk-free” returns.
5. **Fail closed.** Stale books, crossed books, missing depth, duplicate orders, loss limits,
   drawdown limits and the kill switch must block new exposure.

## Commands

| Command                                  | Purpose                                                  |
| ---------------------------------------- | -------------------------------------------------------- |
| `npm run dev`                            | Fastify API + Vite dashboard                             |
| `npm run build`                          | TypeScript project build + Vite production build         |
| `npm start`                              | Run the built server (serves `apps/web/dist`)            |
| `npm run verify`                         | lint + typecheck + tests + build                         |
| `npm run ci`                             | lint + typecheck + coverage + build                      |
| `npm run smoke`                          | Live public Gamma/CLOB/WebSocket/geoblock smoke test     |
| `npm run record -- --minutes 5`          | Record public order books to JSONL                       |
| `npm run backtest -- --file <recording>` | Replay a recording through the strategy                  |
| `npm run demo`                           | Deterministic synthetic backtest                         |
| `npm run ecc:sync`                       | Refresh the curated ECC skills/rules from `node_modules` |

## Architecture map

- `packages/core` — pure domain: money, order book math, strategy, risk, portfolio, paper broker,
  replay, backtest, formatting.
- `packages/polymarket` — public provider boundary: Gamma, CLOB, WebSocket normalizer, geoblock.
  Provider wire types must not leak into domain or UI code.
- `packages/persistence` — native `node:sqlite` audit log for markets, signals, trades, snapshots
  and events.
- `apps/server` — Fastify API, SSE state stream, engine orchestration, recorder.
- `apps/web` — React terminal UI. It consumes the API contract; it must not import server code.
- `packages/testkit` — deterministic builders and fixtures.

## Financial invariants

- Prices live in the open interval `(0, 1)`.
- A book with bid `>=` ask is crossed and is never tradeable.
- A stale book (older than `maxBookAgeMs`) is never tradeable.
- Long-only paper positions: a SELL cannot exceed held shares.
- Cash and reserved cash cannot be double-spent by resting orders.
- `equity = cash + mark-to-market exposure`; `totalPnl = equity - startingCash`.
- A maker limit order fills only when the opposite side crosses the limit; the simulator must not
  assume a fill just because the quote exists.
- Every fill is persisted with price, size, notional, fee, realized PnL and order id.

## Quality gates

- Biome format/lint, TypeScript strict mode (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`).
- Vitest unit/integration tests plus property-based tests; coverage thresholds are enforced.
- Playwright E2E for the dashboard and control flow.
- CI also runs CodeQL, Semgrep, Gitleaks, OSV-Scanner, dependency review, actionlint, zizmor and
  OpenSSF Scorecard. Do not weaken a gate to make a change pass.
- When a test fails, fix the implementation or the test’s incorrect assumption — never delete the
  assertion silently.

## Working loop

Use the ECC loop documented in `.ecc/instructions/OPERATING-LOOP.md`:

`plan -> test -> implement -> review -> verify -> remember`

Read the relevant curated skill before large changes:

- `tdd-workflow`, `verification-loop` — test-first and completion evidence.
- `security-review`, `production-audit` — security and release review.
- `latency-critical-systems` — streaming/freshness/latency work.
- `prediction-market-risk-review`, `prediction-market-oracle-research` — venue and signal caveats.
- `api-design`, `backend-patterns`, `frontend-patterns`, `e2e-testing` — application work.
- `error-handling`, `benchmark-optimization-loop`, `context-budget`, `strategic-compact` — reliability
  and context discipline.

## Style

- Immutable data at boundaries; small focused files; explicit public return types.
- No `any` in application code; use `unknown` plus narrowing.
- Parse external data with Zod at the provider boundary.
- Redact secrets in logs. Never log full provider payloads containing account data.
- Keep the UI specific to this product; no generic dashboard filler, no fake performance claims.
