import { getEnv } from './config.js';
import { prisma } from './db.js';
import { processOneSyncJob } from './sync-worker.js';

const env = getEnv();
let shuttingDown = false;

console.log(
  JSON.stringify({
    level: 'info',
    message: 'LeetSync worker started',
    environment: env.NODE_ENV,
  }),
);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    shuttingDown = true;
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
  while (!shuttingDown) {
    const worked = await processOneSyncJob();
    if (!worked && !shuttingDown) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
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
