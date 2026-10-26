# Release dry-run evidence — 2026-10-26

Workflow: `.github/workflows/release.yml` (workflow_dispatch, `dry_run=true`)
Run: [40374931791](https://github.com/KayzenRoot/polumarket-hunter/actions/runs/40374931791)
Commit: `11bce20b88ed60421cd11b26675f629bcc3633c8` (`main` after #69)

## Result

All packaging steps passed: clean install, build, CycloneDX SBOM, production prune, deterministic
tarball, checksum generation/verification and dry-run artifact upload. Publish was skipped as
expected.

## Artifacts

| File                               |            Size | SHA256                                                             |
| ---------------------------------- | --------------: | ------------------------------------------------------------------ |
| `polyhunter-main-linux-x64.tar.gz` | 7,267,379 bytes | `ac818e4c1cbbd85493e72d2577ea9e74b691d7ef89da8e19976149991d765fd7` |
| `sbom.cdx.json`                    |    78,274 bytes | `6dbbb0137727997fbddae511c27a52e58570330b703ecb755424399c2c6d878f` |

`SHA256SUMS`:

```text
ac818e4c1cbbd85493e72d2577ea9e74b691d7ef89da8e19976149991d765fd7  polyhunter-main-linux-x64.tar.gz
6dbbb0137727997fbddae511c27a52e58570330b703ecb755424399c2c6d878f  sbom.cdx.json
```

## Verification commands

```powershell
gh run download 40374931791 -n release-dry-run -D data/release-dry-run
Get-Content data/release-dry-run/SHA256SUMS
Get-FileHash data/release-dry-run/polyhunter-main-linux-x64.tar.gz -Algorithm SHA256
Get-FileHash data/release-dry-run/sbom.cdx.json -Algorithm SHA256
```

Both hashes matched. The tarball contains production paths only:

- `package.json`, `package-lock.json`, `README.md`, `LICENSE`, `.env.example`, `docs/`
- production `node_modules`
- `packages/*/package.json` + `packages/*/dist`
- `apps/server/package.json` + `apps/server/dist`
- `apps/web/dist`

No `data/`, `.env`, recordings, SQLite files, wallet material or secrets were present.

## Runtime smoke

The tarball was extracted to a temp directory and started with:

```text
NODE_ENV=production HOST=127.0.0.1 PORT=8790 DEMO_MODE=true DATABASE_PATH=<temp>/polyhunter.db \
RECORD_DIR=<temp>/recordings node apps/server/dist/main.js
```

`GET /api/health` returned `status: "running"`. This validates that the packaged output runs outside
the repository checkout.

## Limitations

This is a dry run, not a published release. The tag publish path is exercised only by an
owner-approved `v*` tag after #29. Docker image build/smoke is covered separately by the `docker` CI
job (PR #67).
