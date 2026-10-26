# Compliance and risk

## Current venue finding

On 2026-10-26, the official endpoint `GET https://polymarket.com/api/geoblock` returned:

```json
{
  "blocked": true,
  "country": "BR"
}
```

The exact IP and region are deliberately not committed. The finding is:

- **Polymarket reports trading as blocked for this jurisdiction.**
- Public market data (Gamma, CLOB books, market WebSocket) remains reachable and is used read-only.
- Live order submission is **not implemented** in this build, and would be refused even if it were,
  because the geoblock gate is fail-closed.

## Hard compliance boundary

This repository does **not** contain and must never contain:

- VPN, proxy, Tor, residential-proxy or account-sharing logic intended to evade a geoblock;
- jurisdiction spoofing, false country headers, or IP rotation;
- instructions for circumventing Polymarket's terms or geographic restrictions;
- private keys, seed phrases, API secrets, passphrases or session keys;
- code that submits a live order.

If the geoblock result changes for a legitimately eligible operator, live execution still requires a
separate, audited adapter and explicit owner authorization. A change in geoblock status alone is not
authorization to trade.

## Legal / regulatory caveat

Prediction markets can be classified differently across jurisdictions (gambling, derivatives,
securities, commodities, or another category). This document is an engineering control note, not
legal advice. Consult qualified counsel for the operator's jurisdiction and the venue's current
terms before any real-money use.

## Paper-only safety model

- `TRADING_MODE=paper` is the default and the only mode that can complete a session.
- `TRADING_MODE=live` requires `LIVE_TRADING_AUTHORIZED=true` **and** an eligible geoblock **and**
  an adapter that does not exist in this build; the engine therefore fails closed.
- The dashboard displays the geoblock status and the live-block reason.
- No wallet connection is requested by the UI.
- No account, portfolio or identity data is collected.

## Risk controls

| Control                 | Default    | Failure behavior                               |
| ----------------------- | ---------- | ---------------------------------------------- |
| Per-market notional     | $25        | block new buy                                  |
| Total notional          | $100       | block new buy                                  |
| Open positions          | 6          | block new position                             |
| Daily loss              | $25        | block new exposure                             |
| Max drawdown            | 8%         | block new exposure                             |
| Orders/minute           | 20         | block new order                                |
| Min depth               | 100 shares | block                                          |
| Max spread              | 3.5%       | block                                          |
| Book staleness          | 5 s        | block                                          |
| Duplicate resting order | none       | block                                          |
| Kill switch             | off        | cancels resting orders and blocks new exposure |

The defaults are intentionally small. They are not a recommendation of appropriate size for any
individual. Change them only with a written risk rationale and re-run the test suite.

## Model risk

- Microprice and imbalance are local order-book statistics, not forecasts of resolution.
- A maker quote can be adversely selected: it is most likely to fill when the market moves against
  it.
- The simulator does not model queue position, hidden liquidity, cancel latency or market impact.
- Momentum can regime-shift; a backtest on one period does not transfer to another.
- Fees, tick size, resolution rules and oracle behavior can change.
- A market can resolve ambiguously or be disputed.

## Operational risk

- A single-process local app is a single point of failure.
- SQLite is an audit log; deleting it loses the session history but not the venue state.
- The paper ledger resets on process restart. Do not treat it as an accounting system.
- The dashboard binds to loopback by default. Binding to a non-loopback host requires `API_TOKEN`
  and a TLS/reverse-proxy review.
- Logs are structured and redact common secret fields, but operators must still avoid pasting
  secrets into prompts, issues or chat.

## Incident response

1. **Stop**: press the kill switch in the dashboard or `POST /api/control {"action":"kill"}`.
2. **Contain**: stop the process; do not attempt to “trade out” of a paper position.
3. **Preserve evidence**: keep the SQLite file, JSONL recordings and logs.
4. **Assess**: determine whether the issue is data, strategy, risk, provider or UI.
5. **Fix + regression test**: add a failing test that reproduces the failure before the fix.
6. **Review**: security review for secret/geoblock/auth issues; production audit for release.
7. **Communicate**: if a real deployment were affected, follow the operator's incident process.

## Non-advice statement

Prediction-market prices are informational inputs. Nothing in this repository is investment,
financial, legal or tax advice. There is no guarantee of profit, liquidity, fill or resolution.
