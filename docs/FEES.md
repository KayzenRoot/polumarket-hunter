# Fee fields and assumptions

Last researched: 2026-10-26.

Polymarket fees are set per market and applied at match time. The app reads the public Gamma market
object and applies the venue curve in paper execution; backtests use an explicit session-level
assumption because recordings do not carry market metadata.

## Public fields

Gamma market object (observed live):

```json
{
  "feesEnabled": true,
  "feeType": "sports_fees_v2",
  "feeSchedule": {
    "rate": 0.03,
    "exponent": 1,
    "takerOnly": true,
    "rebateRate": 0.25
  },
  "makerBaseFee": 1000,
  "takerBaseFee": 1000
}
```

Observed variants:

| Market sample                   | `feesEnabled` | `feeType`        | `feeSchedule`                         |
| ------------------------------- | ------------- | ---------------- | ------------------------------------- |
| Ballon d'Or / Champions League  | `true`        | `sports_fees_v2` | rate `0.03`, exponent `1`, taker-only |
| NFL, CS2, Dota 2                | `true`        | `sports_fees_v3` | rate `0.05`, exponent `1`, taker-only |
| Fed / politics zero-fee markets | `true`        | `zero_fees`      | rate `0`, taker-only                  |
| Geopolitics / fee-free markets  | `false`       | `null`           | absent                                |

`makerBaseFee`/`takerBaseFee` are `1000` even on fee-bearing markets and do not distinguish
categories. The CLOB `/fee-rate?token_id=...` endpoint likewise returned `{"base_fee":1000}` for
the sampled fee-bearing markets and `{"base_fee":0}` for fee-free markets. Neither is used as the
source of truth. The Gamma `feeSchedule` is.

## Formula

Polymarket documents:

```text
fee = C × feeRate × p × (1 - p)
```

The app implements the documented exponent form:

```text
fee = shares × rate × (price × (1 - price))^exponent
```

With `exponent = 1` and `rate = 0.07` (crypto), 100 shares at 0.50 pay `100 × 0.07 × 0.25 = 1.75`
USDC, matching the published crypto table. Makers pay zero when `takerOnly` is true. The app rounds
fees to its 2-decimal money precision; the venue rounds to 5 decimals, so sub-cent differences are
possible.

## Fallback rules

| Market data                                     | App behavior                                 |
| ----------------------------------------------- | -------------------------------------------- |
| `feesEnabled: false`                            | zero-fee schedule                            |
| valid `feeSchedule`                             | venue curve, maker/taker applied as declared |
| `feesEnabled: true` but schedule missing/broken | `FEE_BPS` fallback; UI shows “fee unknown”   |
| fields absent                                   | `FEE_BPS` fallback; UI shows “fee unknown”   |

`FEE_BPS` defaults to `0`, so an unknown market is fee-free unless the operator sets a fallback.
The flat fallback applies to both maker and taker fills; it does not infer taker-only behavior. The
UI and reports print the fallback so a research run cannot silently claim venue fees.

## Where it is used

- **Paper execution:** `PaperBroker` receives a per-market schedule resolver from the engine. It
  marks marketable orders and immediate limits as taker, resting limit fills as maker, and applies
  the schedule per market.
- **Backtests:** `--fee-rate`, `--fee-exponent`, `--fee-both-sides` define a session-level curve;
  without them, `--fee-bps` is the flat fallback.
- **Research:** the same flags, included in the config hash and printed in the Markdown report.
- **Dashboard:** the order-book panel shows `fee-free`, the live taker rate, or the fallback.

## Not modeled

- Maker rebate payouts (`rebateRate`) and taker rebate tiers.
- Per-market fee schedule changes during a session; the schedule captured at market load is used.
- Combo markets and their separate fee rate.
- Exchange rounding at 5 decimal places; the ledger uses 2-decimal money.
- Fee treatment of resolution/settlement; settlements are recorded fee-free.

These are documented limitations, not silent assumptions. If a fee field changes, update this file
with the date and the observed payload before changing the model.
