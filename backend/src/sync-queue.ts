import { prisma } from './db.js';
import { hashToken } from './crypto.js';
import type { AcceptedSubmission } from './leetcode.js';

function isUniqueConflict(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2002'
  );
}

export async function queueAcceptedSubmission(
  userId: string,
  accepted: AcceptedSubmission,
): Promise<{
  submissionId: string;
  jobId: string;
  duplicate: boolean;
  status: string;
}> {
  if (accepted.sourceCode.length > 500_000) {
    throw new Error('LeetCode source code exceeds the supported size');
  }

  try {
    return await prisma.$transaction(async (transaction) => {
      const existing = await transaction.submission.findUnique({
        where: {
          userId_providerSubmissionId: {
            userId,
            providerSubmissionId: accepted.submissionId,
          },
        },
        include: { syncJob: true },
      });
      if (existing?.syncJob) {
        return {
          submissionId: existing.id,
          jobId: existing.syncJob.id,
          duplicate: true,
          status: existing.syncJob.status,
        };
      }

      const problem = await transaction.problem.upsert({
        where: { leetcodeNumber: accepted.problemNumber },
        create: {
          leetcodeNumber: accepted.problemNumber,
          slug: accepted.titleSlug,
          title: accepted.problemTitle,
          difficulty: accepted.difficulty,
          topicTags: accepted.topicTags,
        },
        update: {
          slug: accepted.titleSlug,
          title: accepted.problemTitle,
          difficulty: accepted.difficulty,
          topicTags: accepted.topicTags,
        },
      });
      const submission = await transaction.submission.create({
        data: {
          userId,
          problemId: problem.id,
          providerSubmissionId: accepted.submissionId,
          language: accepted.language,
          sourceCode: accepted.sourceCode,
          runtime: accepted.runtime,
          memory: accepted.memory,
          status: 'ACCEPTED',
          solutionHash: hashToken(accepted.sourceCode),
          submittedAt: accepted.submittedAt,
        },
      });
      const job = await transaction.syncJob.create({
        data: {
          submissionId: submission.id,
          status: 'PENDING',
          events: {
            create: {
              step: 'ingestion',
              outcome: 'queued',
              detail:
                'Accepted submission received from the browser extension.',
            },
          },
        },
      });

      return {
        submissionId: submission.id,
        jobId: job.id,
        duplicate: false,
        status: job.status,
      };
    });
  } catch (error) {
    if (!isUniqueConflict(error)) throw error;
    const existing = await prisma.submission.findUnique({
      where: {
        userId_providerSubmissionId: {
          userId,
          providerSubmissionId: accepted.submissionId,
        },
      },
      include: { syncJob: true },
    });
    if (existing?.syncJob) {
      return {
        submissionId: existing.id,
        jobId: existing.syncJob.id,
        duplicate: true,
        status: existing.syncJob.status,
      };
    }
    throw error;
  }
}
