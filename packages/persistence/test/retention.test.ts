import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makePortfolio, makeSession, makeSignal, makeTrade } from '@polyhunter/testkit';
import { describe, expect, it } from 'vitest';
import { PolyHunterDb } from '../src/index.js';

function seed(db: PolyHunterDb): void {
  db.insertRun(makeSession({ id: 'old-stopped', startedAt: 1000, status: 'stopped' }));
  db.insertRun(makeSession({ id: 'old-running', startedAt: 2000, status: 'running' }));
  db.insertRun(makeSession({ id: 'recent', startedAt: 5000, status: 'stopped' }));
  db.insertTrade(makeTrade({ id: 'old-trade', at: 1000 }), 'old-stopped');
  db.insertTrade(makeTrade({ id: 'running-trade', at: 2000 }), 'old-running');
  db.insertSignal(makeSignal({ id: 'recent-signal', at: 5000 }), 'recent');
  db.insertPortfolioSnapshot(makePortfolio({ updatedAt: 1000 }), 'old-stopped');
  db.insertEvent({ at: 1000, kind: 'old', severity: 'info', message: 'old', details: null });
}

describe('data retention', () => {
  it('dry-runs prune without deleting rows', () => {
    const db = PolyHunterDb.inMemory();
    seed(db);
    const counts = db.pruneBefore({ before: 3000, dryRun: true });
    expect(counts).toMatchObject({ sessions: 1, trades: 1, snapshots: 1, events: 1 });
    expect(db.listRuns()).toHaveLength(3);
    expect(db.listTrades()).toHaveLength(2);
    db.close();
  });

  it('prunes old rows while keeping the active session and explicit keeps', () => {
    const db = PolyHunterDb.inMemory();
    seed(db);
    const counts = db.pruneBefore({
      before: 3000,
      keepSessionIds: ['recent'],
      dryRun: false,
    });
    expect(counts.sessions).toBe(1);
    expect(db.getRun('old-stopped')).toBeNull();
    expect(db.getRun('old-running')).not.toBeNull();
    expect(db.getRun('recent')).not.toBeNull();
    expect(db.listSessionTrades('old-stopped')).toHaveLength(0);
    expect(db.listSessionTrades('old-running')).toHaveLength(1);
    expect(db.listEvents().map((event) => event.kind)).not.toContain('old');
    db.close();
  });

  it('backs up and verifies a copy', () => {
    const directory = mkdtempSync(join(tmpdir(), 'polyhunter-retention-'));
    const source = join(directory, 'source.db');
    const backup = join(directory, 'backup.db');
    const db = new PolyHunterDb(source);
    seed(db);
    db.backupTo(backup);
    const verification = PolyHunterDb.verify(backup);
    expect(verification.ok).toBe(true);
    expect(verification.missing).toEqual([]);

    const copy = new PolyHunterDb(backup);
    expect(copy.listRuns()).toHaveLength(3);
    copy.close();
    db.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it('does not verify a corrupt database', () => {
    const directory = mkdtempSync(join(tmpdir(), 'polyhunter-retention-'));
    const corrupt = join(directory, 'corrupt.db');
    writeFileSync(corrupt, 'not a sqlite database');
    expect(() => PolyHunterDb.verify(corrupt)).toThrow();
    rmSync(directory, { recursive: true, force: true });
  });
});
