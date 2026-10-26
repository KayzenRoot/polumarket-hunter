import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FetchLike, FetchResponse } from '@polyhunter/polymarket';
import { afterEach, describe, expect, it } from 'vitest';
import {
  type DoctorCheck,
  doctorReportJson,
  formatDoctorReport,
  runDoctor,
} from '../src/doctor.js';

const tempDirectories: string[] = [];

function response(
  status: number,
  body: string,
  headers: Record<string, string> = {},
): FetchResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => JSON.parse(body) as unknown,
    text: async () => body,
    headers: { get: (name) => headers[name.toLowerCase()] ?? null },
  };
}

function networkFetch(
  options: { readonly blocked?: boolean; readonly fail?: boolean } = {},
): FetchLike {
  return async (url) => {
    if (options.fail === true) {
      throw new Error('network down');
    }
    if (url.includes('gamma-api')) {
      return response(200, '[]');
    }
    if (url.includes('/time')) {
      return response(200, '1000');
    }
    if (url.includes('geoblock')) {
      return response(
        200,
        JSON.stringify({
          blocked: options.blocked === true,
          ip: '203.0.113.10',
          country: options.blocked === true ? 'BR' : 'PT',
          region: null,
        }),
      );
    }
    return response(404, 'not found');
  };
}

function baseEnv(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    NODE_ENV: 'test',
    DATABASE_PATH: ':memory:',
    PORT: '18787',
    LOG_LEVEL: 'silent',
    ...overrides,
  };
}

function findCheck(checks: readonly DoctorCheck[], id: string): DoctorCheck {
  const found = checks.find((check) => check.id === id);
  if (found === undefined) {
    throw new Error(`missing check ${id}`);
  }
  return found;
}

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('doctor', () => {
  it('passes the local checks with a supported runtime', async () => {
    const report = await runDoctor({
      env: baseEnv(),
      nodeVersion: '26.4.0',
      skipNetwork: true,
      probePort: false,
      now: () => 1_000_000,
    });
    expect(report.ok).toBe(true);
    expect(findCheck(report.checks, 'node').status).toBe('pass');
    expect(findCheck(report.checks, 'config').status).toBe('pass');
    expect(findCheck(report.checks, 'db').status).toBe('pass');
    expect(findCheck(report.checks, 'provider-gamma').status).toBe('skip');
    expect(formatDoctorReport(report)).toContain('PolyHunter doctor: OK');
  });

  it('fails an unsupported Node runtime', async () => {
    const report = await runDoctor({
      env: baseEnv(),
      nodeVersion: '22.1.0',
      skipNetwork: true,
      probePort: false,
    });
    expect(report.ok).toBe(false);
    expect(findCheck(report.checks, 'node').status).toBe('fail');
  });

  it('fails invalid configuration without echoing values', async () => {
    const report = await runDoctor({
      env: baseEnv({ PORT: '99999', API_TOKEN: 'secret-token' }),
      skipNetwork: true,
      probePort: false,
    });
    expect(report.ok).toBe(false);
    expect(findCheck(report.checks, 'config').status).toBe('fail');
    expect(JSON.stringify(report)).not.toContain('secret-token');
  });

  it('fails when the API port is in use', async () => {
    const server = createServer();
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const address = server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('expected a TCP address');
    }
    try {
      const report = await runDoctor({
        env: baseEnv({ PORT: String(address.port) }),
        skipNetwork: true,
        probePort: true,
      });
      expect(report.ok).toBe(false);
      expect(findCheck(report.checks, 'port').status).toBe('fail');
    } finally {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }
  });

  it('fails a corrupt database and a non-directory parent', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'polyhunter-doctor-'));
    tempDirectories.push(directory);
    const corrupt = join(directory, 'corrupt.db');
    writeFileSync(corrupt, 'not a sqlite database');
    const corruptReport = await runDoctor({
      env: baseEnv({ DATABASE_PATH: corrupt }),
      skipNetwork: true,
      probePort: false,
    });
    expect(findCheck(corruptReport.checks, 'db').status).toBe('fail');

    const blocker = join(directory, 'blocker');
    writeFileSync(blocker, 'file');
    const missingReport = await runDoctor({
      env: baseEnv({ DATABASE_PATH: join(blocker, 'child.db') }),
      skipNetwork: true,
      probePort: false,
    });
    expect(findCheck(missingReport.checks, 'db').status).toBe('fail');
  });

  it('reports network failures as hard provider failures', async () => {
    const report = await runDoctor({
      env: baseEnv(),
      fetchImpl: networkFetch({ fail: true }),
      skipNetwork: false,
      probePort: false,
      now: () => 1_000_000,
    });
    expect(report.ok).toBe(false);
    expect(findCheck(report.checks, 'provider-gamma').status).toBe('fail');
    expect(findCheck(report.checks, 'provider-clob').status).toBe('fail');
    expect(findCheck(report.checks, 'clock').status).toBe('warn');
    expect(findCheck(report.checks, 'geoblock').status).toBe('warn');
  });

  it('passes eligible providers and warns on a blocked geoblock in paper mode', async () => {
    const report = await runDoctor({
      env: baseEnv(),
      fetchImpl: networkFetch({ blocked: true }),
      skipNetwork: false,
      probePort: false,
      now: () => 1_000_000,
    });
    expect(report.ok).toBe(true);
    expect(findCheck(report.checks, 'provider-gamma').status).toBe('pass');
    expect(findCheck(report.checks, 'provider-clob').status).toBe('pass');
    expect(findCheck(report.checks, 'clock').status).toBe('pass');
    expect(findCheck(report.checks, 'geoblock').status).toBe('warn');
  });

  it('fails a blocked geoblock in live mode', async () => {
    const report = await runDoctor({
      env: baseEnv({ TRADING_MODE: 'live', LIVE_TRADING_AUTHORIZED: 'true' }),
      fetchImpl: networkFetch({ blocked: true }),
      skipNetwork: false,
      probePort: false,
      now: () => 1_000_000,
    });
    expect(report.ok).toBe(false);
    expect(findCheck(report.checks, 'geoblock').status).toBe('fail');
  });

  it('emits JSON without secrets', async () => {
    const report = await runDoctor({
      env: baseEnv({ API_TOKEN: 'super-secret', ALERT_WEBHOOK_URL: 'https://secret.example/hook' }),
      skipNetwork: true,
      probePort: false,
    });
    const json = doctorReportJson(report);
    expect(json).toContain('"ok": true');
    expect(json).not.toContain('super-secret');
    expect(json).not.toContain('secret.example');
  });
});
