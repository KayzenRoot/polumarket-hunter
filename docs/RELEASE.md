# Release process

Releases are tag-driven and produce a runnable Linux x64 artifact, a CycloneDX SBOM and SHA256
checksums. The `release` workflow runs on any `v*` tag.

## Preconditions

1. CI is green on `main`, including `quality`, `windows-quality`, `docker`, `e2e`, CodeQL and the
   security gate.
2. The production contract is approved and the research memo exists at
   `docs/research/v0.1-evidence.md` (#29) before calling a tag “production”.
3. The release commit is the exact commit already merged to `main`.
4. The working tree is clean and local data (`data/`, `.env`) is not staged.

## Cut a release

```bash
git switch main
git pull --ff-only
npm run verify
git tag -s v0.1.0 -m "PolyHunter v0.1.0"
git push origin v0.1.0
```

Use an annotated signed tag when possible. If no signing key is available, use an annotated tag and
record that it is unsigned in the release evidence. The tag workflow runs automatically; do not
create the GitHub release by hand.

The `v0.1.0` bootstrap preview was replaced through this workflow on 2026-10-26 (annotated tag on
`9170a07`; see `docs/evidence/release-v0.1.0-2026-10-26.md`). Future releases use a new tag.

The workflow:

- clean-installs with `npm ci` from the lockfile;
- builds the app;
- generates `sbom.cdx.json` with `npm sbom --sbom-format=cyclonedx --omit=dev`;
- prunes dev dependencies and packages
  `polyhunter-<tag>-linux-x64.tar.gz` with deterministic tar metadata;
- writes and verifies `SHA256SUMS`;
- extracts the tarball in a temp directory and checks `/api/health`, the dashboard, kill and reset
  before publishing;
- publishes the release with notes linking the contract, plan, runbook, fees and research memo.

Re-running the workflow for the same tag uploads assets with `--clobber` and updates the notes. Only
do this to recover a failed build before consumers download it; do not rebuild a published release
just to change its metadata.

To validate packaging without publishing, dispatch the workflow in dry-run mode:

```bash
gh workflow run release.yml --ref main -f ref=main -f dry_run=true
```

The dry run builds, prunes, packages, writes/verifies checksums and uploads a `release-dry-run`
artifact; it does not create a release.

## Verify on a clean machine

```bash
sha256sum -c SHA256SUMS
mkdir polyhunter-v0.1.0
tar -xzf polyhunter-v0.1.0-linux-x64.tar.gz -C polyhunter-v0.1.0
cd polyhunter-v0.1.0
cp .env.example .env
# edit DATABASE_PATH / RECORD_DIR / API_TOKEN as needed
node apps/server/dist/main.js
```

The tarball has no top-level directory, so always extract it into an empty directory. Run the server
from the extracted root; the API resolves `apps/web/dist` relative to the working directory and
otherwise serves the API fallback instead of the dashboard.

Open http://127.0.0.1:8787 and check `/api/health`. Run `npm run doctor` from the source checkout
for the full local diagnostics.

The tarball contains no `data/`, `.env`, recordings, wallet material or secrets.

## Artifact contents

- `package.json`, `package-lock.json`
- production `node_modules`
- `packages/*/dist`
- `apps/server/dist`, `apps/web/dist`
- `README.md`, `.env.example`, `docs/`

Node 24 or 26 (`>=24 <27`) is required. The artifact is Linux x64; Windows users should use the
source install or the Docker runtime.

## Post-release verification

Record the tag object, release URL, workflow run, asset SHA256 values and the Linux smoke result in
`docs/evidence/release-<tag>-<date>.md`. Verify `sha256sum -c SHA256SUMS` from the downloaded
assets, start the server from the extracted root, and check `/api/health` and `/` (the dashboard,
not the API fallback). See `docs/evidence/release-v0.1.0-2026-10-26.md`.

## Release notes and limitations

Release notes must link the production contract and the research memo (or state that #29 is still
pending, in which case the tag is not the production gate). Do not claim profitability. State that
live execution is not implemented and the geoblock remains enforced.

## Rollback

If a release is wrong:

1. Do not delete the tag or rewrite history. The one-time bootstrap replacement of `v0.1.0` on
   2026-10-26 is documented in the release evidence; it is not a precedent for moving a published
   production tag.
2. Mark the GitHub release as a pre-release/draft and publish a corrective patch tag.
3. Restore data from a verified backup if the release corrupted local state.
4. Record the incident in `docs/`.
