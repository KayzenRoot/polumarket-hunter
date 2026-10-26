# Data retention, backup and restore

SQLite is the audit log; JSONL recordings are the raw research input. Neither is deleted
automatically. Run the commands below deliberately.

## Retention defaults

| Setting                    | Default | Used by                                   |
| -------------------------- | ------- | ----------------------------------------- |
| `RETENTION_DAYS`           | `30`    | `npm run db:prune`                        |
| `RECORDING_RETENTION_DAYS` | `30`    | `npm run db:prune` recording file cleanup |

Prune never removes the active session: any `runs` row with `status='running'` is protected, as are
sessions passed with `--keep-session`.

## Dry-run first

```bash
npm run db:prune -- --dry-run
npm run db:prune -- --days 30 --dry-run --json
```

The dry-run prints counts for sessions, trades, signals, snapshots, events and recording files. It
does not open a write transaction.

## Prune

Stop the engine for a large prune, or run it during a quiet period. The delete runs in a single
`BEGIN IMMEDIATE` transaction:

```bash
npm run db:prune -- --days 30 --keep-session ses_abc123
npm run db:prune -- --days 30 --recordings-dir data/recordings --recording-days 30
```

- `--db` overrides `DATABASE_PATH`.
- `--keep-session` is repeatable.
- `--dry-run` is safe on an active DB.
- Recording files are removed only when their modification time is older than the cutoff; an active
  recorder keeps its file fresh.

## Backup

```bash
npm run db:backup
npm run db:backup -- --db data/polyhunter.db --out data/backups/before-upgrade.sqlite
```

The backup uses SQLite `VACUUM INTO`, so it is a consistent single-file copy even with WAL active.
The command verifies integrity and expected tables before reporting success.

## Restore

1. Stop the server so no process holds the database.
2. Keep the current file; the restore command copies it to
   `<db>.before-restore-<timestamp>.bak` when `--force` is used.
3. Restore and verify:

```bash
npm run db:restore -- --file data/backups/before-upgrade.sqlite --yes
# replace an existing database:
npm run db:restore -- --file data/backups/before-upgrade.sqlite --yes --force
```

Restore verifies the backup first, removes stale `-wal`/`-shm` files, copies the main file and
verifies the target. A corrupt backup is rejected before the target is touched.

## CSV export

The session report endpoint/UI exports a full CSV. For separate trade and signal files:

```bash
npm run data:export -- --session ses_abc123 --out data/exports
```

Writes `trades-<session>.csv` and `signals-<session>.csv`, oldest first, with a header row.

## Disk-full recovery

1. Stop the engine (`stop` or Ctrl+C).
2. Free space; remove old recordings with `db:prune --dry-run` first.
3. Run `npm run doctor` to confirm free space and DB integrity.
4. Restart and watch the feed-health panel.

If SQLite reports `database or disk is full`, do not delete the database. Free space, then retry. If
the file is corrupt, restore the newest verified backup.

## Corruption recovery

```bash
npm run doctor
npm run db:backup -- --out data/backups/last-known-good.sqlite   # only if the DB still opens
npm run db:restore -- --file data/backups/<verified>.sqlite --yes --force
```

There is no automatic repair. A corrupt audit log is evidence; preserve a copy before attempting a
restore. Do not hand-edit the SQLite file.
