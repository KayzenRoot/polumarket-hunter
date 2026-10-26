# Strategy

This document describes the implemented logic, not a claim of profitability. A prediction-market
position can lose its entire stake. Backtests are simulations, not evidence of future returns.

## Shared book math

For a two-sided book:

```text
mid        = (bestBid + bestAsk) / 2
microprice = (bestAsk × bidSize + bestBid × askSize) / (bidSize + askSize)
imbalance  = (bidSize − askSize) / (bidSize + askSize)      ∈ [−1, 1]
spread     = bestAsk − bestBid
depth      = sum of the top N level sizes on the relevant side
```

The microprice weights the side with less size more heavily. It is a **local microstructure
estimate**, not a forecast of the outcome probability.

A book is rejected when:

- it has fewer than two sides;
- `bestBid >= bestAsk` (crossed);
- the timestamp is missing or older than `maxBookAgeMs`;
- the price is outside `(0, 1)`.

## Micro Maker (default)

The strategy is a long-only, inventory-carrying maker.

### Entry

Given a usable book:

```text
edgeAtBid = microprice − bestBid
```

A bid is quoted only when all of the following hold:

- `spread <= maxSpread`;
- ask-side depth (top 3 levels) `>= minDepthShares`;
- `imbalance >= minImbalance`;
- `edgeAtBid >= minEdge`;
- the per-token cooldown has elapsed;
- no resting order already exists on that side.

The quote price is `bestBid`, improved by one tick only if the improved price still clears
`minEdge` (`microprice − improvedBid >= minEdge`). The size is:

```text
size = floor(orderNotional / price, 2 decimals)
```

and must be at least 1 share.

### Fill model

A resting bid fills only when the **ask crosses down to or through** the limit. The fill is walked
against the visible asks with the limit as a cap, so partial fills and VWAP are modeled. This is
deliberately conservative: a visible quote does not imply a fill, and passive fills tend to occur
when the market moves against the quote (adverse selection).

### Exit

With an open position, the strategy evaluates the bid:

```text
pnlPerShare = bestBid − averageEntry
```

- `pnlPerShare >= takeProfitEdge` → take-profit sell at the bid (taker).
- `pnlPerShare <= −stopLossEdge` → stop-loss sell at the bid (taker).
- `microprice <= averageEntry − minEdge` → edge-decay sell at the bid.
- Otherwise hold.

The model is long-only. It cannot short a token; a sell is capped by the held shares.

## Momentum Taker (optional)

This is a short-horizon directional mode.

```text
fast     = EWMA(mid, alpha=0.35)
slow     = EWMA(mid, alpha=0.08)
momentum = fast − slow
forecast = mid + momentum × momentumHorizon
```

Entry:

- `forecast − bestAsk >= minEdge`;
- positive order-book imbalance above `minImbalance`;
- spread and depth pass the same gates as Micro Maker;
- cooldown elapsed and no duplicate order.

Exit uses the same take-profit/stop-loss/edge logic, plus a momentum-reversal sell when
`forecast < bestBid − minEdge`.

This mode is more sensitive to the choice of horizon and to regime changes. Treat it as a research
mode, not a default money-maker.

## Risk engine

Each actionable intent is evaluated independently. All checks must pass:

| Check                                                    | Failure behavior |
| -------------------------------------------------------- | ---------------- |
| kill switch                                              | block            |
| action != HOLD                                           | block            |
| positive size, price in `(0,1)`                          | block            |
| book usable (fresh, two-sided, not crossed)              | block            |
| spread `<= maxSpread`                                    | block            |
| top-3 depth `>= minDepthShares`                          | block            |
| daily PnL `> −maxDailyLoss`                              | block            |
| drawdown `< maxDrawdownPct`                              | block            |
| orders in the last minute `< maxOrdersPerMinute`         | block            |
| no duplicate open order on the side                      | block            |
| buy: market notional `<= maxNotionalPerMarket`           | block            |
| buy: total exposure `<= maxTotalNotional`                | block            |
| buy: open positions `< maxOpenPositions` (unless adding) | block            |
| buy: available cash `>= notional`                        | block            |
| sell: held shares `>= size`                              | block            |

The engine records the rejection reasons in the signal ledger and shows them in the dashboard.

## Fees

Polymarket CLOB fees vary by market and can be zero. The simulator exposes `FEE_BPS` and applies it
to notional. Backtests should use the fee schedule that matches the intended venue/market; the
default of 0 is an assumption, not a universal fact.

## Backtesting

Run:

```bash
npm run record -- --minutes 10 --markets 8
npm run backtest -- --file data/recordings/polyhunter-YYYY-MM-DD.jsonl
npm run demo
```

The backtest replays recorded books through the **same** strategy, risk controller and paper broker
used by the live paper engine. Metrics include ending equity, total return, realized/unrealized PnL,
fees, win rate, profit factor, max drawdown, max exposure, fill rate and the equity curve.

### What the backtest does not model

- Queue position or maker fill probability beyond “the opposite side crossed”.
- Hidden liquidity, iceberg orders, cancel latency or exchange-side rejection.
- Network jitter, clock skew, partial provider snapshots or out-of-order messages.
- Market impact from a real order.
- Resolution disputes, oracle behavior or regulatory intervention.
- Changes in fee schedules, tick size or market rules.
- Selection bias from recording only currently liquid markets.

### Honest evaluation protocol

1. Freeze the strategy configuration before looking at results.
2. Record a period you did not use for tuning.
3. Report the full metric set, including drawdown and fill rate, not only total return.
4. Compare against a no-trade baseline and a simple passive baseline.
5. If the maker mode shows zero fills, do not “fix” it by assuming fills that the book did not
   produce. Change the hypothesis or the market selection, then re-record.

## Tuning knobs

| Variable                              | Effect                                                    |
| ------------------------------------- | --------------------------------------------------------- |
| `MIN_EDGE`                            | Higher = fewer, higher-conviction quotes                  |
| `MIN_IMBALANCE`                       | Higher = stronger one-sided pressure required             |
| `MAX_SPREAD`                          | Higher = more markets, worse entry/exit economics         |
| `MIN_DEPTH_SHARES`                    | Higher = less slippage, fewer signals                     |
| `ORDER_NOTIONAL`                      | Size per quote; also constrained by risk limits           |
| `TAKE_PROFIT_EDGE` / `STOP_LOSS_EDGE` | Exit thresholds; must be wider than realistic spread/fees |
| `COOLDOWN_MS`                         | Prevents rapid re-quoting after a decision                |
| `ORDER_TTL_MS`                        | Cancels stale resting orders                              |
| `MOMENTUM_HORIZON`                    | Taker forecast aggressiveness                             |

There is no universal “best” set. Any tuning must be evaluated out of sample and with the full risk
stack enabled.

## Why the default is paper-only

The official geoblock endpoint reports `blocked: true` for Brazil. The project does not implement a
bypass. Even in an eligible jurisdiction, live execution would require:

- an audited signing/authorization adapter;
- a venue API credential model with least privilege;
- a geoblock re-check immediately before each order;
- idempotency, reconciliation and cancel-on-disconnect;
- an explicit owner authorization and a separate release gate.

None of those are claimed to be complete here.
