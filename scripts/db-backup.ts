import { mkdirSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { PolyHunterDb } from '@polyhunter/persistence';
import { loadConfig } from '../apps/server/src/config.js';

const { values } = parseArgs({
  options: {
    db: { type: 'string' },
    out: { type: 'string' },
  },
});

const config = loadConfig();
const dbPath = typeof values.db === 'string' ? values.db : config.databasePath;
if (dbPath === ':memory:') {
  console.error('Backup cannot run against an in-memory database.');
  process.exit(1);
}
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const out =
  typeof values.out === 'string'
    ? values.out
    : resolve('data/backups', `polyhunter-${stamp}.sqlite`);

mkdirSync(dirname(isAbsolute(out) ? out : resolve(process.cwd(), out)), { recursive: true }); // NOSONAR
const db = new PolyHunterDb(isAbsolute(dbPath) ? dbPath : resolve(process.cwd(), dbPath));
db.backupTo(out);
db.close();

const verification = PolyHunterDb.verify(out);
if (!verification.ok) {
  console.error(
    `Backup verification failed: integrity=${verification.integrity}, missing=${verification.missing.join(', ') || 'none'}`,
  );
  process.exit(1);
}
console.log(`Wrote ${out}`);
console.log(`integrity=${verification.integrity} tables=${verification.tables.length}`);
