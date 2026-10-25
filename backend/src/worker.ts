import { getEnv } from './config.js';
import { prisma } from './db.js';
import { runSyncWorkerLoop } from './sync-worker-loop.js';

const env = getEnv();
const controller = new AbortController();

console.log(
  JSON.stringify({
    level: 'info',
    message: 'LeetSync worker started',
    environment: env.NODE_ENV,
  }),
);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    controller.abort();
    console.log(
      JSON.stringify({
        level: 'info',
        message: 'LeetSync worker stopping',
        signal,
      }),
    );
  });
}

try {
  await runSyncWorkerLoop(controller.signal);
} catch (error) {
  console.error(
    JSON.stringify({
      level: 'error',
      message: 'LeetSync worker stopped after an unexpected error',
      error: error instanceof Error ? error.name : 'UnknownError',
    }),
  );
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
