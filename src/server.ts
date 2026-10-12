import app from './app';
import { connectDatabase, disconnectDatabase } from './config/database';
import { env } from './config/env';
import { logger } from './config/logger';

let server: ReturnType<typeof app.listen> | undefined;
let shuttingDown = false;

async function start() {
  await connectDatabase();
  server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, apiPrefix: env.API_PREFIX, primaryProvider: env.LLM_PROVIDER }, 'Guftugo API listening');
  });
}

async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Graceful shutdown started');
  if (server) {
    await new Promise<void>((resolve) => server!.close(() => resolve()));
  }
  await disconnectDatabase();
  logger.info('Graceful shutdown complete');
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

start().catch((error: unknown) => {
  logger.fatal({ error }, 'Failed to start Guftugo API');
  process.exit(1);
});
