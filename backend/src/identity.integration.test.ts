import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';

const shouldRunDatabaseTests = process.env.RUN_DB_TESTS === 'true';
const prisma = new PrismaClient();

const suite = shouldRunDatabaseTests ? describe : describe.skip;

suite('GitHub identity uniqueness', () => {
  const githubUserId = BigInt(
    900000000000000 + Math.floor(Math.random() * 1000000),
  );

  beforeAll(async () => {
    await prisma.user.deleteMany({ where: { githubUserId } });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { githubUserId } });
    await prisma.$disconnect();
  });

  it('database rejects two users with the same github_user_id', async () => {
    await prisma.user.create({
      data: { githubUserId, githubLogin: 'identity-test-a' },
    });

    await expect(
      prisma.user.create({
        data: { githubUserId, githubLogin: 'identity-test-b' },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });
});
