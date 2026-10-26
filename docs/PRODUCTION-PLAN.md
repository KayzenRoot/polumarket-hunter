# Production plan — v0.1.0 paper-first

Status: **DRAFT — awaiting owner approval of the production contract**
Plan date: 2026-10-26
Baseline commit: `99334fa`
Milestone: [v0.1.0 - Production (paper-first)](https://github.com/KayzenRoot/polumarket-hunter/milestone/1)

## 1. Definition of done

v0.1.0 is “in production” when a clean Windows machine can install it, run a paper session, record
and validate data, produce a research report, survive a provider failure, export a session, back up
and restore data, and install a release artifact — with no live order path and no geoblock bypass.

It is **not** a promise of profit. It is a production-quality research terminal.

## 2. Current baseline

| Item              | State                                                                       |
| ----------------- | --------------------------------------------------------------------------- |
| Repository        | Public, `main` protected by ruleset                                         |
| Bootstrap release | `v0.1.0` preview tag (see release naming decision below)                    |
| Tests             | 165 passing                                                                 |
| Coverage          | 87.01% statements / 76.25% branches / 90.82% functions / 86.86% lines       |
| CI                | Quality + E2E green                                                         |
| Security          | CodeQL, Semgrep, Gitleaks, OSV, dependency review, actionlint, zizmor green |
| Scorecard         | 7.0/10                                                                      |
| Geoblock          | `BLOCKED` for BR; live remains disabled                                     |
| Backlog           | 25 open in v0.1.0, 6 in v0.1.x, 6 blocked in v0.2.0                         |

## 3. Workstreams

### A. Contract and scope

- [#15](https://github.com/KayzenRoot/polumarket-hunter/issues/15) production contract
- [#10](https://github.com/KayzenRoot/polumarket-hunter/issues/10) production epic

### B. Correctness

- [#16](https://github.com/KayzenRoot/polumarket-hunter/issues/16) per-market tick size
- [#17](https://github.com/KayzenRoot/polumarket-hunter/issues/17) persisted paper sessions
- [#19](https://github.com/KayzenRoot/polumarket-hunter/issues/19) provider fault injection

### C. Evidence

- [#27](https://github.com/KayzenRoot/polumarket-hunter/issues/27) recording validator
- [#28](https://github.com/KayzenRoot/polumarket-hunter/issues/28) research harness
- [#30](https://github.com/KayzenRoot/polumarket-hunter/issues/30) fee schedule
- [#29](https://github.com/KayzenRoot/polumarket-hunter/issues/29) three sessions + decision memo

### D. Operator safety and observability

- [#18](https://github.com/KayzenRoot/polumarket-hunter/issues/18) auto-kill and alerts
- [#23](https://github.com/KayzenRoot/polumarket-hunter/issues/23) feed-health metrics
- [#22](https://github.com/KayzenRoot/polumarket-hunter/issues/22) pause/cancel-all/flatten
- [#20](https://github.com/KayzenRoot/polumarket-hunter/issues/20) session report/export
- [#21](https://github.com/KayzenRoot/polumarket-hunter/issues/21) UI error boundary
- [#24](https://github.com/KayzenRoot/polumarket-hunter/issues/24) retention/backup/restore
- [#25](https://github.com/KayzenRoot/polumarket-hunter/issues/25) doctor diagnostics
- [#26](https://github.com/KayzenRoot/polumarket-hunter/issues/26) auth and control audit

### E. Distribution

- [#33](https://github.com/KayzenRoot/polumarket-hunter/issues/33) Windows CI
- [#31](https://github.com/KayzenRoot/polumarket-hunter/issues/31) Docker/compose
- [#34](https://github.com/KayzenRoot/polumarket-hunter/issues/34) release + SBOM
- [#32](https://github.com/KayzenRoot/polumarket-hunter/issues/32) clean Windows runbook
- [#35](https://github.com/KayzenRoot/polumarket-hunter/issues/35) primary AI reviewer

## 4. Execution waves

Each wave ends with `npm run ci` green and a short evidence comment on the epic.

### Wave 0 — contract (1 PR)

1. #15 production contract + this plan.
2. Owner approval in #15.
3. No code changes until the contract is accepted.

### Wave 1 — correctness (3 PRs, sequential)

1. #16 tick size: smallest, touches core/strategy/orderbook.
2. #17 sessions: schema migration + API/UI filtering.
3. #19 provider fault tests: locks the fail-closed behavior.

Do not parallelize #16 and #17 unless the branches are isolated; both touch engine decision paths.

### Wave 2 — evidence (4 PRs)

1. #27 validator (can run in parallel with #28).
2. #28 research harness (can run in parallel with #27).
3. #30 fee assumptions (can run in parallel).
4. #29 record three sessions + decision memo (after #27, #28, #30).

#29 is the **go/no-go gate**. If the evidence is negative, the honest outcome is to keep v0.1.0 as a
research terminal and not tune the strategy into a narrative.

### Wave 3 — operational hardening

Split into small PRs:

- **3A runtime safety:** #18 auto-kill, #23 feed health, #22 operator controls.
- **3B usability:** #20 session report, #21 UI states.
- **3C operations:** #24 retention, #25 doctor, #26 auth/audit.

### Wave 4 — distribution and release

1. #33 Windows CI early (protects every later PR).
2. #31 Docker/compose.
3. #34 release + SBOM/checksums.
4. #35 primary AI reviewer (owner install).
5. #32 clean Windows runbook last; it validates the release candidate.

### Post-v0.1 — hardening

#36 OpenAPI, #37 accessibility/mobile, #38 Semgrep hashes, #39 Scorecard policy, #40 process
supervisor, #41 npm audit gate. These do not block the paper-first production gate.

### Blocked — live

#42–#46 are not part of v0.1.0. They are blocked by legal/geographic eligibility and a separate
owner authorization. Do not start them because the dashboard looks ready.

## 5. Release naming decision

The current `v0.1.0` tag/release is a **bootstrap preview**, created before the production gate.
It must not be presented as the production release.

At the release gate, choose one:

- **Option A (preferred):** with owner approval, delete the preview tag/release and recreate
  `v0.1.0` on the production commit. This requires a temporary, explicit tag-ruleset exception.
- **Option B:** keep the preview and ship production as `v0.1.1`.

This decision must be recorded before #34 closes. Do not silently move a protected tag.

## 6. Gates

| Gate           | Required evidence                                      | Issues             |
| -------------- | ------------------------------------------------------ | ------------------ |
| G0 Contract    | Contract approved by owner                             | #15                |
| G1 Correctness | Tick/session/fault tests green; CI green               | #16, #17, #19      |
| G2 Evidence    | 3 validated sessions, baselines, decision memo         | #27, #28, #29, #30 |
| G3 Operations  | Doctor, retention/backup, report, control audit        | #18, #20–#26       |
| G4 Release     | Windows CI, Docker, SBOM/checksums, clean runbook      | #31–#35            |
| G5 Sign-off    | Owner approval; release naming decision; no open P0/P1 | all P0/P1          |

A gate is not “mostly done”. It is open until every required issue is closed with evidence.

## 7. PR protocol

- One issue per PR; `Closes #N` in the body.
- Branch name: `feat/issue-16-tick-size`, `fix/issue-19-fault-tests`, `docs/issue-15-contract`.
- Keep PRs focused; split schema, API and UI when they can merge independently.
- Required checks: `quality`, `e2e`, `codeql`, `security-gate`, `dependency-review`, `pr-title`.
- Squash merge only. No direct pushes and no admin bypass.
- Evidence comment on the PR: commands run, outputs, risk notes and rollback.
- DB changes require a migration test and a backup/restore note.
- Financial math changes require a property/invariant test.
- Provider changes require `npm run smoke`.
- UI/control changes require `npm run test:e2e`.

## 8. Indicative timeline

| Week            | Focus                                                                 |
| --------------- | --------------------------------------------------------------------- |
| Oct 26 – Nov 1  | #15 contract; #16 tick size; #17 sessions                             |
| Nov 2 – Nov 8   | #19 fault tests; #27 validator; #28 harness; #30 fees                 |
| Nov 9 – Nov 15  | #29 recordings + decision memo; #18 auto-kill; #23 feed health        |
| Nov 16 – Nov 22 | #22 controls; #20 report; #21 UI; #24 retention; #25 doctor; #26 auth |
| Nov 23 – Nov 29 | #33 Windows CI; #31 Docker; #34 release; #35 reviewer; #32 runbook    |
| Nov 30          | G5 review, release naming decision, production sign-off               |

This is a sequence, not a promise. Recording sessions depend on provider availability and owner time.
Do not compress the evidence gate to hit a date.

## 9. Risk register

| Risk                               | Mitigation                                                                |
| ---------------------------------- | ------------------------------------------------------------------------- |
| Data too short or unrepresentative | Record 3 sessions at different times; validate; do not tune on validation |
| Overfitting                        | Frozen config hash; time split; baselines; negative result accepted       |
| Windows path/SQLite differences    | #33 Windows CI; #32 clean runbook                                         |
| Provider API changes               | Zod boundary; fixture tests; `npm run smoke`; #19                         |
| SQLite migration loses data        | Backup; repeatable migration test; restore drill                          |
| Flaky E2E                          | Deterministic demo mode; cache; retries only in CI                        |
| Solo review blind spots            | Independent reviewer app (#35) or documented accepted risk (#39)          |
| Scope creep                        | Milestone gate; P2 goes to v0.1.x                                         |
| Live temptation                    | Geoblock blocked; live epic hard-blocked; no signing code                 |
| Release tag confusion              | Explicit release naming decision in section 5                             |

## 10. Status dashboard

As of 2026-10-26:

- v0.1.0 production: **25 open**, 0 closed.
- v0.1.x hardening: **6 open**.
- v0.2.0 live readiness: **6 open, blocked**.
- Current gate: **G0 — contract approval**.

## 11. Next action

1. Review and approve [PRODUCTION-CONTRACT.md](PRODUCTION-CONTRACT.md) in issue #15.
2. Create the #15 PR (this document + contract + README link).
3. Start #16 on a branch from `main`.
4. Do not start #17 until #16 is merged, unless the owner explicitly accepts the conflict risk.

The first production PR should be small and boring. That is the point.
