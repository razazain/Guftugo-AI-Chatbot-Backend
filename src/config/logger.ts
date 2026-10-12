import pino from 'pino';
import { env } from './env';

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.passwordHash', '*.apiKey', '*.token', '*.refreshToken'],
    censor: '[REDACTED]',
  },
  base: { service: 'guftugo-backend', environment: env.NODE_ENV },
  transport: env.NODE_ENV === 'development' ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } } : undefined,
});
