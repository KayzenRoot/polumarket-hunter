import { parseArgs } from 'node:util';
import { restoreDatabase } from '../apps/server/src/backup.js';
import { loadConfig } from '../apps/server/src/config.js';

const { values } = parseArgs({
  options: {
    file: { type: 'string' },
    db: { type: 'string' },
    force: { type: 'boolean', default: false },
    yes: { type: 'boolean', default: false },
  },
});

if (typeof values.file !== 'string') {
  console.error('Usage: npm run db:restore -- --file data/backups/<file>.sqlite --yes [--force]');
  process.exit(1);
}
if (values.yes !== true) {
  console.error('Refusing to replace a database without --yes.');
  process.exit(1);
}

const config = loadConfig();
const target = typeof values.db === 'string' ? values.db : config.databasePath;
if (target === ':memory:') {
  console.error('Restore cannot target an in-memory database.');
  process.exit(1);
}

try {
  const result = restoreDatabase({
    backupPath: values.file,
    targetPath: target,
    force: values.force,
  });
  console.log(`Restored ${result.targetPath} from ${result.backupPath}`);
  if (result.safetyPath !== null) {
    console.log(`Previous database copied to ${result.safetyPath}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
