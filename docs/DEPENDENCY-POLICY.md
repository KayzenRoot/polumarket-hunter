# Dependency and advisory policy

Status: **active**.
Applies to npm packages, Python tooling, Docker base images and GitHub Actions.

## Gates and sources of truth

| Gate                 | Scope                          | Behaviour                                        |
| -------------------- | ------------------------------ | ------------------------------------------------ |
| `npm audit gate`     | `package-lock.json`            | Fails on high/critical npm advisories            |
| OSV-Scanner          | `package-lock.json`            | Fails on known vulnerabilities; CI security gate |
| Dependency Review    | Pull-request dependency diffs  | Blocks new high-severity vulnerable dependencies |
| Dependabot           | npm and GitHub Actions updates | Opens grouped update PRs; cooldown enabled       |
| Socket Security      | Dependency diffs               | Malware/typosquat review; advisory signal        |
| Semgrep requirements | Python scanner install         | Hash-pinned with `pip install --require-hashes`  |
| Docker base images   | `Dockerfile`                   | Pinned by digest; updated deliberately           |
| GitHub Actions       | Workflow actions               | Pinned by full commit SHA                        |

OSV and Dependabot are the authoritative CVE/update sources. `npm audit` is the fast lockfile gate
that runs in the required `quality` job. Dependency Review blocks a vulnerable dependency before it
reaches `main`. Socket adds malware/typosquat coverage. The gates overlap on purpose; do not disable
one because another reported the same advisory.

## npm audit gate

The required check is:

```bash
npm run audit:gate
```

It runs `npm audit --json`, ignores low/moderate findings, and fails on high/critical findings. The
gate fails closed if npm does not return a parseable report.

## Accepted-advisory exceptions

Exceptions are recorded in [`security/audit-exceptions.json`](../security/audit-exceptions.json).
An exception must contain:

| Field                 | Required | Meaning                                                        |
| --------------------- | -------- | -------------------------------------------------------------- |
| `id`                  | one of   | Advisory URL or source id (for example a GHSA URL)             |
| `package`             | one of   | Package name; use only when the advisory has no stable URL     |
| `reason`              | yes      | Why the finding is not exploitable or cannot be fixed now      |
| `owner`               | yes      | GitHub login that approved the exception                       |
| `expires`             | yes      | ISO date; the exception is invalid after 23:59:59 UTC that day |
| `compensatingControl` | no       | What reduces the risk while the exception is active            |

Rules:

1. Open an issue with the advisory link, impact, affected path and proposed expiry.
2. The repository owner approves the exception in writing on that issue.
3. Add the narrowest possible entry. Do not use a blanket package wildcard.
4. The maximum initial expiry is 30 days. Renewal requires a new owner approval and a new issue.
5. CI fails if the entry is expired, missing an owner/reason, or does not match a finding.
6. Remove the entry as soon as a patched version is adopted. Do not carry stale exceptions.

`npm audit fix` or a lockfile-only patch is preferred over an exception. A major upgrade that needs
code changes becomes a normal issue, not a permanent exception.

## Update procedure

```bash
npm audit
npm run audit:gate
npm update --save
npm run verify
```

Review the lockfile diff and the Socket/Dependency Review result before merging. Do not use
`npm audit fix --force` without a code review; it can install incompatible major versions.

## Python and Docker dependencies

Semgrep is installed from `requirements/security.txt` with `pip install --require-hashes`. Update
`requirements/security.in`, then regenerate on Python 3.12:

```bash
uv pip compile --python 3.12 --generate-hashes \
  requirements/security.in -o requirements/security.txt
python -m pip install --require-hashes -r requirements/security.txt
```

`pip-compile --generate-hashes` is an acceptable equivalent. Do not install Semgrep with an
unhashed `pip install semgrep==...` in CI.

Docker base images are pinned by digest in the `Dockerfile`; update the digest deliberately and
rebuild the image. The Docker CI job is the verification.

### Accepted Python scanner advisories

Date: **2026-10-26**. Owner: **KayzenRoot**. Review by: **2026-12-31**.

| Advisory              | Package             | Constraint  | Why accepted                                                                |
| --------------------- | ------------------- | ----------- | --------------------------------------------------------------------------- |
| `GHSA-84m7-p3x7-pcfv` | `mcp`               | `< 1.30.0`  | Semgrep 1.182.1 hard-pins `mcp==1.29.0`; no newer Semgrep release exists    |
| `GHSA-xcq7-p3pf-p88h` | `opentelemetry-api` | `<= 1.45.0` | Semgrep 1.182.1 pins `opentelemetry-api~=1.37.0`; latest Semgrep is 1.182.1 |

Both packages exist only in the CI scanner virtual environment created from
`requirements/security.txt`. They are not part of the application artifact, the Docker image or the
user runtime. The Semgrep job is a one-shot CLI scan with `SEMGREP_SEND_METRICS=off`; it does not
start an MCP HTTP server and does not receive repository secrets beyond the workflow token.

Mitigations: ephemeral GitHub-hosted runner, least-privilege workflow permissions, hash-pinned
installation, no scanner server exposed, and no provider credentials on the runner. Dependabot
alerts for these two advisories are dismissed as **tolerable risk** with a link to this section.
Revisit when Semgrep publishes a release that permits the patched versions, or by 2026-12-31.

## GitHub Actions

Every third-party action uses a full commit SHA with the release tag in a comment. Dependabot
updates those SHAs. Do not replace a SHA pin with a mutable tag.

## Review

Revisit this policy before a live-trading release or when a second maintainer joins. The current
solo-owner review decision is recorded in [`docs/CI-AND-APPS.md`](CI-AND-APPS.md).
