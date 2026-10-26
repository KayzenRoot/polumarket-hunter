# Security policy

## Reporting a vulnerability

Use GitHub private vulnerability reporting:

https://github.com/KayzenRoot/polumarket-hunter/security/advisories/new

Do not open a public issue for a vulnerability that could expose credentials, funds, account data
or a bypass of the geoblock/risk boundary.

Include:

- affected commit;
- reproduction steps;
- expected vs observed behavior;
- impact assessment;
- sanitized logs (no secrets, tokens, IPs or account identifiers).

## Scope

In scope:

- secret leakage in code, logs, fixtures, CI or the dashboard;
- auth/authorization gaps in the API or control plane;
- geoblock or risk-limit bypass;
- order simulation errors that create or destroy paper value incorrectly;
- cross-site scripting, prototype pollution or unsafe rendering in the dashboard;
- supply-chain issues in dependencies or GitHub Actions.

Out of scope:

- requests for live-trading credentials;
- “make it trade despite the geoblock”;
- profit/loss disputes from paper results;
- vulnerabilities requiring a compromised local machine with unrestricted access.

## Security invariants

1. No secret is required for paper mode.
2. No live signing or order-submission code exists.
3. The geoblock check is fail-closed: `UNKNOWN` is not eligible.
4. Non-loopback binding requires `API_TOKEN`.
5. Control requests use constant-time token comparison.
6. External data is validated with Zod at the provider boundary.
7. Logs redact auth headers, keys and secrets.
8. CI blocks high-severity dependency findings and scans history for secrets.

## If a secret is exposed

1. Revoke/rotate it at the provider immediately.
2. Remove it from the working tree and history using the provider's guidance.
3. Assume it is compromised; do not rely on deletion alone.
4. Add a regression guard (Gitleaks rule/tests) and document the incident.

## Dependencies

Dependabot, OSV-Scanner, dependency review and npm audit are enabled. Do not disable a gate to land
a feature; update the dependency or document an explicit, time-bounded exception with owner
approval.
