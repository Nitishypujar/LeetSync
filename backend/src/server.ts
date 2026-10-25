import { createApp } from './app.js';
import { getEnv } from './config.js';
import { prisma } from './db.js';
import { runSyncWorkerLoop } from './sync-worker-loop.js';

const env = getEnv();
const workerController = new AbortController();
const workerPromise =
  env.RUN_SYNC_WORKER === 'true'
    ? runSyncWorkerLoop(workerController.signal).catch((error: unknown) => {
        console.error(
          JSON.stringify({
            level: 'error',
            message: 'Co-hosted LeetSync worker stopped unexpectedly',
            error: error instanceof Error ? error.name : 'UnknownError',
          }),
        );
        process.exitCode = 1;
      })
    : Promise.resolve();

if (env.RUN_SYNC_WORKER === 'true') {
  console.log(
    JSON.stringify({
      level: 'info',
      message: 'LeetSync API is running its co-hosted queue worker',
    }),
  );
}

const server = createApp().listen(env.PORT, () => {
  console.log(
    JSON.stringify({
      level: 'info',
      message: 'LeetSync API listening',
      port: env.PORT,
    }),
  );
});

const shutdown = async (signal: string): Promise<void> => {
  console.log(
    JSON.stringify({
      level: 'info',
      message: 'LeetSync API shutting down',
      signal,
    }),
  );
  workerController.abort();
  server.close(async () => {
    await workerPromise;
    await prisma.$disconnect();
    process.exit(0);
  });
};

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
