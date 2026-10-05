import { createApp } from './app.js';
import { getEnv } from './config.js';
import { prisma } from './db.js';

const env = getEnv();
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
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
};

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
