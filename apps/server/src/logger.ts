import pino, { type Logger } from 'pino';
import type { AppConfig } from './config.js';

export function createLogger(config: AppConfig): Logger {
  const options = {
    level: config.logLevel,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers["x-api-token"]',
        'apiKey',
        'api_key',
        'secret',
        'privateKey',
        'private_key',
        'passphrase',
        '*.apiKey',
        '*.privateKey',
        '*.secret',
      ],
      censor: '[redacted]',
    },
  };

  if (config.env === 'development' && config.logLevel !== 'silent') {
    return pino({
      ...options,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:HH:MM:ss.l',
          ignore: 'pid,hostname',
        },
      },
    });
  }

  return pino(options);
}
