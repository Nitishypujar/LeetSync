import { env } from './config.js';

console.log(
  JSON.stringify({
    level: 'info',
    message: 'LeetSync worker started',
    environment: env.NODE_ENV,
  }),
);

const shutdown = (signal: string) => {
  console.log(
    JSON.stringify({
      level: 'info',
      message: 'LeetSync worker shutting down',
      signal,
    }),
  );
  process.exit(0);
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
