# AWS deployment with Tailscale inbound

PolyHunter is a local, single-user, paper-first terminal. For a foreign client, the supported
pattern is a dedicated AWS VPS in the client's eligible region, with Tailscale used **only** for
private inbound access to the dashboard.

This is not a geoblock-evasion design. The VPS makes the Polymarket requests from its own region; the
official geoblock endpoint must report `ELIGIBLE` there. Do not use a VPN, a Tailscale exit node, a
subnet router or a DNS trick to make the server appear in another jurisdiction.

## Topology

```text
Client browser / operator
        │  Tailscale (private, HTTPS)
        ▼
AWS VPS in the client's eligible region
  ├─ Tailscale Serve :443 → 127.0.0.1:8787
  ├─ PolyHunter (Docker or release tarball)
  └─ SQLite + recordings on the EBS volume
        │  normal HTTPS/WSS egress
        ▼
Polymarket public Gamma / CLOB / WebSocket endpoints
```

The Brazilian workstation is only an admin client. It does not originate Polymarket traffic and does
not need a VPN. The VPS does the recording, research and serving.

## 1. Choose the region and verify eligibility

Choose an AWS region in the client's country or the jurisdiction where the client is legally allowed
to use the venue. Examples only; confirm eligibility before deploying:

| Client location | Candidate region              |
| --------------- | ----------------------------- |
| United States   | `us-east-1` or `us-west-2`    |
| Canada          | `ca-central-1`                |
| United Kingdom  | `eu-west-2`                   |
| European Union  | `eu-west-1` or `eu-central-1` |
| Australia       | `ap-southeast-2`              |
| Singapore       | `ap-southeast-1`              |

On the VPS, from a source checkout (not the pruned release artifact):

```bash
npm ci
npm run build
npm run doctor
npm run smoke
```

`doctor` and `smoke` must report the venue geoblock as `ELIGIBLE` for the VPS egress. If they report
`BLOCKED` or `UNKNOWN`, **stop**. Do not add a VPN, Tailscale exit node or alternative DNS to change
the result. Choose a legitimate region for the client or do not deploy the data path.

The geoblock is only one signal. The client must also be legally eligible for the venue; confirm that
separately. PolyHunter remains paper-only and does not submit live orders.

## 2. AWS instance and network

Suggested baseline:

- Ubuntu 24.04 LTS, `t3.small` (2 vCPU / 2 GB) or `t4g.small`.
- 20–30 GB gp3 EBS, encrypted; snapshot schedule enabled.
- IAM instance role + SSM Session Manager; no long-lived access keys.
- Security group inbound: **none** for 22, 80, 443 or 8787.
- Security group outbound: HTTPS 443 and UDP 41641 for Tailscale; DERP fallback uses 443.
- No public IPv4 is required if SSM/Tailscale is used, but a public IP is acceptable with the closed
  security group. Prefer private subnet + NAT if the client's network design requires it.

Tailscale is an outbound-initiated overlay; it does not require an inbound security-group rule.

## 3. Install Tailscale and expose the dashboard privately

Use the official Tailscale package repository rather than a curl-to-shell installer:

```bash
curl -fsSL https://pkgs.tailscale.com/stable/ubuntu/noble.noarmor.gpg \
  | sudo tee /usr/share/keyrings/tailscale-archive-keyring.gpg >/dev/null
curl -fsSL https://pkgs.tailscale.com/stable/ubuntu/noble.tailscale-keyring.list \
  | sudo tee /etc/apt/sources.list.d/tailscale.list
sudo apt-get update
sudo apt-get install -y tailscale
sudo tailscale up --ssh
```

In the Tailscale admin console:

1. Approve the VPS and give it a tag such as `tag:polyhunter`.
2. Restrict the tailnet ACL so only the owner/client devices can reach `tag:polyhunter:443`.
3. Enable HTTPS certificates for the tailnet.
4. Do **not** enable an exit node, subnet router or advertised route on this host.

Serve the loopback dashboard:

```bash
sudo tailscale serve --bg 8787
tailscale serve status
```

Access it at `https://polyhunter.<tailnet>.ts.net`. Tailscale terminates TLS and proxies to
`127.0.0.1:8787`; port 8787 is never exposed to the internet.

## 4. Run PolyHunter

### Docker (recommended)

The compose file binds the published port to loopback only:

```yaml
ports:
  - "127.0.0.1:8787:8787"
```

Create a local `.env` for compose with a long random control token:

```bash
openssl rand -hex 32
```

```text
POLYHUNTER_API_TOKEN=<the-random-value>
DEMO_MODE=false
LOG_LEVEL=info
TRADING_MODE=paper
```

```bash
docker compose up -d --build
docker compose ps
curl -fsS http://127.0.0.1:8787/api/health
```

### Release tarball + systemd

Use `docs/SUPERVISOR.md`; set `HOST=127.0.0.1` and `API_TOKEN` in `/opt/polyhunter/.env`, then use
Tailscale Serve as above. The release artifact is Linux x64.

## 5. DNS and recording

The VPS should use the normal AWS resolver. If it cannot resolve the Polymarket hosts, fix the VPS
resolver or use a standard public resolver on the VPS; that is ordinary DNS troubleshooting, not a
geolocation change. The Brazilian workstation's DNS is irrelevant once the recorder runs on the VPS.

Run the recorder and research on the VPS from a source checkout:

```bash
npm run record -- --minutes 10 --markets 5 --min-liquidity 100000
npm run data:validate -- --file data/recordings/<session>.jsonl
npm run research -- --file data/recordings/<session>.jsonl --fee-rate 0.05
```

Copy reports and recordings back over Tailscale/SSH only if needed. Keep the SQLite database and
recordings on the encrypted EBS volume.

## 6. Verify the deployment

```bash
# from the VPS source checkout
npm run doctor
npm run smoke

# from the VPS or through Tailscale
curl -fsS http://127.0.0.1:8787/api/health
curl -fsS https://polyhunter.<tailnet>.ts.net/api/health
```

Then:

1. Open the dashboard through Tailscale.
2. Confirm `PAPER` and the geoblock state.
3. Start a paper session and confirm book updates.
4. Exercise pause/resume and kill/reset.
5. Run a 2+ minute recording and validate it.
6. Confirm the kill switch and risk limits still behave after a process restart.

## 7. Operations and rollback

- Back up SQLite and recordings before upgrades: `npm run db:backup`.
- Snapshot the EBS volume on a schedule.
- Keep `API_TOKEN` in the service environment, never in git.
- Keep port 8787 loopback-only; use Tailscale Serve or a TLS reverse proxy.
- On a bad release: stop the service, restore the backup, deploy the previous tag, verify health.
- Do not expose the API publicly without TLS, authentication and a separate review.

## What not to do

- Do not use a commercial VPN, Tailscale exit node, subnet router or DNS override to make the VPS
  appear in an eligible jurisdiction.
- Do not run the server in Brazil and tunnel its egress through another country.
- Do not bypass a `BLOCKED` or `UNKNOWN` geoblock result.
- Do not enable live execution; the live adapter and legal/security gates are still blocked.

If the client is not in an eligible jurisdiction, the correct answer is not a network workaround. It
is to stop and obtain legal/venue guidance.
