import { existsSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { PolyHunterDb } from '@polyhunter/persistence';
import { loadConfig } from '../apps/server/src/config.js';
import { numberOption } from './args.js';

const { values } = parseArgs({
  options: {
    db: { type: 'string' },
    days: { type: 'string' },
    'keep-session': { type: 'string', multiple: true },
    'dry-run': { type: 'boolean', default: false },
    'recordings-dir': { type: 'string' },
    'recording-days': { type: 'string' },
    json: { type: 'boolean', default: false },
  },
});

const config = loadConfig();
const dbPath = typeof values.db === 'string' ? values.db : config.databasePath;
if (dbPath === ':memory:') {
  console.error('Retention cannot run against an in-memory database.');
  process.exit(1);
}
const days = numberOption(values.days, config.retentionDays);
const before = Date.now() - days * 24 * 60 * 60 * 1000;
const dryRun = values['dry-run'];
const keepSessions = values['keep-session'] ?? [];

const db = new PolyHunterDb(isAbsolute(dbPath) ? dbPath : resolve(process.cwd(), dbPath));
const counts = db.pruneBefore({ before, keepSessionIds: keepSessions, dryRun });
db.close();

const recordingsDir =
  typeof values['recordings-dir'] === 'string' ? values['recordings-dir'] : config.recordDir;
const recordingDays = numberOption(values['recording-days'], config.recordingRetentionDays);
const recordingCutoff = Date.now() - recordingDays * 24 * 60 * 60 * 1000;
let recordingFiles = 0;
let recordingBytes = 0;
if (existsSync(recordingsDir)) {
  for (const name of readdirSync(recordingsDir)) {
    if (!name.endsWith('.jsonl')) {
      continue;
    }
    const path = resolve(recordingsDir, name);
    const stat = statSync(path);
    if (stat.mtimeMs >= recordingCutoff) {
      continue;
    }
    recordingFiles += 1;
    recordingBytes += stat.size;
    if (!dryRun) {
      unlinkSync(path); // NOSONAR: local operator prune, root is configured
    }
  }
}

const report = {
  dryRun,
  database: counts,
  recordings: { files: recordingFiles, bytes: recordingBytes },
  cutoff: new Date(before).toISOString(),
  keepSessions,
};

if (values.json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`${dryRun ? 'Would prune' : 'Pruned'} SQLite rows before ${report.cutoff}`);
  console.log(
    `sessions=${counts.sessions} trades=${counts.trades} signals=${counts.signals} snapshots=${counts.snapshots} events=${counts.events}`,
  );
  console.log(
    `${dryRun ? 'Would remove' : 'Removed'} ${recordingFiles} recording file(s), ${(recordingBytes / 1024 ** 2).toFixed(1)} MiB`,
  );
  if (keepSessions.length > 0) {
    console.log(`kept sessions: ${keepSessions.join(', ')}`);
  }
}
