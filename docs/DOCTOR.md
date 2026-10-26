# Doctor diagnostics

`npm run doctor` checks the runtime, configuration, local storage and public provider reachability
before a paper session. It never prints API tokens, webhook URLs or other secrets.

```bash
npm run doctor
npm run doctor -- --json
npm run doctor -- --skip-network
```

Exit code `0` means no hard failure. Warnings are shown but do not fail the command. Network checks
are skipped with `--skip-network` for offline diagnostics.

## Checks

| Check         | Pass                                   | Warn                              | Fail                        |
| ------------- | -------------------------------------- | --------------------------------- | --------------------------- |
| Node.js       | 24–26                                  | —                                 | outside the supported range |
| Configuration | valid env                              | —                                 | invalid env                 |
| API port      | free                                   | —                                 | already in use              |
| SQLite        | readable, integrity ok, tables present | missing tables                    | unreadable/corrupt          |
| Disk          | ≥1 GiB free                            | 100 MiB–1 GiB                     | <100 MiB                    |
| Gamma         | HTTP 2xx                               | —                                 | network/HTTP failure        |
| CLOB          | reachable `GET /time`                  | —                                 | network/5xx failure         |
| Clock skew    | ≤5s from CLOB time                     | 5–60s                             | >60s                        |
| Geoblock      | eligible                               | blocked in paper mode, or unknown | blocked in live mode        |

The geoblock warning is expected from BR: the official endpoint reports `BLOCKED`. Paper mode is
allowed; live mode is not, and no VPN/proxy bypass is permitted.

## Example

```text
PolyHunter doctor: OK

[PASS] Node.js: 26.4.0 satisfies >=24 <27
[PASS] Configuration: mode=paper demo=false host=127.0.0.1:8787 apiToken=none webhook=none
[PASS] API port: 127.0.0.1:8787 is free
[PASS] SQLite: data/polyhunter.db does not exist yet; parent is writable
[PASS] Disk: 163.79 GiB free
[PASS] Gamma provider: HTTP 200
[PASS] CLOB provider: reachable (HTTP 200)
[PASS] Clock skew: 202 ms from the provider
[WARN] Geoblock: blocked (BR); paper mode is allowed
         Do not use a VPN or proxy to bypass the venue geoblock.
```

## Remediation

- **Node:** install Node 24–26. The repository pins `>=24 <27` in `package.json`.
- **Configuration:** fix `.env`; do not paste secrets into an issue or log.
- **Port:** stop the process using it or change `PORT`.
- **SQLite:** restore the file from backup. Do not edit a corrupt database in place.
- **Disk:** free space; recordings can be hundreds of MB for a 10-minute session.
- **Gamma/CLOB:** check DNS, firewall and the configured base URLs.
- **Clock:** enable NTP/Windows time sync; a skewed clock distorts book-age and freshness checks.
- **Geoblock:** paper mode only. Do not attempt a bypass.

## JSON output

`--json` prints `{ ok, checks: [{ id, label, status, detail, remediation }] }`. `status` is one of
`pass`, `warn`, `fail`, `skip`. Scripts should key on `ok` and the check ids, not the human text.
