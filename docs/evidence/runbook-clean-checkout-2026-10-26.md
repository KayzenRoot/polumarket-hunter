# Clean-checkout Windows runbook evidence — 2026-10-26

Scope: clean git checkout on the existing Windows research host, Node 26.4.0. This is **not** a
freshly installed Windows OS, so #32 still needs owner confirmation of the clean-machine run.

## Checkout

```powershell
git worktree add --detach C:\Users\csn19\AppData\Local\Temp\opencode\polyhunter-clean bb56532
cd C:\Users\csn19\AppData\Local\Temp\opencode\polyhunter-clean
npm ci --no-audit --no-fund
```

Result: 186 packages installed in 43s, exit 0. No global state from the main checkout was used.

## Configuration

`.env`:

```text
NODE_ENV=development
HOST=127.0.0.1
PORT=8792
DEMO_MODE=true
DATABASE_PATH=data/clean.db
RECORD_DIR=data/recordings
LOG_LEVEL=error
```

## Doctor

`npm run doctor -- --skip-network`:

- PASS Node 26.4.0, config, port 8792, SQLite parent writable, 9.20 GiB disk.
- The first attempt used port 8791 and correctly failed with “already in use”. Changing to 8792
  passed; this is the intended doctor behavior.

`npm run doctor` (network):

- PASS Gamma HTTP 200, CLOB `/time`, clock skew 996ms.
- WARN geoblock BLOCKED (BR); paper mode is allowed. No bypass.

## Smoke

`npm run smoke` passed:

- Gamma returned 3 active markets.
- CLOB returned a two-sided book (bid 0.92 / ask 0.921).
- WebSocket delivered a book.
- Geoblock reported `BLOCKED (BR)` and the script correctly kept paper mode.

## Recording, validation and backtest

A 1-minute recording produced 851 books over 58.4s. Validation failed only on the 60s minimum
duration; this is expected because the recording timer starts before the stream and the first book.
The runbook now says to use at least 2 minutes for a smoke recording.

A 2-minute recording produced 702 books over 1m58s:

- `data:validate`: pass, 0 errors; warnings: 1 crossed/locked (0.14%), 679 duplicate hashes, 2
  out-of-order.
- `npm run backtest`: pass, 0 fills, fee model “0 bps flat on notional (fallback)”.

## Build and start

`npm run build` passed (API + dashboard).

Started the built server with `node apps/server/dist/main.js`:

- `/api/health` → `running`.
- `POST /api/control {"action":"kill"}` → `killed`, reason `operator kill switch`.
- `POST /api/control {"action":"reset-kill"}` → `running`.

## Findings

- The API port collision was caught by doctor and is not a product defect.
- A 1-minute recording can miss the 60s validator minimum; documented and the recommendation is to
  use 2+ minutes for smoke recordings.
- Everything else completed without undocumented steps.

## Limitation

The host OS was already provisioned (Node 26, Git, npm). #32's “clean machine” acceptance still
requires the owner to confirm a fresh Windows machine/VM run or explicitly accept this clean-checkout
evidence.
