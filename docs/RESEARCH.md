# Research harness

`npm run research` turns a validated recording into a train/validation report with baselines and a
config fingerprint. It is the evidence step before any strategy change.

```bash
npm run data:validate -- --file data/recordings/polyhunter-2026-10-26.jsonl
npm run research -- --file data/recordings/polyhunter-2026-10-26.jsonl
```

The command refuses a recording that fails validation. Warnings are printed and do not block the
run, but they must be carried into the decision memo.

## What it does

1. Splits the recording by time, not by row: the first 70% is train, the last 30% is validation.
2. Runs the strategy independently on each split, each starting with the configured cash.
3. Runs two baselines on each split.
4. Hashes the frozen config and writes JSON and Markdown reports under `data/reports/`.

Independence matters: the validation simulation does not inherit positions, orders or PnL from the
train simulation. It answers “how would this frozen configuration have behaved on unseen time?”

## Options

| Option          | Default          | Meaning                                            |
| --------------- | ---------------- | -------------------------------------------------- |
| `--file`        | required         | JSONL recording                                    |
| `--out`         | `data/reports`   | Output directory                                   |
| `--strategy`    | `micro-maker`    | `micro-maker` or `momentum-taker`                  |
| `--cash`        | `1000`           | Starting cash per split                            |
| `--fee-bps`     | `0`              | Flat fee assumption used by the simulator          |
| `--train-ratio` | `0.7`            | Time-based train fraction; must be between 0 and 1 |
| `--edge`        | strategy default | `minEdge` override                                 |
| `--imbalance`   | strategy default | `minImbalance` override                            |
| `--max-spread`  | strategy default | `maxSpread` override                               |
| `--take-profit` | strategy default | `takeProfitEdge` override                          |
| `--stop-loss`   | strategy default | `stopLossEdge` override                            |
| `--min-depth`   | strategy default | `minDepthShares` override                          |

The risk limits, tick size, momentum horizon, cooldown, order notional and order TTL stay at their
defaults. Change them in code only through a reviewed PR so the config hash stays meaningful.

## Baselines

- **No-trade:** holds cash for the whole split. It is the “did nothing” benchmark and must end at
  the starting cash with zero fills.
- **Passive-hold:** buys once per market at the first two-sided ask, splitting cash equally across
  markets and leaving room for fees and the simulator slippage cap, then marks the position at the
  final mid. It is a directional exposure benchmark, not a market-making strategy.

Baselines use permissive risk limits so their exposure is not shaped by the strategy risk policy.
They still use the same `PaperBroker`, fee model and mark-to-market code as the strategy run.

## Config hash

The report records a SHA-256 hash of a stable JSON descriptor containing the strategy kind,
strategy config, risk limits, starting cash, fee bps, order TTL and split ratio. Two runs with the
same inputs and config produce the same hash and the same report. Changing any of those fields
changes the hash.

The JSON report contains the full descriptor and metrics, including equity curves. The Markdown
report contains the key comparison table.

## Output files

For `data/recordings/polyhunter-2026-10-26.jsonl` and hash `abcdef...`, the command writes:

```text
data/reports/research-polyhunter-2026-10-26-abcdef12.json
data/reports/research-polyhunter-2026-10-26-abcdef12.md
```

The name is deterministic; rerunning the same config overwrites the same pair. There is no
generation timestamp in the JSON, so reports can be diffed.

## Reading the report

- Compare the strategy against **both** baselines on train and validation.
- A validation result that is much worse than train is a warning about overfitting or a regime
  change, not a reason to tune on validation.
- A passive-hold baseline that beats the strategy means the strategy is not adding value over
  directional exposure for that session.
- A no-trade baseline that beats the strategy means the strategy lost money; fix the risk or the
  signal before adding features.
- Fees and fill rate matter as much as return. A high return from one lucky fill is not evidence.

Validation is held out. Do not change parameters after looking at validation metrics; record the
next hypothesis, change the config, and rerun with a new hash.
