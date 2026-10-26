import { readFileSync } from 'node:fs';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createLogger } from '../src/logger.js';
import { OPENAPI_DOCUMENT, OPENAPI_PATH } from '../src/openapi.js';
import { FakeEngine, makeState } from './fake-engine.js';

const apps: FastifyInstance[] = [];

function config() {
  return loadConfig({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    WEB_DIST_PATH: 'apps/does-not-exist',
  });
}

async function build(): Promise<FastifyInstance> {
  const loaded = config();
  const logger = createLogger({ ...loaded, logLevel: 'silent' });
  const app = await buildApp({ engine: new FakeEngine(makeState()), config: loaded, logger });
  apps.push(app);
  return app;
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

function buildPath(parts: readonly string[]): string {
  let path = '';
  for (const part of parts) {
    if (part === '/') {
      path = '/';
    } else if (part.startsWith('.')) {
      path += part;
    } else if (part.startsWith('/')) {
      path += part;
    } else {
      path += path.endsWith('/') ? part : `/${part}`;
    }
  }
  return path;
}

export function parseRouteTree(tree: string): string[] {
  const stack: string[] = [];
  const routes: string[] = [];
  for (const line of tree.split(/\r?\n/)) {
    const match = /^((?:│ {3}| {4})*)[├└]── (.*)$/u.exec(line);
    if (match === null) {
      continue;
    }
    const prefix = match[1] ?? '';
    const label = match[2] ?? '';
    const depth = prefix.length / 4;
    const methodMatch = /^(.*) \(([^)]+)\)$/u.exec(label);
    if (methodMatch === null) {
      continue;
    }
    const segment = methodMatch[1]?.trim() ?? '';
    if (segment === '*') {
      continue;
    }
    stack[depth] = segment;
    stack.length = depth + 1;
    const path = buildPath(stack);
    const methods = (methodMatch[2] ?? '')
      .split(',')
      .map((method) => method.trim().toUpperCase())
      .filter((method) => method !== 'HEAD' && method !== 'OPTIONS');
    for (const method of methods) {
      routes.push(`${method} ${path}`);
    }
  }
  return routes.sort();
}

function documentedRoutes(): string[] {
  const routes: string[] = [];
  for (const [path, operations] of Object.entries(OPENAPI_DOCUMENT.paths)) {
    for (const method of Object.keys(operations)) {
      routes.push(`${method.toUpperCase()} ${path.replace(/\{([^}]+)\}/gu, ':$1')}`);
    }
  }
  return routes.sort();
}

describe('OpenAPI contract', () => {
  it('serves the checked-in document at /openapi.json', async () => {
    const app = await build();
    const response = await app.inject({ method: 'GET', url: OPENAPI_PATH });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('application/json');
    expect(response.json()).toEqual(OPENAPI_DOCUMENT);
  });

  it('keeps docs/openapi.json in sync with the source document', () => {
    const snapshot = JSON.parse(readFileSync('docs/openapi.json', 'utf8')) as unknown;
    expect(snapshot).toEqual(OPENAPI_DOCUMENT);
  });

  it('covers every registered public route and no ghost route', async () => {
    const app = await build();
    const actual = parseRouteTree(app.printRoutes({ commonPrefix: false }));
    const documented = documentedRoutes();
    expect(actual).toEqual(documented);
  });

  it('documents a 200 response for every operation', () => {
    for (const operations of Object.values(OPENAPI_DOCUMENT.paths)) {
      for (const operation of Object.values(operations)) {
        expect(operation.responses['200']).toBeDefined();
      }
    }
  });
});
