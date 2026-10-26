import { timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import Fastify, {
  type FastifyBaseLogger,
  type FastifyError,
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
  LogController,
} from 'fastify';
import type { Logger } from 'pino';
import { z } from 'zod';
import type { AppConfig } from './config.js';
import type { EnginePort } from './ports.js';

export interface BuildAppOptions {
  readonly engine: EnginePort;
  readonly config: AppConfig;
  readonly logger: Logger;
}

const controlSchema = z.object({
  action: z.enum(['start', 'stop', 'kill', 'reset-kill']),
});

const tokenParamsSchema = z.object({
  tokenId: z.string().min(1).max(256),
});

const limitQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional().default(100),
});

function ok<T>(data: T): { ok: true; data: T } {
  return { ok: true, data };
}

function fail(
  code: string,
  message: string,
): { ok: false; error: { code: string; message: string } } {
  return { ok: false, error: { code, message } };
}

function safeTokenEquals(expected: string, received: string): boolean {
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  if (expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }
  return timingSafeEqual(expectedBuffer, receivedBuffer);
}

async function requireApiToken(
  config: AppConfig,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (config.apiToken === null) {
    return;
  }
  const header = request.headers['x-api-token'];
  if (typeof header !== 'string' || !safeTokenEquals(config.apiToken, header)) {
    await reply.code(401).send(fail('unauthorized', 'missing or invalid x-api-token'));
  }
}

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const { engine, config, logger } = options;
  const app = Fastify({
    loggerInstance: logger as unknown as FastifyBaseLogger,
    logController: new LogController({ disableRequestLogging: true }),
    trustProxy: false,
    bodyLimit: 64 * 1024,
  });

  await app.register(cors, {
    origin:
      config.env === 'production' ? false : ['http://127.0.0.1:5173', 'http://localhost:5173'],
    methods: ['GET', 'POST'],
    allowedHeaders: ['content-type', 'x-api-token'],
    maxAge: 600,
  });

  await app.register(rateLimit, {
    max: 240,
    timeWindow: '1 minute',
    allowList: [],
  });

  app.addHook('onSend', async (_request, reply, payload) => {
    reply.header('x-content-type-options', 'nosniff');
    reply.header('x-frame-options', 'DENY');
    reply.header('referrer-policy', 'no-referrer');
    reply.header('permissions-policy', 'camera=(), microphone=(), geolocation=()');
    if (config.env === 'production') {
      reply.header(
        'content-security-policy',
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
      );
    }
    return payload;
  });

  app.get('/api/health', async () => ok(engine.health()));
  app.get('/api/state', async () => ok(engine.state()));
  app.get('/api/markets', async () => ok(engine.state().markets));
  app.get('/api/portfolio', async () => ok(engine.portfolio()));
  app.get('/api/risk', async () => ok(engine.risk()));

  app.get('/api/markets/:tokenId', async (request, reply) => {
    const parsed = tokenParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.code(400).send(fail('invalid_params', 'tokenId is required'));
    }
    const detail = engine.marketDetail(parsed.data.tokenId);
    if (detail === null) {
      return reply.code(404).send(fail('not_found', 'market not found'));
    }
    return ok(detail);
  });

  app.get('/api/trades', async (request, reply) => {
    const parsed = limitQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send(fail('invalid_query', 'limit must be between 1 and 500'));
    }
    return ok(engine.trades(parsed.data.limit));
  });

  app.get('/api/signals', async (request, reply) => {
    const parsed = limitQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send(fail('invalid_query', 'limit must be between 1 and 500'));
    }
    return ok(engine.signals(parsed.data.limit));
  });

  app.post(
    '/api/control',
    {
      preHandler: async (request, reply) => requireApiToken(config, request, reply),
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const parsed = controlSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send(fail('invalid_control', 'action must be start, stop, kill or reset-kill'));
      }
      try {
        await engine.control(parsed.data.action);
        return ok(engine.state());
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return reply.code(409).send(fail('control_failed', message));
      }
    },
  );

  app.get('/api/stream', async (request, reply) => {
    reply.hijack();
    reply.raw.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
      'x-content-type-options': 'nosniff',
    });

    const send = (state: ReturnType<EnginePort['state']>): void => {
      reply.raw.write(`event: state\ndata: ${JSON.stringify(state)}\n\n`);
    };

    send(engine.state());
    const unsubscribe = engine.subscribe(send);
    const heartbeat = setInterval(() => {
      reply.raw.write(': keep-alive\n\n');
    }, 15_000);

    request.raw.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
      reply.raw.end();
    });
  });

  app.get('/metrics', async (_request, reply) => {
    return reply.type('text/plain; version=0.0.4; charset=utf-8').send(engine.metrics());
  });

  const webDist = resolve(process.cwd(), config.webDistPath);
  if (existsSync(webDist)) {
    await app.register(fastifyStatic, {
      root: webDist,
      prefix: '/',
      wildcard: false,
    });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/') || request.url === '/metrics') {
        return reply.code(404).send(fail('not_found', 'route not found'));
      }
      return reply.sendFile('index.html');
    });
  } else {
    app.get('/', async (_request, reply) => {
      return reply
        .type('text/plain; charset=utf-8')
        .send('PolyHunter API is running. Build the dashboard with `npm run build:web`.');
    });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/')) {
        return reply.code(404).send(fail('not_found', 'route not found'));
      }
      return reply.code(404).send(fail('not_found', 'web build not found'));
    });
  }

  app.setErrorHandler((error: FastifyError, request, reply) => {
    logger.error({ err: error, url: request.url, method: request.method }, 'request failed');
    if (reply.sent) {
      return;
    }
    const statusCode =
      typeof error.statusCode === 'number' && error.statusCode >= 400 ? error.statusCode : 500;
    const message = statusCode >= 500 ? 'internal server error' : error.message;
    reply.code(statusCode).send(fail('request_failed', message));
  });

  return app;
}
