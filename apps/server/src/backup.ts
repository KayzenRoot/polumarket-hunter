import { copyFileSync, existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { PolyHunterDb } from '@polyhunter/persistence';

export interface RestoreOptions {
  readonly backupPath: string;
  readonly targetPath: string;
  readonly force?: boolean;
}

export interface RestoreResult {
  readonly backupPath: string;
  readonly targetPath: string;
  readonly safetyPath: string | null;
}

export function restoreDatabase(options: RestoreOptions): RestoreResult {
  const backupPath = resolve(options.backupPath);
  const targetPath = resolve(options.targetPath);
  if (!existsSync(backupPath)) {
    throw new Error(`backup not found: ${backupPath}`);
  }

  const verification = (() => {
    try {
      return PolyHunterDb.verify(backupPath);
    } catch (error) {
      throw new Error(
        `backup failed verification: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  })();
  if (!verification.ok) {
    throw new Error(
      `backup failed verification: integrity=${verification.integrity}, missing=${verification.missing.join(', ') || 'none'}`,
    );
  }

  let safetyPath: string | null = null;
  if (existsSync(targetPath)) {
    if (options.force !== true) {
      throw new Error('target database exists; pass --force to replace it');
    }
    safetyPath = `${targetPath}.before-restore-${Date.now()}.bak`;
    copyFileSync(targetPath, safetyPath);
  }

  rmSync(`${targetPath}-wal`, { force: true });
  rmSync(`${targetPath}-shm`, { force: true });
  copyFileSync(backupPath, targetPath);

  const restored = (() => {
    try {
      return PolyHunterDb.verify(targetPath);
    } catch (error) {
      throw new Error(
        `restored database failed verification: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  })();
  if (!restored.ok) {
    throw new Error(
      `restored database failed verification: integrity=${restored.integrity}, missing=${restored.missing.join(', ') || 'none'}`,
    );
  }

  return { backupPath, targetPath, safetyPath };
}
