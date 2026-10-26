# ECC operating loop for PolyHunter

This is the project-specific application of ECC's engineering loop. It is intentionally smaller
than the full ECC catalog and tuned for a real-money-adjacent prediction-market system.

```text
plan -> test -> implement -> review -> verify -> remember -> improve
```

## 1. Plan

- State the question the change answers.
- Identify the affected boundary: core math, provider adapter, persistence, API, UI, or operations.
- Write down the failure mode and the risk control that must catch it.
- For strategy changes, specify the hypothesis, the exact metric, and the acceptance threshold
  before running a backtest. Do not tune after seeing the result without recording the iteration.
- For live-adjacent work, stop and require an explicit safety review. Live execution is not
  implemented and must stay blocked.

## 2. Test

- Write the failing test first for pure logic (order book math, strategy, risk, broker, replay).
- For provider changes, add a fixture-based contract test and a fail-closed test for malformed,
  stale or missing data.
- For UI changes, add a Playwright flow if the change affects a user journey.
- For money math, add an invariant/property test (for example: no negative cash, no short position,
  VWAP inside the walked range, cash conservation).

## 3. Implement

- Prefer the smallest change at the correct boundary.
- Keep `packages/core` free of network, filesystem and UI concerns.
- Keep provider wire types inside `packages/polymarket`.
- Validate external input with Zod; never trust a field because it was present yesterday.
- Persist audit evidence for every signal, order rejection and fill.

## 4. Review

- Run a fresh-context review of the diff: correctness, financial invariants, secret handling,
  geoblock compliance, failure modes, and test quality.
- Use `security-review` for authentication, secrets, provider boundaries or dependency changes.
- Use `production-audit` before a release candidate.
- Do not accept “the test passes” as a review. Explain why the behavior is correct.

## 5. Verify

- `npm run lint`
- `npm run typecheck`
- `npm run test:coverage`
- `npm run build`
- `npm run test:e2e` when the UI or control plane changed
- `npm run smoke` when a provider contract may have changed
- CI must be green on the exact commit being merged.

## 6. Remember

- Record durable decisions in `docs/` or `AGENTS.md`, not only in chat.
- If a bug class appears twice, add a regression test and a short note in the relevant module.
- Keep the ECC skill set curated. Run `npm run ecc:sync` only after reviewing the upstream version.

## Hard stops

Stop and escalate to the owner when a change would:

- enable live order submission or any real-money transfer;
- weaken the geoblock gate or add a bypass;
- introduce or request a private key, seed phrase, API secret or session key;
- remove a risk limit, kill switch, stale-book check or test assertion without an approved reason;
- publish a profitability claim not backed by a reproducible backtest and a stated out-of-sample
  method.

Prediction-market signals are informational. This project is not investment advice.
