# CI, audits and free GitHub apps

## What runs in this repository (no external app required)

| Workflow                          | What it proves                                                                              |
| --------------------------------- | ------------------------------------------------------------------------------------------- |
| `ci.yml` → `quality`              | npm audit gate, Biome lint/format, strict typecheck, tests, coverage gate, production build |
| `ci.yml` → `windows-quality`      | Clean `npm ci`, lint, typecheck, coverage and build on Windows 24                           |
| `ci.yml` → `e2e`                  | Playwright dashboard, keyboard, axe accessibility and mobile viewport flows                 |
| `ci.yml` → `docker`               | Builds the image and probes a running API                                                   |
| `release.yml`                     | Tag-driven artifact, CycloneDX SBOM and SHA256 checksums                                    |
| `codeql.yml` → `codeql`           | GitHub CodeQL security-extended analysis for JavaScript/TypeScript                          |
| `security.yml` → `secret-scan`    | Gitleaks full-history secret scan                                                           |
| `security.yml` → `semgrep`        | Hash-pinned Semgrep `p/ci` at ERROR severity; SARIF uploaded                                |
| `security.yml` → `osv`            | OSV-Scanner against `package-lock.json`                                                     |
| `security.yml` → `workflow-audit` | actionlint + zizmor (SARIF uploaded)                                                        |
| `security.yml` → `security-gate`  | Aggregate gate for the four security jobs above                                             |
| `scorecard.yml` → `scorecard`     | OpenSSF Scorecard, published and uploaded as SARIF                                          |
| `dependency-review.yml`           | Blocks PRs that introduce high-severity vulnerable dependencies                             |
| `pr-title.yml`                    | Conventional-commit PR titles                                                               |
| Dependabot                        | Weekly npm and GitHub Actions updates, grouped minor/patch                                  |

All third-party actions are pinned by commit SHA. Workflow permissions are least-privilege. The
Ubuntu quality job is hardened with `step-security/harden-runner`; the Windows lane relies on
least-privilege permissions and SHA pinning because harden-runner is Linux-only.

Dependency and advisory handling is documented in [`DEPENDENCY-POLICY.md`](DEPENDENCY-POLICY.md).
`npm audit` is a required part of `quality`; accepted advisories live in
`security/audit-exceptions.json` and must be time-bounded and owner-approved.

## Required checks and branch protection

The live `main-protection` ruleset (checked 2026-10-26) requires:

- `quality`
- `windows-quality`
- `e2e`
- `docker`
- `codeql`
- `security-gate`
- `dependency-review`
- `pr-title`

plus:

- pull request before merge (0 approvals, which matches the solo-review decision below);
- dismiss stale reviews on push;
- require conversation resolution;
- linear history;
- no force push, no branch deletion;
- no admin bypass: the same checks apply to the owner.

The ruleset is applied with the GitHub API after the first push. If a check name changes, update the
ruleset in the same PR; a required check that never runs will block the queue.

## Observed on this repository

Checked on 2026-10-26 against the repository's check runs and PR activity:

| App                            | Observed state             | Notes                                                                    |
| ------------------------------ | -------------------------- | ------------------------------------------------------------------------ |
| **Socket Security**            | Active                     | `Socket Security: Project Report` and `Pull Request Alerts` run and pass |
| **SonarCloud**                 | Active                     | `SonarCloud Code Analysis` runs and the quality gate passes              |
| **GitHub Copilot PR reviewer** | Installed, quota exhausted | It attempted a review but reported insufficient quota; do not rely on it |
| **Dependabot**                 | Active                     | Version and security updates, cooldown enabled                           |
| **CodeQL / Scorecard**         | Active                     | Native GitHub security workflows                                         |
| **ECC Tools**                  | Active                     | Installed 2026-10-26; analysis completed and generated bundle reviewed   |
| **CodeRabbit / Greptile**      | Not observed               | Optional second-opinion reviewers; not required for v0.1.x               |

The repository cannot enumerate or install GitHub Apps with a normal user token. Installation is a
consent action owned by the GitHub account holder.

## GitHub Apps worth installing (free tiers)

The repository owner must click **Install** in a GitHub session. A user token cannot enumerate or
install GitHub Apps; this repository intentionally does not attempt to bypass that consent boundary.

| App                 | Why it adds value                                                              | Free tier                              | Install                                  |
| ------------------- | ------------------------------------------------------------------------------ | -------------------------------------- | ---------------------------------------- |
| **ECC Tools**       | AI review, engineering harness checks, repo-level agent guidance               | Free for public repos; Pro for private | https://github.com/apps/ecc-tools        |
| **CodeRabbit**      | Line-level AI review and PR summaries; useful second reviewer                  | Free for public repos                  | https://github.com/apps/coderabbitai     |
| **SonarCloud**      | Static analysis, duplication, coverage, quality gate                           | Free for public repos                  | https://github.com/apps/sonarcloud       |
| **Socket Security** | Supply-chain and malware review of dependency changes                          | Free for open source                   | https://github.com/apps/socket-security  |
| **StepSecurity**    | Actions hardening, egress policy suggestions, token permissions                | Free tier                              | https://github.com/apps/stepsecurity-app |
| **Snyk**            | Dependency/container scanning (overlaps OSV/Dependabot)                        | Free tier                              | https://github.com/apps/snyk-io          |
| **Greptile**        | Codebase-aware review (optional; overlaps ECC/CodeRabbit)                      | Trial/free tier varies                 | https://github.com/apps/greptile-app     |
| **Codecov**         | Coverage comments and trend (optional; repo already uploads coverage artifact) | Free for public                        | https://github.com/apps/codecov          |

### Recommended minimal stack

1. **Built-in**: CodeQL + Dependabot + secret scanning push protection + dependency review +
   Scorecard. Already configured.
2. **ECC Tools** — matches the ECC workflow the owner asked for.
3. **SonarCloud** — adds a second static-analysis signal and coverage gate.
4. **Socket Security** — adds supply-chain malware/typosquat review beyond CVEs.
5. **StepSecurity** — hardens Actions and suggests egress policy.

Do **not** install every AI reviewer at once. ECC Tools, CodeRabbit and Greptile overlap; pick one
primary reviewer and one optional second opinion, or the PR becomes noisy.

## Enabling the apps

1. Open the install link while logged in as the repository owner.
2. Select **Only select repositories** → `polumarket-hunter`.
3. Grant the minimum permissions the app requests; do not grant organization-wide access unless
   the app requires it.
4. Open a pull request and confirm the app's check appears.
5. If an app adds a required check, add it to the ruleset only after it has run successfully once.

## Selected primary reviewer: ECC Tools

The owner chose **ECC Tools** as the primary AI reviewer (#35). It is free for public repositories.
Status: **installed and verified on 2026-10-26**.

1. The app was installed for `polumarket-hunter` only.
2. `/ecc-tools analyze` completed against 34 commits with 85% confidence.
3. The generated bundle PR #77 was reviewed and intentionally not merged: the repository already
   has a curated `.ecc/` set and OpenCode config, and merging the generated `.claude`/`.codex` bundle
   would duplicate that contract.
4. ECC Tools remains the primary AI reviewer for future PRs.

Do not install CodeRabbit or Greptile as a second AI reviewer unless the owner explicitly asks;
SonarCloud and Socket already provide the second static-analysis and supply-chain signals.

## Code review decision: solo owner

Decision date: **2026-10-26**.
Owner: **KayzenRoot**.

Decision: **no second human reviewer for v0.1.x; accept the solo-review risk with compensating
controls.** No collaborator is added just to satisfy a badge, and the ruleset does not require an
approval that a solo owner cannot provide.

Compensating controls:

- every change goes through a pull request with the required checks above;
- no admin bypass, no force push and no branch deletion on `main`;
- CodeQL, Semgrep, Gitleaks, OSV, Dependency Review, npm audit, Socket, SonarCloud and ECC Tools;
- property-based tests for money and risk invariants, plus Playwright E2E;
- small PRs with an evidence comment, and release evidence for every tag;
- live execution remains unimplemented, so a review miss cannot submit a real order.

Residual risk: a logic, financial-invariant or threat-model error can pass static analysis and the
owner's review. This is accepted for a local paper-only terminal. A second human reviewer and an
independent security audit are required before any live-trading work (#42–#46).

Scorecard will continue to report `CodeReview` low and `BranchProtection` below maximum because the
repository is solo and does not require approvals. That is the documented, intentional explanation,
not an unaddressed vulnerability. Revisit this decision when a second maintainer joins or before
v0.2.0 live readiness.

## Enabling secret scanning and Dependabot alerts

The repository settings are configured through the GitHub API:

```bash
gh api -X PATCH repos/KayzenRoot/polumarket-hunter \
  -f 'security_and_analysis[secret_scanning][status]=enabled' \
  -f 'security_and_analysis[secret_scanning_push_protection][status]=enabled' \
  -f 'security_and_analysis[secret_scanning_validity_checks][status]=enabled'

gh api -X PUT repos/KayzenRoot/polumarket-hunter/vulnerability-alerts
gh api -X PUT repos/KayzenRoot/polumarket-hunter/automated-security-fixes
gh api -X PUT repos/KayzenRoot/polumarket-hunter/private-vulnerability-reporting
```

## Verifying the GitHub Apps actually ran

After the first push/PR:

```bash
# Checks on the latest commit
gh api repos/KayzenRoot/polumarket-hunter/commits/main/check-runs \
  --jq '.check_runs[].name'

# Workflow runs
gh run list --repo KayzenRoot/polumarket-hunter --limit 20

# Security alerts (requires appropriate permissions)
gh api repos/KayzenRoot/polumarket-hunter/code-scanning/alerts --jq 'length'
gh api repos/KayzenRoot/polumarket-hunter/dependabot/alerts --jq 'length'
```

If an app is installed but not configured for this repository, its check will not appear. That is
a configuration issue, not a code failure.

## Cost boundary

Everything listed as “free for public repos” is free because this repository is public. Private
repositories will hit paid tiers for some apps, and some GitHub Advanced Security features require
a paid plan. The local CI (`npm run ci`) and all open-source scanners remain available regardless.
