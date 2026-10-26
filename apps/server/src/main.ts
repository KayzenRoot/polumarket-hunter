import 'dotenv/config';
import { mkdirSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { PolyHunterDb } from '@polyhunter/persistence';
import { ClobClient, GammaClient, GeoblockGate } from '@polyhunter/polymarket';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { PolyHunterEngine } from './engine.js';
import { createLogger } from './logger.js';

function ensureParent(path: string): void {
  if (path === ':memory:') {
    return;
  }
  mkdirSync(dirname(isAbsolute(path) ? path : resolve(process.cwd(), path)), { recursive: true });
}

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config);
  ensureParent(config.databasePath);

  const db = new PolyHunterDb(config.databasePath);
  const gamma = new GammaClient({
    baseUrl: config.gammaUrl,
    now: Date.now,
  });
  const clob = new ClobClient({ baseUrl: config.clobUrl });
  const geoblock = new GeoblockGate({ url: config.geoblockUrl });

  const engine = new PolyHunterEngine({
    config,
    db,
    logger,
    gamma,
    clob,
    geoblock,
    alertSink: async (alert) => {
      if (config.alertWebhookUrl === null) {
        return;
      }
      try {
        const response = await fetch(config.alertWebhookUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(alert),
          signal: AbortSignal.timeout(5_000),
        });
        if (!response.ok) {
          logger.warn(
            { status: response.status, kind: alert.kind },
            'alert webhook rejected the notification',
          );
        }
      } catch (error) {
        logger.warn({ err: error, kind: alert.kind }, 'alert webhook failed');
      }
    },
  });

  const app = await buildApp({ engine, config, logger });
  await app.listen({ host: config.host, port: config.port });
  logger.info(
    {
      url: `http://${config.host}:${config.port}`,
      mode: config.tradingMode,
      demo: config.demoMode,
    },
    'PolyHunter server listening',
  );

  if (process.env.POLYHUNTER_AUTOSTART !== 'false') {
    void engine.start().catch((error: unknown) => {
      logger.error({ err: error }, 'engine autostart failed; API remains available');
    });
  }

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.info({ signal }, 'shutting down');
    try {
      engine.stop();
      await app.close();
      db.close();
    } catch (error) {
      logger.error({ err: error }, 'shutdown failed');
    }
    process.exit(0);
  };

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
  process.on('unhandledRejection', (reason) => {
    logger.error({ err: reason }, 'unhandled rejection');
  });
  process.on('uncaughtException', (error) => {
    logger.error({ err: error }, 'uncaught exception');
  });
}

main().catch((error: unknown) => {
  console.error('[polyhunter] fatal startup error', error);
  process.exit(1);
});
