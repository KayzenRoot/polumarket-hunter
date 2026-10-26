# ECC assets (curated)

This directory is a reviewed, curated subset of [ECC](https://github.com/affaan-m/ECC) — not a full
vendored copy. The source package is `ecc-universal` version `2.2.3` (MIT, see `ECC-LICENSE`).

- `skills/` — operational skills used by the PolyHunter agent loop.
- `rules/` — common, TypeScript, web and React standards.
- `instructions/OPERATING-LOOP.md` — the project-specific plan → test → implement → review → verify loop.

Refresh with:

```bash
npm run ecc:sync
```

The ECC OpenCode plugin is loaded from `node_modules/ecc-universal` via `opencode.json`.
