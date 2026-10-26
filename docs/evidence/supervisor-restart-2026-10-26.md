# Supervisor restart smoke — 2026-10-26

Scope: verify the v0.1.x supervisor recipes and the restart/control-plane behavior on the existing
Windows research host. This is local evidence, not a test of a production service manager.

## Configuration assertions

`scripts/service-config.test.ts` reads the checked-in recipes and asserts:

- systemd: `Restart=on-failure`, `RestartSec=5`, `KillSignal=SIGTERM`, `TimeoutStopSec=30`,
  `StateDirectory`, `LogsDirectory`, append-only stdout/stderr and `NoNewPrivileges=true`;
- logrotate: daily, 14 compressed copies, `copytruncate`, owner `polyhunter`;
- Task Scheduler: `AtLogOn`, `RestartCount=999`, `RestartInterval`, `IgnoreNew` and no execution
  time limit;
- Windows wrapper: runs `apps/server/dist/main.js` and appends to `logs/polyhunter.log`;
- Windows rotation: copy, truncate and prune archives;
- the runbook documents health, kill and reset after restart.

`npx vitest run scripts/service-config.test.ts` — 6 passed.

## Local restart smoke

Built the repository, started the server on `127.0.0.1:8797` with demo mode, killed the process,
started it again, and exercised the control plane.

```text
first_start=running session=1793049259057
after_kill=down
second_start=running session=1793049263685
after_control_kill=killed reason=operator kill switch
after_control_reset=running
first_log_bytes=0
second_log_bytes=0
```

The new process created a new session, the API was available again, and kill/reset worked. The logs
were empty because `LOG_LEVEL=error` and no error occurred.

## systemd unit verification

`systemd-analyze verify deploy/systemd/polyhunter.service` parsed the unit. WSL reported:

- the file is executable/world-writable on the Windows mount (not a repo mode issue);
- `/usr/bin/node` is not present in this WSL distribution.

Both are environment warnings. The unit's actual directives are covered by the config test, and the
runbook says to adjust `ExecStart` if Node is elsewhere.

## Limitations

- Windows Task Scheduler was not registered in this smoke; that would create a persistent logon task
  on the research host. The registration script and its restart settings are config-tested.
- The systemd unit was syntax-checked, not started under systemd in this host. WSL user systemd is
  not enabled.
- The app's kill switch is intentionally in-memory; a restart starts a new paper session with the
  switch armed. The control plane is available, but the killed state is not persisted. This matches
  the production contract's paper-ledger reset behavior.
- No provider geoblock or live-order path was exercised; the paper-only boundary is unchanged.
