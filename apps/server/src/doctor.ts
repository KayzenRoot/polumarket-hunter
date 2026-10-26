import { accessSync, constants, existsSync, mkdirSync, statfsSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, isAbsolute, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { type FetchLike, fetchGeoblock, type GeoblockResult } from '@polyhunter/polymarket';
import { type AppConfig, loadConfig } from './config.js';

export type DoctorStatus = 'pass' | 'warn' | 'fail' | 'skip';

export interface DoctorCheck {
  readonly id: string;
  readonly label: string;
  readonly status: DoctorStatus;
  readonly detail: string;
  readonly remediation: string | null;
}

export interface DoctorReport {
  readonly ok: boolean;
  readonly checks: readonly DoctorCheck[];
}

export interface DoctorOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly cwd?: string;
  readonly fetchImpl?: FetchLike;
  readonly now?: () => number;
  readonly skipNetwork?: boolean;
  readonly nodeVersion?: string;
  readonly probePort?: boolean;
}

const EXPECTED_TABLES = [
  'markets',
  'signals',
  'trades',
  'portfolio_snapshots',
  'runs',
  'events',
] as const;

function check(
  id: string,
  label: string,
  status: DoctorStatus,
  detail: string,
  remediation: string | null = null,
): DoctorCheck {
  return { id, label, status, detail, remediation };
}

function nodeCheck(version: string): DoctorCheck {
  const major = Number(version.split('.')[0]);
  if (!Number.isFinite(major)) {
    return check(
      'node',
      'Node.js',
      'fail',
      `unrecognized version ${version}`,
      'Install Node 24-26.',
    );
  }
  if (major >= 24 && major < 27) {
    return check('node', 'Node.js', 'pass', `${version} satisfies >=24 <27`);
  }
  return check(
    'node',
    'Node.js',
    'fail',
    `${version} is outside the supported range`,
    'Install Node 24-26 (see package.json engines).',
  );
}

function configCheck(env: NodeJS.ProcessEnv): {
  readonly config: AppConfig | null;
  readonly check: DoctorCheck;
} {
  try {
    const config = loadConfig(env);
    return {
      config,
      check: check(
        'config',
        'Configuration',
        'pass',
        `mode=${config.tradingMode} demo=${config.demoMode} host=${config.host}:${config.port} apiToken=${config.apiToken === null ? 'none' : 'configured'} webhook=${config.alertWebhookUrl === null ? 'none' : 'configured'}`,
      ),
    };
  } catch {
    return {
      config: null,
      check: check(
        'config',
        'Configuration',
        'fail',
        'invalid PolyHunter configuration (values omitted)',
        'Fix .env or the process environment; do not echo secrets.',
      ),
    };
  }
}

async function portCheck(host: string, port: number): Promise<DoctorCheck> {
  return new Promise((resolveCheck) => {
    const server = createServer();
    server.once('error', () => {
      resolveCheck(
        check(
          'port',
          'API port',
          'fail',
          `${host}:${port} is already in use`,
          'Stop the other process or change PORT.',
        ),
      );
    });
    server.listen(port, host, () => {
      server.close(() => {
        resolveCheck(check('port', 'API port', 'pass', `${host}:${port} is free`));
      });
    });
  });
}

function resolveDatabasePath(cwd: string, databasePath: string): string {
  if (databasePath === ':memory:') {
    return databasePath;
  }
  return isAbsolute(databasePath) ? databasePath : resolve(cwd, databasePath);
}

function databaseCheck(cwd: string, config: AppConfig): DoctorCheck {
  const path = resolveDatabasePath(cwd, config.databasePath);
  if (path === ':memory:') {
    return check('db', 'SQLite', 'pass', 'in-memory database');
  }
  if (!existsSync(path)) {
    try {
      mkdirSync(dirname(path), { recursive: true });
      accessSync(dirname(path), constants.W_OK);
      return check('db', 'SQLite', 'pass', `${path} does not exist yet; parent is writable`);
    } catch {
      return check(
        'db',
        'SQLite',
        'fail',
        `${path} does not exist and its parent is not writable`,
        'Create the data directory or fix DATABASE_PATH permissions.',
      );
    }
  }

  try {
    const database = new DatabaseSync(path, { readOnly: true });
    try {
      const integrity = database.prepare('PRAGMA integrity_check').get();
      const integrityValue = integrity?.integrity_check;
      if (integrityValue !== 'ok') {
        return check(
          'db',
          'SQLite',
          'fail',
          `integrity_check returned ${String(integrityValue)}`,
          'Restore the database from backup; do not edit it in place.',
        );
      }
      const rows = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all();
      const tables = new Set(rows.map((row) => String(row.name)));
      const missing = EXPECTED_TABLES.filter((table) => !tables.has(table));
      if (missing.length > 0) {
        return check(
          'db',
          'SQLite',
          'warn',
          `integrity ok; missing tables: ${missing.join(', ')}`,
          'Start the server once to apply migrations, then rerun doctor.',
        );
      }
      return check('db', 'SQLite', 'pass', `integrity ok; ${tables.size} tables`);
    } finally {
      database.close();
    }
  } catch (error) {
    return check(
      'db',
      'SQLite',
      'fail',
      `cannot read database: ${error instanceof Error ? error.message : String(error)}`,
      'Check the file permissions and restore from backup if corrupt.',
    );
  }
}

function diskCheck(path: string): DoctorCheck {
  try {
    const stats = statfsSync(path);
    const freeBytes = Number(stats.bavail) * Number(stats.bsize);
    const freeGb = freeBytes / 1024 ** 3;
    if (freeBytes < 100 * 1024 ** 2) {
      return check(
        'disk',
        'Disk',
        'fail',
        `${freeGb.toFixed(2)} GiB free`,
        'Free disk space before recording or backtesting.',
      );
    }
    if (freeBytes < 1024 ** 3) {
      return check('disk', 'Disk', 'warn', `${freeGb.toFixed(2)} GiB free`);
    }
    return check('disk', 'Disk', 'pass', `${freeGb.toFixed(2)} GiB free`);
  } catch (error) {
    return check(
      'disk',
      'Disk',
      'warn',
      `statfs failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function networkChecks(
  config: AppConfig,
  fetchImpl: FetchLike,
  now: () => number,
): Promise<readonly DoctorCheck[]> {
  const checks: DoctorCheck[] = [];
  try {
    const gamma = await fetchImpl(
      `${config.gammaUrl.replace(/\/+$/, '')}/markets?limit=1&active=true&closed=false`,
      {
        method: 'GET',
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(5_000),
      },
    );
    checks.push(
      gamma.ok
        ? check('provider-gamma', 'Gamma provider', 'pass', `HTTP ${gamma.status}`)
        : check(
            'provider-gamma',
            'Gamma provider',
            'fail',
            `HTTP ${gamma.status}`,
            'Check network/DNS and POLYMARKET_GAMMA_URL.',
          ),
    );
  } catch (error) {
    checks.push(
      check(
        'provider-gamma',
        'Gamma provider',
        'fail',
        `request failed: ${error instanceof Error ? error.message : String(error)}`,
        'Check network/DNS and POLYMARKET_GAMMA_URL.',
      ),
    );
  }

  let clobTimeMs: number | null = null;
  try {
    const clob = await fetchImpl(`${config.clobUrl.replace(/\/+$/, '')}/time`, {
      method: 'GET',
      headers: { accept: 'text/plain' },
      signal: AbortSignal.timeout(5_000),
    });
    if (clob.ok) {
      try {
        const seconds = Number((await clob.text()).trim());
        if (Number.isFinite(seconds) && seconds > 0) {
          clobTimeMs = seconds * 1000;
        }
      } catch {
        clobTimeMs = null;
      }
    }
    checks.push(
      clob.status >= 500
        ? check(
            'provider-clob',
            'CLOB provider',
            'fail',
            `HTTP ${clob.status}`,
            'Check network/DNS and POLYMARKET_CLOB_URL.',
          )
        : check('provider-clob', 'CLOB provider', 'pass', `reachable (HTTP ${clob.status})`),
    );
  } catch (error) {
    checks.push(
      check(
        'provider-clob',
        'CLOB provider',
        'fail',
        `request failed: ${error instanceof Error ? error.message : String(error)}`,
        'Check network/DNS and POLYMARKET_CLOB_URL.',
      ),
    );
  }

  checks.push(clockCheck(clobTimeMs, now()));
  checks.push(await geoblockCheck(config, fetchImpl, now));
  return checks;
}

function clockCheck(providerTimeMs: number | null, now: number): DoctorCheck {
  if (providerTimeMs === null) {
    return check(
      'clock',
      'Clock skew',
      'warn',
      'provider time endpoint unavailable',
      'Verify the host clock with an NTP source.',
    );
  }
  const skewMs = Math.abs(now - providerTimeMs);
  if (skewMs > 60_000) {
    return check(
      'clock',
      'Clock skew',
      'fail',
      `${Math.round(skewMs)} ms from the provider`,
      'Enable NTP/Windows time sync before trading or recording.',
    );
  }
  if (skewMs > 5_000) {
    return check(
      'clock',
      'Clock skew',
      'warn',
      `${Math.round(skewMs)} ms from the provider`,
      'Enable NTP/Windows time sync.',
    );
  }
  return check('clock', 'Clock skew', 'pass', `${Math.round(skewMs)} ms from the provider`);
}

async function geoblockCheck(
  config: AppConfig,
  fetchImpl: FetchLike,
  now: () => number,
): Promise<DoctorCheck> {
  const result: GeoblockResult = await fetchGeoblock(fetchImpl, config.geoblockUrl, 5_000, now);
  const location = result.country ?? result.region ?? 'unknown';
  if (result.status === 'ELIGIBLE') {
    return check('geoblock', 'Geoblock', 'pass', `eligible (${location})`);
  }
  if (result.status === 'BLOCKED' && config.tradingMode === 'live') {
    return check(
      'geoblock',
      'Geoblock',
      'fail',
      `blocked (${location}); live mode is not eligible`,
      'Do not bypass the venue geoblock; use paper mode.',
    );
  }
  if (result.status === 'BLOCKED') {
    return check(
      'geoblock',
      'Geoblock',
      'warn',
      `blocked (${location}); paper mode is allowed`,
      'Do not use a VPN or proxy to bypass the venue geoblock.',
    );
  }
  return check(
    'geoblock',
    'Geoblock',
    'warn',
    `unknown (${result.reason ?? 'no reason'})`,
    'Verify network access to POLYMARKET_GEOBLOCK_URL.',
  );
}

export async function runDoctor(options: DoctorOptions = {}): Promise<DoctorReport> {
  const env = options.env ?? process.env;
  const cwd = options.cwd ?? process.cwd();
  const now = options.now ?? Date.now;
  const fetchImpl = options.fetchImpl ?? ((url, init) => fetch(url, init));
  const checks: DoctorCheck[] = [];

  checks.push(nodeCheck(options.nodeVersion ?? process.versions.node));
  const configResult = configCheck(env);
  checks.push(configResult.check);

  if (configResult.config !== null) {
    const config = configResult.config;
    if (options.probePort !== false) {
      checks.push(await portCheck(config.host, config.port));
    }
    checks.push(databaseCheck(cwd, config));
    checks.push(diskCheck(cwd));
    if (options.skipNetwork === true) {
      checks.push(
        check('provider-gamma', 'Gamma provider', 'skip', 'network checks disabled'),
        check('provider-clob', 'CLOB provider', 'skip', 'network checks disabled'),
        check('clock', 'Clock skew', 'skip', 'network checks disabled'),
        check('geoblock', 'Geoblock', 'skip', 'network checks disabled'),
      );
    } else {
      checks.push(...(await networkChecks(config, fetchImpl, now)));
    }
  }

  return {
    ok: checks.every((item) => item.status !== 'fail'),
    checks,
  };
}

export function formatDoctorReport(report: DoctorReport): string {
  const lines: string[] = [report.ok ? 'PolyHunter doctor: OK' : 'PolyHunter doctor: FAIL', ''];
  for (const item of report.checks) {
    lines.push(`[${item.status.toUpperCase().padEnd(4)}] ${item.label}: ${item.detail}`);
    if (item.remediation !== null) {
      lines.push(`         ${item.remediation}`);
    }
  }
  return lines.join('\n');
}

export function doctorReportJson(report: DoctorReport): string {
  return JSON.stringify(report, null, 2);
}
