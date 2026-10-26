import { describe, expect, it } from 'vitest';
import { type AuditException, evaluateAudit, parseExceptions } from './audit-gate.js';

const now = new Date('2026-10-26T12:00:00.000Z');

function report(
  vulnerabilities: Record<string, { severity: string; via?: readonly unknown[] }>,
): unknown {
  return { auditReportVersion: 2, vulnerabilities };
}

function exception(overrides: Partial<AuditException> = {}): AuditException {
  return {
    id: 'https://github.com/advisories/GHSA-test',
    package: 'left-pad',
    reason: 'No patched release is available; the vulnerable path is not reachable.',
    owner: 'KayzenRoot',
    expires: '2026-11-30',
    ...overrides,
  };
}

describe('npm audit gate', () => {
  it('passes when there are no high or critical findings', () => {
    const findings = evaluateAudit(
      report({
        low: { severity: 'low', via: ['transitive'] },
        moderate: { severity: 'moderate', via: ['transitive'] },
      }),
      [],
      now,
    );
    expect(findings).toEqual([]);
  });

  it('reports high and critical findings', () => {
    const findings = evaluateAudit(
      report({
        high: {
          severity: 'high',
          via: [{ source: 1, title: 'High issue', url: 'https://example.test/high' }],
        },
        critical: {
          severity: 'critical',
          via: [{ source: 2, title: 'Critical issue', url: 'https://example.test/critical' }],
        },
      }),
      [],
      now,
    );
    expect(findings).toHaveLength(2);
    expect(findings.map((finding) => finding.severity)).toEqual(['high', 'critical']);
    expect(findings[0]?.ids).toContain('https://example.test/high');
  });

  it('suppresses a valid, time-bounded owner exception', () => {
    const findings = evaluateAudit(
      report({
        'left-pad': {
          severity: 'high',
          via: [{ source: 1, title: 'High issue', url: 'https://example.test/high' }],
        },
      }),
      [exception({ id: 'https://example.test/high' })],
      now,
    );
    expect(findings).toEqual([]);
  });

  it('fails when an exception has expired', () => {
    const findings = evaluateAudit(
      report({
        'left-pad': {
          severity: 'high',
          via: [{ source: 1, title: 'High issue', url: 'https://example.test/high' }],
        },
      }),
      [exception({ id: 'https://example.test/high', expires: '2026-10-25' })],
      now,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.exceptionProblem).toContain('expired');
  });

  it('fails when an exception is missing an owner or reason', () => {
    const findings = evaluateAudit(
      report({
        'left-pad': {
          severity: 'high',
          via: [{ source: 1, title: 'High issue', url: 'https://example.test/high' }],
        },
      }),
      [exception({ id: 'https://example.test/high', owner: ' ' })],
      now,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.exceptionProblem).toContain('owner');
  });

  it('fails closed when npm audit returns an error object', () => {
    const findings = evaluateAudit({ error: { summary: 'registry unavailable' } }, [], now);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.title).toContain('registry unavailable');
  });

  it('parses and validates the exceptions file', () => {
    const parsed = parseExceptions({
      exceptions: [
        {
          id: 'GHSA-test',
          reason: 'temporary',
          owner: 'KayzenRoot',
          expires: '2026-11-30',
          compensatingControl: 'network egress blocked',
        },
      ],
    });
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.id).toBe('GHSA-test');
    expect(() => parseExceptions({ exceptions: [{ reason: 'missing id' }] })).toThrow();
    expect(() => parseExceptions({})).toThrow();
  });
});
