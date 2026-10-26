import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const FIXTURE = 'tests/fixtures/service-config.json';

function parseExpectations(raw: unknown): Record<string, string[]> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('service-config fixture must be an object');
  }
  const parsed: Record<string, string[]> = {};
  for (const [path, fragments] of Object.entries(raw)) {
    if (!Array.isArray(fragments) || !fragments.every((value) => typeof value === 'string')) {
      throw new Error(`service-config fixture for ${path} must be a string array`);
    }
    parsed[path] = fragments;
  }
  return parsed;
}

describe('process supervisor recipes', () => {
  it('contains the required restart, logging and rotation directives', () => {
    const expectations = parseExpectations(JSON.parse(readFileSync(FIXTURE, 'utf8')) as unknown);
    for (const [path, fragments] of Object.entries(expectations)) {
      const content = readFileSync(path, 'utf8');
      for (const fragment of fragments) {
        expect(content, `${path} should contain ${fragment}`).toContain(fragment);
      }
    }
  });
});
