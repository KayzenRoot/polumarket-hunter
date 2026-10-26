# Contributing

## Setup

```bash
npm ci
cp .env.example .env
npm run dev
```

Use Node.js `>=24 <27` and npm 11+.

## Workflow

1. Open or reference an issue with the problem and acceptance criteria.
2. Create a branch from `main`.
3. Write a failing test for the behavior change.
4. Implement the smallest change at the correct boundary.
5. Run the verification commands.
6. Open a PR using the template; the title must be a conventional commit.

```bash
npm run lint
npm run typecheck
npm run test:coverage
npm run build
npm run test:e2e   # UI/control changes
npm run smoke      # provider contract changes
```

## Commit convention

```text
feat: add market depth score
fix: reject crossed books in the paper broker
security: redact provider auth headers
test: cover settlement of a losing position
docs: clarify geoblock boundary
```

## Code rules

- `packages/core` must remain free of network, filesystem and UI imports.
- Provider wire types stay inside `packages/polymarket`.
- Parse external input with Zod.
- Do not add `any`; use `unknown` and narrow.
- Keep public functions typed.
- Add tests before or with the implementation; never delete an assertion to pass.
- Financial math changes require an invariant/property test and a note in `docs/STRATEGY.md`.
- Do not add live trading, signing, geoblock bypass or secret handling without a separate approved
  design and security review.

## Pull requests

- Keep the diff focused.
- Explain the failure mode and the control that catches it.
- Include command output for the verification gate.
- Update docs when behavior, configuration or the API contract changes.
- Required checks: `quality`, `e2e`, `codeql`, `security-gate`.

## Security

Report vulnerabilities privately per [SECURITY.md](SECURITY.md). Never include secrets in an issue,
PR, test fixture or log.

## License

By contributing, you agree that your contribution is licensed under the MIT License.
