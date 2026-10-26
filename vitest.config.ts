import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const fromRoot = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@polyhunter/core': fromRoot('./packages/core/src/index.ts'),
      '@polyhunter/polymarket': fromRoot('./packages/polymarket/src/index.ts'),
      '@polyhunter/persistence': fromRoot('./packages/persistence/src/index.ts'),
      '@polyhunter/testkit': fromRoot('./packages/testkit/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
    include: [
      'packages/**/test/**/*.test.ts',
      'apps/server/test/**/*.test.ts',
      'scripts/**/*.test.ts',
    ],
    exclude: ['**/node_modules/**', '**/dist/**', '**/test-results/**'],
    testTimeout: 15_000,
    hookTimeout: 15_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: 'coverage',
      include: [
        'packages/core/src/**/*.ts',
        'packages/polymarket/src/**/*.ts',
        'packages/persistence/src/**/*.ts',
        'apps/server/src/**/*.ts',
      ],
      exclude: [
        '**/index.ts',
        '**/*.d.ts',
        'apps/server/src/main.ts',
        'packages/core/src/synthetic.ts',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
  },
});
