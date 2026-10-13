import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from './db.js';
import { queueAcceptedSubmission } from './sync-queue.js';
import { acceptedSubmissionSchema, toAcceptedSubmission } from './leetcode.js';
import { processOneSyncJob } from './sync-worker.js';

const runDatabaseTests = process.env.RUN_DB_TESTS === 'true';
const suite = runDatabaseTests ? describe : describe.skip;

suite('accepted-submission queue idempotency', () => {
  const githubUserId =
    -BigInt(Date.now()) - BigInt(Math.floor(Math.random() * 10_000));
  const problemNumber = 1_000_000_000 + Math.floor(Math.random() * 100_000);
  const providerSubmissionId = String(
    9_000_000_000_000_000 + Math.floor(Math.random() * 1000),
  );
  let userId = '';

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { githubUserId, githubLogin: 'sync-queue-integration-test' },
    });
    userId = user.id;
  });

  afterAll(async () => {
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.problem.deleteMany({
      where: { leetcodeNumber: problemNumber },
    });
    await prisma.$disconnect();
  });

  it('creates one logical submission and job under concurrent duplicate delivery', async () => {
    const accepted = toAcceptedSubmission(
      acceptedSubmissionSchema.parse({
        submissionId: providerSubmissionId,
        leetcodeUsername: 'integration-test-user',
        status: 'Accepted',
        frontendId: String(problemNumber),
        titleSlug: 'sync-queue-integration-test',
        problemTitle: 'Sync Queue Integration Test',
        difficulty: 'Easy' as const,
        topicTags: ['Integration Test'],
        language: 'python3',
        sourceCode: 'print("test")\n',
        runtime: '1 ms',
        memory: '1 MB',
        submittedAt: new Date().toISOString(),
      }),
    );

    const deliveries = await Promise.all([
      queueAcceptedSubmission(userId, accepted),
      queueAcceptedSubmission(userId, accepted),
    ]);

    expect(new Set(deliveries.map((delivery) => delivery.jobId)).size).toBe(1);
    expect(deliveries.filter((delivery) => !delivery.duplicate)).toHaveLength(
      1,
    );
    expect(
      await prisma.submission.count({
        where: { userId, providerSubmissionId },
      }),
    ).toBe(1);
    expect(
      await prisma.syncJob.count({
        where: { submission: { userId } },
      }),
    ).toBe(1);

    await prisma.syncJob.updateMany({
      where: { submission: { userId } },
      data: { status: 'SYNCED', completedAt: new Date() },
    });
  });

  it('skips an older retry so it cannot overwrite a newer solution', async () => {
    const now = Date.now();
    const makeAccepted = (submissionId: string, submittedAt: number) =>
      toAcceptedSubmission(
        acceptedSubmissionSchema.parse({
          submissionId,
          leetcodeUsername: 'integration-test-user',
          status: 'Accepted',
          frontendId: String(problemNumber),
          titleSlug: 'sync-queue-integration-test',
          problemTitle: 'Sync Queue Integration Test',
          difficulty: 'Easy' as const,
          topicTags: ['Integration Test'],
          language: 'python3',
          sourceCode: `print(${JSON.stringify(submissionId)})\n`,
          runtime: '1 ms',
          memory: '1 MB',
          submittedAt,
        }),
      );

    const older = await queueAcceptedSubmission(
      userId,
      makeAccepted(`${providerSubmissionId}1`, now - 120_000),
    );
    const newer = await queueAcceptedSubmission(
      userId,
      makeAccepted(`${providerSubmissionId}2`, now - 60_000),
    );

    expect(await processOneSyncJob()).toBe(true);
    const [olderJob, newerJob] = await Promise.all([
      prisma.syncJob.findUniqueOrThrow({ where: { id: older.jobId } }),
      prisma.syncJob.findUniqueOrThrow({ where: { id: newer.jobId } }),
    ]);
    expect(olderJob.status).toBe('SKIPPED');
    expect(olderJob.lastError).toContain('Superseded');
    expect(newerJob.status).toBe('PENDING');
  });
});
