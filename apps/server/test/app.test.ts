import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createLogger } from '../src/logger.js';
import { FakeEngine, makeState } from './fake-engine.js';

const apps: FastifyInstance[] = [];
const tempDirectories: string[] = [];

function testConfig(overrides: Record<string, string> = {}) {
  return loadConfig({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    WEB_DIST_PATH: 'apps/does-not-exist',
    ...overrides,
  });
}

async function build(overrides: Record<string, string> = {}) {
  const config = testConfig(overrides);
  const engine = new FakeEngine(makeState());
  const logger = createLogger({ ...config, logLevel: 'silent' });
  const app = await buildApp({ engine, config, logger });
  apps.push(app);
  return { app, engine, config };
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('http api', () => {
  it('serves health and state envelopes', async () => {
    const { app } = await build();
    const health = await app.inject({ method: 'GET', url: '/api/health' });
    expect(health.statusCode).toBe(200);
    const healthBody = health.json() as { ok: boolean; data: { status: string } };
    expect(healthBody.ok).toBe(true);
    expect(healthBody.data.status).toBe('running');

    const state = await app.inject({ method: 'GET', url: '/api/state' });
    expect(state.statusCode).toBe(200);
    const stateBody = state.json() as {
      ok: boolean;
      data: { markets: unknown[]; equityCurve: unknown[] };
    };
    expect(stateBody.data.markets).toHaveLength(1);
    expect(stateBody.data.equityCurve).toHaveLength(2);
  });

  it('serves markets, trades, signals, portfolio and risk', async () => {
    const { app } = await build();
    const markets = await app.inject({ method: 'GET', url: '/api/markets' });
    expect(markets.statusCode).toBe(200);

    const trades = await app.inject({ method: 'GET', url: '/api/trades?limit=1' });
    expect(trades.statusCode).toBe(200);
    expect((trades.json() as { data: unknown[] }).data).toHaveLength(1);

    const signals = await app.inject({ method: 'GET', url: '/api/signals?limit=1' });
    expect(signals.statusCode).toBe(200);

    const portfolio = await app.inject({ method: 'GET', url: '/api/portfolio' });
    expect(portfolio.statusCode).toBe(200);

    const risk = await app.inject({ method: 'GET', url: '/api/risk' });
    expect(risk.statusCode).toBe(200);
  });

  it('returns a market detail and a JSON 404 for an unknown token', async () => {
    const { app } = await build();
    const found = await app.inject({ method: 'GET', url: '/api/markets/yes-token' });
    expect(found.statusCode).toBe(200);
    expect((found.json() as { data: { market: { id: string } } }).data.market.id).toBe('market-1');

    const missing = await app.inject({ method: 'GET', url: '/api/markets/unknown-token' });
    expect(missing.statusCode).toBe(404);
    expect((missing.json() as { ok: boolean; error: { code: string } }).error.code).toBe(
      'not_found',
    );
  });

  it('rejects invalid query limits', async () => {
    const { app } = await build();
    const response = await app.inject({ method: 'GET', url: '/api/trades?limit=9999' });
    expect(response.statusCode).toBe(400);
  });

  it('validates control actions and forwards valid ones', async () => {
    const { app, engine } = await build();
    const invalid = await app.inject({
      method: 'POST',
      url: '/api/control',
      payload: { action: 'explode' },
    });
    expect(invalid.statusCode).toBe(400);

    const valid = await app.inject({
      method: 'POST',
      url: '/api/control',
      payload: { action: 'kill' },
    });
    expect(valid.statusCode).toBe(200);
    expect(engine.controls).toEqual(['kill']);
  });

  it('enforces the API token when configured', async () => {
    const { app } = await build({ API_TOKEN: 'top-secret' });
    const unauthorized = await app.inject({
      method: 'POST',
      url: '/api/control',
      payload: { action: 'start' },
    });
    expect(unauthorized.statusCode).toBe(401);
    expect((unauthorized.json() as { error: { code: string } }).error.code).toBe('unauthorized');

    const authorized = await app.inject({
      method: 'POST',
      url: '/api/control',
      headers: { 'x-api-token': 'top-secret' },
      payload: { action: 'start' },
    });
    expect(authorized.statusCode).toBe(200);
  });

  it('serves metrics as Prometheus text', async () => {
    const { app } = await build();
    const response = await app.inject({ method: 'GET', url: '/metrics' });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.body).toContain('polyhunter_up 1');
  });

  it('serves a fallback root when the web build is missing', async () => {
    const { app } = await build();
    const root = await app.inject({ method: 'GET', url: '/' });
    expect(root.statusCode).toBe(200);
    expect(root.body).toContain('PolyHunter API is running');

    const missing = await app.inject({ method: 'GET', url: '/api/nope' });
    expect(missing.statusCode).toBe(404);
    expect((missing.json() as { ok: boolean }).ok).toBe(false);
  });

  it('rejects a wrong API token and invalid query types', async () => {
    const { app } = await build({ API_TOKEN: 'top-secret' });
    const wrong = await app.inject({
      method: 'POST',
      url: '/api/control',
      headers: { 'x-api-token': 'wrong' },
      payload: { action: 'start' },
    });
    expect(wrong.statusCode).toBe(401);

    const zero = await app.inject({ method: 'GET', url: '/api/trades?limit=0' });
    expect(zero.statusCode).toBe(400);
    const text = await app.inject({ method: 'GET', url: '/api/signals?limit=nope' });
    expect(text.statusCode).toBe(400);
  });

  it('maps a control failure to 409 and a state failure to 500', async () => {
    const { app, engine } = await build();
    engine.throwOnControl = true;
    const control = await app.inject({
      method: 'POST',
      url: '/api/control',
      payload: { action: 'start' },
    });
    expect(control.statusCode).toBe(409);
    expect((control.json() as { error: { code: string } }).error.code).toBe('control_failed');

    engine.throwOnControl = false;
    engine.throwOnState = true;
    const state = await app.inject({ method: 'GET', url: '/api/state' });
    expect(state.statusCode).toBe(500);
    expect((state.json() as { error: { code: string } }).error.code).toBe('request_failed');
  });

  it('serves the built SPA and falls back to index.html for client routes', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'polyhunter-web-'));
    tempDirectories.push(directory);
    writeFileSync(join(directory, 'index.html'), '<!doctype html><title>PolyHunter test</title>');

    const { app } = await build({ WEB_DIST_PATH: directory });
    const root = await app.inject({ method: 'GET', url: '/' });
    expect(root.statusCode).toBe(200);
    expect(root.body).toContain('PolyHunter test');

    const clientRoute = await app.inject({ method: 'GET', url: '/markets' });
    expect(clientRoute.statusCode).toBe(200);
    expect(clientRoute.body).toContain('PolyHunter test');

    const apiMissing = await app.inject({ method: 'GET', url: '/api/nope' });
    expect(apiMissing.statusCode).toBe(404);
    expect((apiMissing.json() as { error: { code: string } }).error.code).toBe('not_found');
  });
});
