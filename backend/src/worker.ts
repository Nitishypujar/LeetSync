import { getEnv } from './config.js';
import { prisma } from './db.js';

const env = getEnv();
console.log(
  JSON.stringify({
    level: 'info',
    message: 'LeetSync worker started',
    environment: env.NODE_ENV,
  }),
);

const shutdown = async (signal: string): Promise<void> => {
  console.log(
    JSON.stringify({
      level: 'info',
      message: 'LeetSync worker shutting down',
      signal,
    }),
  );
  await prisma.$disconnect();
  process.exit(0);
};

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
