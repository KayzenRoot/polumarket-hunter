# Running PolyHunter under a process supervisor

PolyHunter is a single Node process with an embedded SQLite database. It does not need an external
database or queue. Use a supervisor so a crash restarts the process and logs are retained.

Two recipes are provided:

- **Linux:** systemd unit + logrotate.
- **Windows:** Task Scheduler task + PowerShell log rotation.

Both recipes keep the API loopback-first, preserve the paper-only boundary and leave the operator
controls available after a restart.

## What survives a restart

- A new paper session starts. The previous session is closed in the SQLite audit log.
- The paper ledger and the in-memory kill switch are **not** carried across a process restart. The
  contract says the paper ledger resets on restart.
- The control plane is available again immediately. The kill switch is available and starts armed,
  so the operator can kill or reset the new session.
- SQLite, recordings and logs remain on disk.

If you need a kill state that survives a restart, that is a separate persistence change; do not
assume it today.

## Linux: systemd

### Install

```bash
sudo useradd --system --home /opt/polyhunter --shell /usr/sbin/nologin polyhunter
sudo mkdir -p /opt/polyhunter
sudo tar -xzf polyhunter-v0.1.0-linux-x64.tar.gz -C /opt/polyhunter
sudo cp /opt/polyhunter/.env.example /opt/polyhunter/.env
sudo editor /opt/polyhunter/.env
```

Set at least:

```text
NODE_ENV=production
HOST=127.0.0.1
PORT=8787
TRADING_MODE=paper
DATABASE_PATH=/var/lib/polyhunter/polyhunter.db
RECORD_DIR=/var/lib/polyhunter/recordings
```

`StateDirectory=polyhunter` and `LogsDirectory=polyhunter` create `/var/lib/polyhunter` and
`/var/log/polyhunter` with the service user as owner.

```bash
sudo install -m 0644 deploy/systemd/polyhunter.service /etc/systemd/system/polyhunter.service
sudo install -m 0644 deploy/logrotate/polyhunter /etc/logrotate.d/polyhunter
sudo systemctl daemon-reload
sudo systemctl enable --now polyhunter
```

If Node is not at `/usr/bin/node`, adjust `ExecStart` in the unit. If the checkout is not at
`/opt/polyhunter`, adjust `WorkingDirectory` and `Documentation`.

### Verify

```bash
systemctl status polyhunter --no-pager
curl -fsS http://127.0.0.1:8787/api/health
journalctl -u polyhunter -n 50 --no-pager
tail -n 20 /var/log/polyhunter/polyhunter.log
```

### Crash/restart test

```bash
sudo systemctl kill -s SIGKILL polyhunter
sleep 7
systemctl is-active polyhunter
curl -fsS http://127.0.0.1:8787/api/health
```

`Restart=on-failure` and `RestartSec=5` bring the process back. `StartLimitBurst=10` prevents a
tight crash loop from running forever.

### Kill switch after restart

```bash
curl -fsS -X POST -H 'content-type: application/json' \
  -d '{"action":"kill"}' http://127.0.0.1:8787/api/control
curl -fsS http://127.0.0.1:8787/api/health
curl -fsS -X POST -H 'content-type: application/json' \
  -d '{"action":"reset-kill"}' http://127.0.0.1:8787/api/control
```

The health response is `killed` after the first call and `running` after the reset. The control plane
is the same process; it is available after a supervisor restart.

### Logs and rotation

The unit writes both streams with `StandardOutput=append:` / `StandardError=append:` to
`/var/log/polyhunter/`. The provided logrotate rule keeps 14 daily compressed copies and uses
`copytruncate` because the process keeps the file open.

```bash
sudo logrotate -d /etc/logrotate.d/polyhunter   # dry run
sudo logrotate -f /etc/logrotate.d/polyhunter   # rotate now
```

### Stop and rollback

```bash
sudo systemctl stop polyhunter
sudo systemctl disable polyhunter
```

Restore the database/recordings from a verified backup, install the previous artifact, then start
again. Do not delete the only copy of the database.

## Windows: Task Scheduler

Run from a source checkout or the unpacked artifact. Build once:

```powershell
npm ci
npm run build
Copy-Item .env.example .env
notepad .env
```

Set at least:

```text
NODE_ENV=production
HOST=127.0.0.1
PORT=8787
TRADING_MODE=paper
DATABASE_PATH=C:\PolyHunter\data\polyhunter.db
RECORD_DIR=C:\PolyHunter\data\recordings
```

### Register and start

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy\windows\register-polyhunter.ps1 `
  -InstallDir C:\PolyHunter
Start-ScheduledTask -TaskName PolyHunter
Invoke-RestMethod http://127.0.0.1:8787/api/health
```

The task runs at logon as the current user, with `RestartCount=999`, `RestartInterval=1 minute`,
`MultipleInstances=IgnoreNew` and no execution time limit. The wrapper `run-polyhunter.ps1` appends
stdout/stderr to `C:\PolyHunter\logs\polyhunter.log`.

If you need the task to run before login, use a dedicated service account and change the trigger to
`-AtStartup`; do not run the terminal as a domain administrator.

### Crash/restart test

```powershell
$server = Get-CimInstance Win32_Process |
  Where-Object { $_.CommandLine -like '*apps/server/dist/main.js*' } |
  Select-Object -First 1
Stop-Process -Id $server.ProcessId -Force
Start-Sleep -Seconds 70
Invoke-RestMethod http://127.0.0.1:8787/api/health
Get-ScheduledTaskInfo -TaskName PolyHunter
```

Task Scheduler restarts the task after the failure. The delay is deliberate; keep it at one minute
or longer so a crash loop does not hammer the provider.

### Operator controls after restart

```powershell
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8787/api/control `
  -ContentType 'application/json' -Body '{"action":"kill"}'
Invoke-RestMethod http://127.0.0.1:8787/api/health
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8787/api/control `
  -ContentType 'application/json' -Body '{"action":"reset-kill"}'
```

### Log rotation

Register a daily task once:

```powershell
$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument '-NoProfile -ExecutionPolicy Bypass -File C:\PolyHunter\deploy\windows\rotate-logs.ps1 -InstallDir C:\PolyHunter'
$trigger = New-ScheduledTaskTrigger -Daily -At 3am
Register-ScheduledTask -TaskName 'PolyHunter-LogRotate' -Action $action -Trigger $trigger -Force
```

The script copies the active log to a timestamped file, truncates the active file and removes
archives older than 14 days. A failed truncation is a warning, not a silent deletion.

### Stop and rollback

```powershell
Stop-ScheduledTask -TaskName PolyHunter
Unregister-ScheduledTask -TaskName PolyHunter -Confirm:$false
```

Restore the database/recordings, install the previous build, re-register the task and start it.

## Security notes

- Keep `HOST=127.0.0.1` unless you terminate TLS behind a reverse proxy. A non-loopback bind
  requires `API_TOKEN`; the control endpoint checks it in constant time.
- Do not run the Linux unit as root or the Windows task as an administrator. The paper terminal
  needs no wallet, seed phrase, API secret or signing key.
- Logs are redacted by the app, but do not paste full provider payloads or account data into issues.
- The venue geoblock remains enforced. A supervisor restart is not a geoblock or eligibility bypass.

## Verification

`scripts/service-config.test.ts` asserts the restart, logging and rotation directives.
`docs/evidence/supervisor-restart-2026-10-26.md` records the local restart and control-plane smoke.
