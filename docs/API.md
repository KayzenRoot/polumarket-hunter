# HTTP API contract

PolyHunter exposes a local, loopback-first HTTP API. The machine-readable contract is
[`docs/openapi.json`](openapi.json), served at `/openapi.json`.

This is a paper-only API. It has no live order endpoint, no wallet, no signing and no geoblock
bypass. Prices are informational, not advice.

## Envelope

Every JSON endpoint returns one of:

```json
{ "ok": true, "data": {} }
```

```json
{ "ok": false, "error": { "code": "invalid_query", "message": "invalid limit" } }
```

`data` is the endpoint-specific payload. The OpenAPI document defines the success schema for each
operation and the `Failure` schema for errors.

## Error codes

| HTTP | `error.code`      | Meaning                                                      |
| ---: | ----------------- | ------------------------------------------------------------ |
|  400 | `invalid_query`   | Invalid `limit` or `session` query parameter                 |
|  400 | `invalid_params`  | Invalid path parameter                                       |
|  400 | `invalid_control` | Invalid control action                                       |
|  401 | `unauthorized`    | Missing or invalid `x-api-token`                             |
|  404 | `not_found`       | Session, market or route not found                           |
|  409 | `control_failed`  | The engine rejected the control action                       |
|  500 | `request_failed`  | Unhandled server error; the message is intentionally generic |

## Authentication and rate limits

- The default bind is `127.0.0.1`; no token is required.
- A non-loopback bind requires `API_TOKEN`. Send it as `x-api-token` on `POST /api/control`.
- The global rate limit is 240 requests per minute per client.
- `POST /api/control` is limited to 10 requests per minute.
- Security headers are set on every response. In production the CSP is enabled.

## Endpoints

| Method | Path                                   | Purpose                                     |
| ------ | -------------------------------------- | ------------------------------------------- |
| GET    | `/api/health`                          | Engine, provider and geoblock state         |
| GET    | `/api/state`                           | Full dashboard state                        |
| GET    | `/api/stream`                          | SSE state stream                            |
| GET    | `/api/sessions`                        | Recent paper sessions                       |
| GET    | `/api/events`                          | Recent engine events                        |
| GET    | `/api/sessions/{sessionId}/report`     | Session report JSON                         |
| GET    | `/api/sessions/{sessionId}/report.csv` | Session report CSV attachment               |
| GET    | `/api/markets`                         | Scanned markets                             |
| GET    | `/api/markets/{tokenId}`               | Market detail and full order book           |
| GET    | `/api/portfolio`                       | Paper portfolio                             |
| GET    | `/api/risk`                            | Risk state and limit checks                 |
| GET    | `/api/trades`                          | Paper fills; `limit` and `session` filters  |
| GET    | `/api/signals`                         | Strategy signals; `limit` and `session`     |
| POST   | `/api/control`                         | start/stop/pause/resume/cancel/flatten/kill |
| GET    | `/metrics`                             | Prometheus text exposition                  |
| GET    | `/openapi.json`                        | This contract                               |
| GET    | `/`                                    | Dashboard shell or API-only fallback        |

### SSE stream

`GET /api/stream` returns `text/event-stream`. Each state message is:

```text
event: state
data: {"health":{...},"markets":[...]}
```

A `: keep-alive` comment is sent every 15 seconds. The dashboard falls back to polling when the
stream is unavailable.

### Session CSV

`GET /api/sessions/{sessionId}/report.csv` returns `text/csv; charset=utf-8` with a
`content-disposition` attachment filename. A missing session returns the JSON error envelope with
HTTP 404.

## Generate client types

The spec is OpenAPI 3.0.3. Generate TypeScript types without adding a runtime dependency:

```bash
npx --yes openapi-typescript@7.13.0 docs/openapi.json -o /tmp/polyhunter-api.d.ts
```

The generated `paths` types can be used for a typed client. The web app currently keeps a small
hand-written wrapper in `apps/web/src/api.ts`; the spec is the source of truth for route and response
shapes.

## Keeping the contract current

```bash
npm run api:spec
```

This rewrites `docs/openapi.json` from `apps/server/src/openapi.ts`. `apps/server/test/openapi.test.ts`
fails when:

- the served document differs from the checked-in snapshot;
- a registered public route is missing from the spec;
- the spec documents a route that the server does not register;
- an operation has no `200` response.

Run the test with:

```bash
npx vitest run apps/server/test/openapi.test.ts
```
