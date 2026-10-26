import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PolyHunterDb } from '@polyhunter/persistence';
import { makeSession } from '@polyhunter/testkit';
import { afterEach, describe, expect, it } from 'vitest';
import { restoreDatabase } from '../src/backup.js';

const directories: string[] = [];

function tempDb(name = 'db.sqlite'): { directory: string; path: string } {
  const directory = mkdtempSync(join(tmpdir(), 'polyhunter-backup-'));
  directories.push(directory);
  return { directory, path: join(directory, name) };
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('database restore', () => {
  it('restores a verified backup and keeps a safety copy', () => {
    const { directory, path } = tempDb();
    const backup = join(directory, 'backup.sqlite');
    const source = new PolyHunterDb(path);
    source.insertRun(makeSession({ id: 'kept-session', status: 'stopped', startedAt: 1_000 }));
    source.backupTo(backup);
    source.pruneBefore({ before: Date.now() + 1_000, dryRun: false });
    source.close();

    const result = restoreDatabase({ backupPath: backup, targetPath: path, force: true });
    expect(result.safetyPath).not.toBeNull();
    expect(existsSync(result.safetyPath ?? '')).toBe(true);

    const restored = new PolyHunterDb(path);
    expect(restored.listRuns().map((run) => run.id)).toContain('kept-session');
    restored.close();
  });

  it('refuses to replace an existing database without force', () => {
    const { directory, path } = tempDb();
    const backup = join(directory, 'backup.sqlite');
    const db = new PolyHunterDb(path);
    db.backupTo(backup);
    db.close();

    expect(() => restoreDatabase({ backupPath: backup, targetPath: path })).toThrow(/--force/);
  });

  it('refuses a corrupt backup', () => {
    const { directory, path } = tempDb();
    const backup = join(directory, 'corrupt.sqlite');
    writeFileSync(backup, 'not a database');
    expect(() => restoreDatabase({ backupPath: backup, targetPath: path, force: true })).toThrow(
      /backup failed verification/,
    );
  });
});
