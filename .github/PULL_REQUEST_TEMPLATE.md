## What changed

Describe the behavior change and the boundary it touches (core math, provider, persistence, API, UI, operations).

## Why

Link the issue or state the user-visible problem.

## Safety checklist

- [ ] Live execution remains disabled and fail-closed.
- [ ] No geoblock bypass, VPN/proxy workaround or jurisdiction spoofing.
- [ ] No private key, seed phrase, API secret, passphrase or session key was added or logged.
- [ ] Risk limits, stale-book checks, kill switch and paper-only behavior remain intact.
- [ ] Prediction-market content is framed as informational, not investment advice.

## Verification

- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm run test:coverage`
- [ ] `npm run build`
- [ ] `npm run test:e2e` (UI/control changes)
- [ ] `npm run smoke` (provider contract changes)

Paste the relevant command output or explain why a check is not applicable.

## Risk / rollback

What can fail, how it is detected, and how to roll back.
