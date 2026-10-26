import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export type AuditSeverity = 'info' | 'low' | 'moderate' | 'high' | 'critical';

export interface AuditException {
  readonly id?: string;
  readonly package?: string;
  readonly reason: string;
  readonly owner: string;
  readonly expires: string;
  readonly compensatingControl?: string;
}

export interface AuditFinding {
  readonly package: string;
  readonly severity: string;
  readonly ids: readonly string[];
  readonly title: string;
  readonly exceptionProblem?: string;
}

interface AuditVia {
  readonly source?: number | string;
  readonly name?: string;
  readonly title?: string;
  readonly url?: string;
  readonly severity?: string;
}

interface AuditVulnerability {
  readonly severity?: string;
  readonly via?: readonly (string | AuditVia)[];
}

interface AuditReport {
  readonly auditReportVersion?: number;
  readonly vulnerabilities?: Record<string, AuditVulnerability>;
  readonly error?: { readonly code?: string; readonly summary?: string; readonly detail?: string };
}

const HIGH_SEVERITIES = new Set(['high', 'critical']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function stringsFromVia(via: readonly (string | AuditVia)[] | undefined): string[] {
  if (via === undefined) {
    return [];
  }
  const ids: string[] = [];
  for (const entry of via) {
    if (typeof entry === 'string') {
      continue;
    }
    if (typeof entry.url === 'string' && entry.url.length > 0) {
      ids.push(entry.url);
    } else if (entry.source !== undefined) {
      ids.push(String(entry.source));
    }
  }
  return ids;
}

function titleFromVia(via: readonly (string | AuditVia)[] | undefined, fallback: string): string {
  if (via === undefined) {
    return fallback;
  }
  for (const entry of via) {
    if (typeof entry !== 'string' && typeof entry.title === 'string' && entry.title.length > 0) {
      return entry.title;
    }
  }
  return fallback;
}

function expiryTime(value: string): number | null {
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? Date.parse(`${value}T23:59:59.999Z`)
    : Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function exceptionProblem(exception: AuditException, now: Date): string | null {
  if (exception.owner.trim().length === 0) {
    return 'exception is missing an owner';
  }
  if (exception.reason.trim().length === 0) {
    return 'exception is missing a reason';
  }
  const expires = expiryTime(exception.expires);
  if (expires === null) {
    return `exception has an invalid expiry: ${exception.expires}`;
  }
  if (expires < now.getTime()) {
    return `exception expired on ${exception.expires}`;
  }
  return null;
}

function matchesException(
  exception: AuditException,
  packageName: string,
  ids: readonly string[],
): boolean {
  if (exception.package !== undefined && exception.package === packageName) {
    return true;
  }
  return exception.id !== undefined && ids.includes(exception.id);
}

export function evaluateAudit(
  report: unknown,
  exceptions: readonly AuditException[],
  now: Date = new Date(),
): AuditFinding[] {
  if (!isRecord(report)) {
    return [
      {
        package: '(unknown)',
        severity: 'critical',
        ids: [],
        title: 'npm audit returned a non-object report',
      },
    ];
  }
  const audit = report as AuditReport;
  if (audit.error !== undefined) {
    return [
      {
        package: '(audit)',
        severity: 'critical',
        ids: [],
        title: audit.error.summary ?? audit.error.detail ?? 'npm audit failed',
      },
    ];
  }
  const findings: AuditFinding[] = [];
  for (const [packageName, vulnerability] of Object.entries(audit.vulnerabilities ?? {})) {
    const severity = vulnerability.severity ?? 'unknown';
    if (!HIGH_SEVERITIES.has(severity)) {
      continue;
    }
    const ids = stringsFromVia(vulnerability.via);
    const matching = exceptions.filter((exception) =>
      matchesException(exception, packageName, ids),
    );
    if (matching.length > 0) {
      const problems = matching
        .map((exception) => exceptionProblem(exception, now))
        .filter((problem): problem is string => problem !== null);
      if (problems.length === 0) {
        continue;
      }
      findings.push({
        package: packageName,
        severity,
        ids,
        title: titleFromVia(vulnerability.via, packageName),
        exceptionProblem: problems.join('; '),
      });
      continue;
    }
    findings.push({
      package: packageName,
      severity,
      ids,
      title: titleFromVia(vulnerability.via, packageName),
    });
  }
  return findings;
}

export function parseExceptions(raw: unknown): AuditException[] {
  if (!isRecord(raw) || !Array.isArray(raw.exceptions)) {
    throw new Error('audit exceptions file must contain an "exceptions" array');
  }
  return raw.exceptions.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new Error(`audit exception ${index} must be an object`);
    }
    const id = typeof entry.id === 'string' ? entry.id : undefined;
    const packageName = typeof entry.package === 'string' ? entry.package : undefined;
    if (id === undefined && packageName === undefined) {
      throw new Error(`audit exception ${index} must define id or package`);
    }
    if (typeof entry.reason !== 'string') {
      throw new Error(`audit exception ${index} must define reason`);
    }
    if (typeof entry.owner !== 'string') {
      throw new Error(`audit exception ${index} must define owner`);
    }
    if (typeof entry.expires !== 'string') {
      throw new Error(`audit exception ${index} must define expires`);
    }
    return {
      ...(id !== undefined ? { id } : {}),
      ...(packageName !== undefined ? { package: packageName } : {}),
      reason: entry.reason,
      owner: entry.owner,
      expires: entry.expires,
      ...(typeof entry.compensatingControl === 'string'
        ? { compensatingControl: entry.compensatingControl }
        : {}),
    };
  });
}

function loadExceptions(path: string): AuditException[] {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  return parseExceptions(raw);
}

function runNpmAudit(): unknown {
  const npmCli = process.env.npm_execpath;
  const command = npmCli === undefined ? 'npm' : process.execPath;
  const args = npmCli === undefined ? ['audit', '--json'] : [npmCli, 'audit', '--json'];
  let stdout = '';
  try {
    stdout = execFileSync(command, args, {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
      shell: npmCli === undefined && process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    const candidate = error as { stdout?: string | Buffer; stderr?: string | Buffer };
    stdout = candidate.stdout?.toString() ?? '';
    if (stdout.length === 0) {
      const stderr = candidate.stderr?.toString() ?? '';
      throw new Error(`npm audit did not return JSON${stderr.length > 0 ? `: ${stderr}` : ''}`);
    }
  }
  return JSON.parse(stdout) as unknown;
}

function main(): void {
  const exceptionsPath = process.env.AUDIT_EXCEPTIONS_PATH ?? 'security/audit-exceptions.json';
  const exceptions = loadExceptions(exceptionsPath);
  const report = runNpmAudit();
  const findings = evaluateAudit(report, exceptions, new Date());
  if (findings.length === 0) {
    console.log('npm audit: no high or critical vulnerabilities');
    return;
  }
  console.error(`npm audit: ${findings.length} high/critical finding(s)`);
  for (const finding of findings) {
    const ids = finding.ids.length > 0 ? ` [${finding.ids.join(', ')}]` : '';
    const exception = finding.exceptionProblem ? ` (${finding.exceptionProblem})` : '';
    console.error(`- ${finding.package} (${finding.severity})${ids}: ${finding.title}${exception}`);
  }
  process.exitCode = 1;
}

const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  main();
}
