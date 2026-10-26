# Recording data quality

Backtests are only as honest as their input. `data:validate` checks a JSONL recording before it is
replayed and refuses to certify a file that contains data the paper engine would never trade.

```bash
npm run data:validate -- --file data/recordings/polyhunter-2026-10-26.jsonl
npm run data:validate -- --file data/recordings/polyhunter-2026-10-26.jsonl --json
npm run data:validate -- --file data/recordings/polyhunter-2026-10-26.jsonl --out data/reports/validation.json
```

Exit code `0` means the recording passed. Exit code `1` means at least one hard error; the report
lists every reason, capped at 50 findings with an omission count.

## Default thresholds

| Check                   | Default                             | Result  |
| ----------------------- | ----------------------------------- | ------- |
| Session duration        | at least `60_000` ms                | error   |
| Gap between token books | above `120_000` ms                  | error   |
| Gap between token books | above `10_000` ms                   | warning |
| Price level             | outside the open interval (0, 1)    | error   |
| Size                    | zero or negative                    | error   |
| Crossed book ratio      | above `1%` of books                 | error   |
| Crossed/locked book     | individual snapshot                 | warning |
| Timestamp               | moved backwards more than `1000` ms | error   |
| Timestamp               | moved backwards within `1000` ms    | warning |
| Timestamp               | invalid or missing                  | error   |
| Duplicate hash          | consecutive identical hash          | warning |
| Global ordering         | out of order across tokens          | warning |
| One-sided/empty book    | no two-sided quote                  | warning |
| Missing expected token  | `--expected-token` not recorded     | error   |
| Malformed line          | invalid JSON or invalid book        | error   |

The crossed ratio and backwards tolerance were calibrated against a live 10-minute recording
(31,030 books): 84 crossed/locked snapshots (0.27%) and 657 small timestamp regressions (max 29ms)
are normal transient feed behavior; the strategy holds on both. A sustained crossed ratio or a large
clock jump still fails. Override with `--max-crossed-pct`, `--max-backwards-ms`, `--max-gap-ms` or
`--gap-warn-ms`. Do not relax a threshold merely to make a session pass; record why in the memo.

Normalization drops invalid price or size levels before a book reaches the strategy. The decoder
reports those dropped levels and the validator treats them as hard errors, so a corrupt level cannot
silently disappear from a backtest.

Gaps are measured per token, not globally, because a recording may interleave several tokens.
`--max-gap-ms`, `--gap-warn-ms` and `--min-duration-ms` override the defaults. A relaxed threshold is
a research assumption and must be stated in the decision memo.

## Coverage and expected tokens

The recorder does not write a header, so the validator cannot infer which markets were supposed to
be captured. Pass the tokens that must be present:

```bash
npm run data:validate -- \
  --file data/recordings/polyhunter-2026-10-26.jsonl \
  --expected-token 1234567890 \
  --expected-token 0987654321
```

The report always includes per-token coverage: book count, first/last timestamp, maximum gap, gap
findings and duplicate hashes. A clean report looks like:

```text
Recording validation: PASS
Books: 1482 across 6 token(s) and 3 market(s)
Window: 2026-10-26T13:00:00.000Z -> 2026-10-26T13:10:00.000Z (10m 00s)
Crossed books: 0; duplicate hashes: 0; out-of-order: 0
Coverage:
  1234567890 [market-1/YES]: 247 book(s), max gap 2s, 0 gap finding(s)
Errors: none
Warnings: none
```

## Backtest gate

`npm run backtest` runs the same validation before replay. A recording with errors is rejected; a
recording with warnings is replayed and the warnings are printed so they can be carried into the
research report. The research harness (#28) will record the validation report alongside its output.

Do not bypass the validator by feeding the backtest a hand-edited file. If a recording is incomplete,
record another session; do not patch the data.
