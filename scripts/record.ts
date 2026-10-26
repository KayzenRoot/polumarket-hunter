import { parseArgs } from 'node:util';
import { GammaClient, MarketSocket, type TokenMetadata } from '@polyhunter/polymarket';
import { BookRecorder } from '../apps/server/src/recorder.js';

function numberOption(value: string | boolean | undefined, fallback: number): number {
  if (typeof value !== 'string') {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const { values } = parseArgs({
  options: {
    minutes: { type: 'string', default: '5' },
    markets: { type: 'string', default: '5' },
    out: { type: 'string', default: 'data/recordings' },
    both: { type: 'boolean', default: false },
    'min-liquidity': { type: 'string', default: '25000' },
  },
});

const minutes = Math.min(120, Math.max(1, numberOption(values.minutes, 5)));
const maxMarkets = Math.min(20, Math.max(1, numberOption(values.markets, 5)));
const minLiquidity = Math.max(0, numberOption(values['min-liquidity'], 25_000));
const out = typeof values.out === 'string' ? values.out : 'data/recordings';

const gamma = new GammaClient();
const markets = await gamma.listMarkets({ maxMarkets, minLiquidity });
if (markets.length === 0) {
  console.error('No eligible markets found. Try lowering --min-liquidity.');
  process.exit(1);
}

const tokens: TokenMetadata[] = [];
for (const market of markets) {
  tokens.push({
    marketId: market.id,
    tokenId: market.yesTokenId,
    outcome: 'YES',
    tickSize: market.tickSize,
  });
  if (values.both) {
    tokens.push({
      marketId: market.id,
      tokenId: market.noTokenId,
      outcome: 'NO',
      tickSize: market.tickSize,
    });
  }
}

const recorder = new BookRecorder(out);
let books = 0;
let stopping = false;
let resolveDone: (() => void) | null = null;
const done = new Promise<void>((resolve) => {
  resolveDone = resolve;
});

const socket = new MarketSocket({
  url: 'wss://ws-subscriptions-clob.polymarket.com/ws/market',
  tokens,
  onBook: (book) => {
    books += 1;
    recorder.write(book);
    if (books % 100 === 0) {
      console.log(`recorded ${books} books…`);
    }
  },
  onEvent: () => undefined,
  onStatus: (status) => {
    if (status.connected) {
      console.log(`stream connected (${tokens.length} tokens)`);
    } else if (status.error !== null) {
      console.error(`stream error: ${status.error}`);
    }
  },
});

async function stop(signal: string): Promise<void> {
  if (stopping) {
    return;
  }
  stopping = true;
  console.log(`\nstopping (${signal}); flushing…`);
  socket.close();
  await recorder.close();
  console.log(`recorded ${books} books in ${out}`);
  resolveDone?.();
}

const timer = setTimeout(() => {
  void stop(`${minutes} minute limit`);
}, minutes * 60_000);

process.on('SIGINT', () => {
  void stop('SIGINT');
});
process.on('SIGTERM', () => {
  void stop('SIGTERM');
});

console.log(
  `recording ${tokens.length} tokens from ${markets.length} markets for ${minutes} minute(s) into ${out}`,
);
socket.connect();
await done;
clearTimeout(timer);
