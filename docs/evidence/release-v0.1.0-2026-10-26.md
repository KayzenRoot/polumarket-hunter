# v0.1.0 release evidence — 2026-10-26

Status: **published and verified**.
Tag: `v0.1.0` (annotated, unsigned; tag object `5fad0b0f1c8276dd5fb011c853cf4ac6819955dd`).
Commit: `9170a07fa84749087c9da51948d1d41c3e1345cb`.
Release: <https://github.com/KayzenRoot/polumarket-hunter/releases/tag/v0.1.0>.
Workflow: [Release run 40385978453](https://github.com/KayzenRoot/polumarket-hunter/actions/runs/40385978453),
event `push`, conclusion `success`.
Owner decision: `docs/research/v0.1-evidence.md` — NO-GO for promoting micro-maker as edge/live; GO
for v0.1.0 as a paper-only research terminal.

## Tag replacement (one-time bootstrap)

The previous `v0.1.0` was a pre-release with no assets, pointing at the lightweight tag
`99334faf4bea01c24777776ec40437d1616c3540`. On 2026-10-26:

1. Deleted the bootstrap GitHub release; the remote tag was retained.
2. Replaced the local lightweight tag with an annotated tag on `9170a07`.
3. Force-updated the remote tag with `git push --force origin refs/tags/v0.1.0`.

The `release-tags` ruleset blocks deletion of `v*` tags but does not block updates, so no ruleset
exception was needed and the tag was not deleted remotely. This was a one-time bootstrap
replacement; future releases use a new tag and published production tags are not rewritten.

The tag is annotated but unsigned because no GPG/SSH signing key was available in the release
environment. `docs/RELEASE.md` allows an annotated tag when signing is not possible.

## Artifacts

| Asset                                |     Bytes | SHA256                                                             |
| ------------------------------------ | --------: | ------------------------------------------------------------------ |
| `polyhunter-v0.1.0-linux-x64.tar.gz` | 7,274,075 | `d365004712ffc4dd1e7f5c9c3a083c83a26c686f110f50455102b20d25cc30a8` |
| `sbom.cdx.json`                      |    78,274 | `9b0c6bca4a5eea7aaced2327dd99ca07867e9c52e982167f8d355eb049806983` |
| `SHA256SUMS`                         |       181 | `bac625a63b83b7b9261f3d35140143c57fa878a171bfe62b4657d4ca213130be` |

The release is neither a draft nor a pre-release. The SBOM is CycloneDX 1.5 with 92 components. The
tarball has 4,640 entries and no repository `data/`, `.env`, recordings, SQLite database, key or
certificate files. The `.github/` paths found by a raw scan are dependency metadata inside
`node_modules`, not repository workflow files.

## Verification

Environment: WSL2 Ubuntu 26.04, Linux 6.18.33.2, Node 26.4.0, npm 11.17.0.

```bash
gh release download v0.1.0 --dir polyhunter-release
sha256sum -c SHA256SUMS
mkdir polyhunter-v0.1.0
tar -xzf polyhunter-v0.1.0-linux-x64.tar.gz -C polyhunter-v0.1.0
cd polyhunter-v0.1.0
NODE_ENV=production HOST=127.0.0.1 PORT=8794 DEMO_MODE=true \
  DATABASE_PATH=<temp>/smoke.db RECORD_DIR=<temp>/recordings \
  node apps/server/dist/main.js
```

Results:

- Both checksums passed.
- Layout: `package.json`, `docs/`, `packages/*/dist`, `apps/server/dist`, `apps/web/dist` and
  production `node_modules`.
- `GET /api/health` returned `status: "running"`, `mode: "paper"`, `liveAuthorized: false`,
  `liveAllowed: false` and `liveBlockReason: "paper mode; live execution is intentionally disabled"`.
- `GET /` returned HTTP 200 with the 682-byte dashboard HTML, not the API fallback.
- `GET /api/state` returned three demo markets, $1,000 starting cash, no positions, and the risk
  checks.
- `POST /api/control {"action":"kill"}` returned `killed` with reason `operator kill switch`.
- `POST /api/control {"action":"reset-kill"}` returned `running`.
- The server log was empty.

Operational note: running the server from the parent directory returned
`PolyHunter API is running. Build the dashboard with \`npm run build:web\`.`because the API resolves`apps/web/dist`relative to the working directory. Run from the extracted root, as`docs/RELEASE.md` now states. This is a runbook issue, not a packaging defect.

Windows note: the artifact is Linux x64. Extracting it on Windows and running Windows Node failed to
resolve the npm workspace symlink `@polyhunter/persistence` (`ERR_MODULE_NOT_FOUND`/EPERM). Windows
users run from the source checkout (`npm ci`, `npm run build`, `npm start`) or the Docker runtime.
This is now explicit in `docs/RELEASE.md`.

## Security and quality at the release commit

- CI run 40385494512: success (`quality`, `windows-quality`, `e2e`, `docker`).
- CodeQL run 40385495322: success.
- Security run 40385495598: success (Semgrep, Gitleaks, OSV, dependency review, actionlint, zizmor).
- CodeQL code-scanning alerts: 0.
- Secret-scanning alerts: 0.
- Dependabot alerts: 0.
- Scorecard had 9 open alerts at release time: 4 high (TokenPermissions, CodeReview, Maintained,
  BranchProtection), 4 medium (PinnedDependencies ×3, SecurityPolicy) and 1 low
  (CIIBestPractices). These are OpenSSF Scorecard process/supply-chain findings, not CodeQL code
  vulnerabilities. CodeReview, Maintained and BranchProtection are accepted single-owner/new-repo
  risks tracked by #39 and the contract's known-limitations section. TokenPermissions is fixed on
  `main` after the release (top-level `contents: read`, job-level `contents: write`) for future
  releases. The remaining P2 items are tracked by #38/#39.

## Limitations

- The artifact smoke used demo mode; it did not exercise the live venue or geoblock. The separate
  clean-checkout runbook recorded geoblock `BLOCKED (BR)` with `npm run smoke` and kept paper mode.
- The Linux artifact was verified on WSL2, not on a separate physical Linux host.
- The tag is annotated but unsigned.
- The release notes are generated from the tag. The in-artifact `docs/RELEASE.md` is the version at
  `9170a07`; the corrected extraction and working-directory guidance is on `main` and in this
  evidence file.

## Reproduction

```bash
gh release download v0.1.0 --dir polyhunter-release
cd polyhunter-release
sha256sum -c SHA256SUMS
mkdir polyhunter-v0.1.0
tar -xzf polyhunter-v0.1.0-linux-x64.tar.gz -C polyhunter-v0.1.0
cd polyhunter-v0.1.0
NODE_ENV=production HOST=127.0.0.1 PORT=8794 DEMO_MODE=true \
  DATABASE_PATH=/tmp/polyhunter-smoke.db RECORD_DIR=/tmp/polyhunter-recordings \
  node apps/server/dist/main.js
```

Then check `/api/health`, open `/`, and exercise the kill/reset controls. The release is paper-only;
do not add live signing, credentials or a geoblock bypass.
