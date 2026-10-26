# Control-plane security

PolyHunter is loopback-first. It is not a hosted multi-tenant service.

## Defaults

- Default bind: `HOST=127.0.0.1`.
- `API_TOKEN` is optional on loopback and **required** on any non-loopback host. The server refuses
  to start otherwise.
- Control endpoints are rate-limited to 10 requests per minute per client.
- The API never logs `API_TOKEN`, wallet material or webhook URLs. The dashboard stores the token in
  local storage only for the browser session.

There is no wallet connection, signing key or exchange credential in this project. Do not add one.

## Token rotation

1. Generate a new random token (for example `openssl rand -hex 32`).
2. Update the process environment/secret store and restart the server.
3. In the dashboard, click the key icon and enter the new token.
4. Confirm the old token now returns `401`.

Rotation is a restart operation because the token is read at boot. Tokens are compared with a
constant-time comparison and are never echoed in responses or logs.

## TLS reverse proxy

Terminate TLS at a trusted proxy and keep Fastify on loopback. Example Caddy:

```caddy
polyhunter.example.com {
  encode zstd gzip
  header {
    Strict-Transport-Security "max-age=31536000; includeSubDomains"
    X-Content-Type-Options "nosniff"
    X-Frame-Options "DENY"
  }
  reverse_proxy 127.0.0.1:8787
}
```

Example nginx:

```nginx
server {
  listen 443 ssl http2;
  server_name polyhunter.example.com;
  # ssl_certificate ...; ssl_certificate_key ...;

  add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
  add_header X-Content-Type-Options "nosniff" always;

  location / {
    proxy_pass http://127.0.0.1:8787;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

If Fastify is bound non-loopback, set `API_TOKEN` and still put TLS in front of it. Do not expose the
plain HTTP port to the internet.

## Audit

Every control action is written to `events` with `{ action, actor, result }` and a timestamp. Failed
actions are recorded with `result: "failed"` and a reason. The dashboard **Operator log** and
`GET /api/events` expose the recent entries. See [OPERATOR-CONTROLS.md](OPERATOR-CONTROLS.md).

## Tests

- Missing/wrong token → `401`, response does not contain the token.
- Token change requires a restart; old token fails on the new instance.
- Non-loopback host without token → config refusal.
- Control actions are limited to 10/minute.
- Audit success/failure records include actor and result.

## Logging

- Fastify request logging is off for control bodies; only method/path/status are logged.
- Provider payloads are never logged wholesale.
- If you add a new secret, add it to redaction tests and docs before shipping.
