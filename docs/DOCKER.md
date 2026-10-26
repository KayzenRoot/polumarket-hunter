# Docker runtime

The container path is for a reproducible Linux host or CI. Windows remains the primary local
runtime; Docker Desktop on Windows works the same way.

## Build and run

```bash
export POLYHUNTER_API_TOKEN="$(openssl rand -hex 32)"
docker compose up --build
```

Open http://127.0.0.1:8787 and enter the token via the dashboard key icon. The server binds
`0.0.0.0` inside the container, so `API_TOKEN` is mandatory; the compose file refuses to start
without `POLYHUNTER_API_TOKEN`.

For an offline demo:

```bash
POLYHUNTER_API_TOKEN=local-demo DEMO_MODE=true docker compose up --build
```

## Image properties

- Multi-stage Node 24 build; runtime contains only production dependencies and built output.
- Runs as the `node` user, not root.
- `/data` is a volume for `polyhunter.db` and `recordings/`.
- `/tmp` is tmpfs; the app does not need writable application files.
- Healthcheck: `GET /api/health` every 30s.
- No secrets are baked into the image; all configuration is environment-driven.
- `init: true` forwards signals so `stop()`/SIGTERM closes the session cleanly.

## Persistence

`compose.yaml` creates the named volume `polyhunter-data` at `/data`. The database and recordings
survive `docker compose down` and container replacement. `docker compose down -v` deletes them.

Backup the volume with a one-off container:

```bash
mkdir -p backups
docker run --rm -v polyhunter-data:/data -v "$PWD/backups:/backups" polyhunter:local \
  node --input-type=module -e "import {DatabaseSync} from 'node:sqlite'; const db=new DatabaseSync('/data/polyhunter.db'); db.exec(\"VACUUM INTO '/backups/polyhunter.sqlite'\"); db.close();"
```

The app’s `db:backup` command is available on the host when the data directory is bind-mounted.

## Upgrade

1. `docker compose pull` or `git pull && docker compose build`.
2. `docker compose up -d`.
3. The server applies SQLite migrations on start.
4. Check `/api/health` and the dashboard feed panel.

Take a backup first if the release notes mention a schema change.

## CI

The `docker` job builds the image, starts it with a token and demo mode, waits for
`/api/health` to report `running`, then checks `/api/state` has markets. The job runs on PRs and
main.

## Security

- Always set a random `POLYHUNTER_API_TOKEN`; the compose file requires it.
- Put TLS in front if exposing beyond localhost; see [SECURITY.md](SECURITY.md).
- Do not bake `.env`, keys or tokens into a derived image.
- The container has no wallet or signing capability; live trading is still blocked.
