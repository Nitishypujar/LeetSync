import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';
import { getDatabasePoolConfig } from './db-config.js';

const connectionString =
  process.env.DATABASE_URL ??
  (process.env.NODE_ENV === 'test'
    ? 'postgresql://localhost:5432/leetsync_test'
    : undefined);

if (!connectionString) {
  throw new Error('DATABASE_URL is required');
}

const adapter = new PrismaPg(getDatabasePoolConfig(connectionString));

export const prisma = new PrismaClient({ adapter });
