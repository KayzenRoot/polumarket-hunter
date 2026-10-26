import { mkdirSync, writeFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { PolyHunterDb } from '@polyhunter/persistence';
import { loadConfig } from '../apps/server/src/config.js';

function cell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function row(cells: readonly unknown[]): string {
  return cells.map(cell).join(',');
}

const { values } = parseArgs({
  options: {
    db: { type: 'string' },
    session: { type: 'string' },
    out: { type: 'string', default: 'data/exports' },
  },
});

if (typeof values.session !== 'string') {
  console.error(
    'Usage: npm run data:export -- --session <id> [--db data/polyhunter.db] [--out data/exports]',
  );
  process.exit(1);
}

const config = loadConfig();
const dbPath = typeof values.db === 'string' ? values.db : config.databasePath;
if (dbPath === ':memory:') {
  console.error('Export cannot run against an in-memory database.');
  process.exit(1);
}
const out = typeof values.out === 'string' ? values.out : 'data/exports';
mkdirSync(isAbsolute(out) ? out : resolve(process.cwd(), out), { recursive: true }); // NOSONAR

const db = new PolyHunterDb(isAbsolute(dbPath) ? dbPath : resolve(process.cwd(), dbPath));
const session = db.getRun(values.session);
if (session === null) {
  console.error(`Session not found: ${values.session}`);
  db.close();
  process.exit(1);
}
const trades = db.listSessionTrades(values.session);
const signals = db.listSessionSignals(values.session);
db.close();

const tradeLines = [
  row([
    'id',
    'at',
    'marketId',
    'tokenId',
    'outcome',
    'side',
    'price',
    'size',
    'notional',
    'fee',
    'realizedPnl',
    'orderId',
    'mode',
  ]),
  ...trades.map((trade) =>
    row([
      trade.id,
      trade.at,
      trade.marketId,
      trade.tokenId,
      trade.outcome,
      trade.side,
      trade.price,
      trade.size,
      trade.notional,
      trade.fee,
      trade.realizedPnl,
      trade.orderId,
      trade.mode,
    ]),
  ),
];
const signalLines = [
  row([
    'id',
    'at',
    'marketId',
    'tokenId',
    'outcome',
    'action',
    'fairValue',
    'marketPrice',
    'edge',
    'confidence',
    'accepted',
    'reasons',
  ]),
  ...signals.map((signal) =>
    row([
      signal.id,
      signal.at,
      signal.marketId,
      signal.tokenId,
      signal.outcome,
      signal.action,
      signal.fairValue,
      signal.marketPrice,
      signal.edge,
      signal.confidence,
      signal.accepted,
      signal.reasons.join(' | '),
    ]),
  ),
];

const tradesPath = resolve(out, `trades-${values.session}.csv`);
const signalsPath = resolve(out, `signals-${values.session}.csv`);
writeFileSync(tradesPath, `${tradeLines.join('\n')}\n`); // NOSONAR
writeFileSync(signalsPath, `${signalLines.join('\n')}\n`); // NOSONAR
console.log(`Wrote ${tradesPath} (${trades.length} trades)`);
console.log(`Wrote ${signalsPath} (${signals.length} signals)`);
