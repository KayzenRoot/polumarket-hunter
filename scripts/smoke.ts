import { type OrderBook, topOfBook } from '@polyhunter/core';
import {
  ClobClient,
  GammaClient,
  GeoblockGate,
  MarketSocket,
  mapRawBook,
  type TokenMetadata,
} from '@polyhunter/polymarket';

async function waitForBook(
  url: string,
  token: TokenMetadata,
  timeoutMs = 20_000,
): Promise<OrderBook> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error(`timed out waiting for a market stream book after ${timeoutMs}ms`));
    }, timeoutMs);

    const socket = new MarketSocket({
      url,
      tokens: [token],
      onBook: (book) => {
        clearTimeout(timer);
        socket.close();
        resolve(book);
      },
      onStatus: (status) => {
        if (status.error !== null) {
          clearTimeout(timer);
          socket.close();
          reject(new Error(status.error));
        }
      },
    });
    socket.connect();
  });
}

async function main(): Promise<void> {
  let failures = 0;
  const gamma = new GammaClient();
  const clob = new ClobClient();
  const geoblock = new GeoblockGate();

  console.log('PolyHunter smoke test');
  console.log('=====================');

  const markets = await gamma.listMarkets({ maxMarkets: 3, minLiquidity: 1_000 });
  console.log(`Gamma: ${markets.length} active markets`);
  for (const market of markets) {
    console.log(`  - ${market.question} (liq ${market.liquidity.toFixed(0)})`);
  }
  const market = markets[0];
  if (market === undefined) {
    console.error('FAIL: Gamma returned no usable markets');
    process.exitCode = 1;
    return;
  }

  const token: TokenMetadata = {
    marketId: market.id,
    tokenId: market.yesTokenId,
    outcome: 'YES',
    tickSize: market.tickSize,
  };

  try {
    const raw = await clob.getBook(token.tokenId);
    const book = mapRawBook(raw, token);
    const top = topOfBook(book);
    console.log(
      `CLOB: bid ${top?.bid ?? '—'} / ask ${top?.ask ?? '—'} / spread ${top?.spread ?? '—'} @ ${new Date(book.timestamp).toISOString()}`,
    );
  } catch (error) {
    failures += 1;
    console.error(
      `FAIL: CLOB book request failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  try {
    const book = await waitForBook('wss://ws-subscriptions-clob.polymarket.com/ws/market', token);
    console.log(
      `WS: book received for ${book.tokenId.slice(0, 8)}… (${book.bids.length} bids / ${book.asks.length} asks)`,
    );
  } catch (error) {
    failures += 1;
    console.error(
      `FAIL: market stream failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const geo = await geoblock.ensureFresh();
  console.log(`Geoblock: ${geo.status}${geo.country ? ` (${geo.country})` : ''}`);
  if (geo.reason !== null) {
    console.log(`  ${geo.reason}`);
  }
  if (geo.status === 'BLOCKED') {
    console.log('  Live order submission is blocked; paper mode is the intended operating mode.');
  } else if (geo.status === 'UNKNOWN') {
    console.log('  Geoblock could not be confirmed; live mode stays fail-closed.');
  }

  if (failures > 0) {
    console.error(`Smoke test finished with ${failures} failure(s).`);
    process.exitCode = 1;
    return;
  }
  console.log('Smoke test passed: public data surfaces are reachable.');
}

main().catch((error: unknown) => {
  console.error('Smoke test crashed:', error);
  process.exitCode = 1;
});
