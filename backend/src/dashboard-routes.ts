import type { Express, Response } from 'express';
import { z } from 'zod';
import { prisma } from './db.js';
import { requireAuth, requireCsrf } from './sessions.js';

function plainSyncError(value: string | null): string | null {
  if (!value) return null;
  if (value.includes('Superseded by a newer Accepted submission'))
    return 'A newer Accepted solution is queued; this older version was skipped.';
  if (value.includes('Reconnect GitHub'))
    return 'Reconnect GitHub to resume sync.';
  if (value.includes('request failed (401)'))
    return 'Reconnect GitHub to resume sync.';
  if (value.includes('request failed (403)'))
    return 'GitHub denied the write. Check repository access.';
  if (value.includes('not writable'))
    return 'The destination repository is no longer writable.';
  if (value.includes('Choose a GitHub repository'))
    return 'The destination repository needs setup.';
  return 'GitHub sync failed. Retry the submission or reconnect GitHub.';
}

function userIdFromResponse(response: Response): string {
  return (response.locals.user as { id: string }).id;
}

export function registerDashboardRoutes(app: Express): void {
  app.get('/api/dashboard', requireAuth, async (_req, res, next) => {
    try {
      const userId = userIdFromResponse(res);
      const [user, groupedJobs, submissions, totalSubmissions] =
        await Promise.all([
          prisma.user.findUnique({
            where: { id: userId },
            include: {
              githubToken: { select: { status: true, expiresAt: true } },
              leetcodeConnection: {
                select: {
                  leetcodeUsername: true,
                  detectedUsername: true,
                  verifiedAt: true,
                  status: true,
                },
              },
              repository: true,
              extensionTokens: {
                where: { revokedAt: null },
                select: { id: true, lastSeenAt: true, extensionVersion: true },
              },
            },
          }),
          prisma.syncJob.groupBy({
            by: ['status'],
            where: { submission: { userId } },
            _count: { _all: true },
          }),
          prisma.submission.findMany({
            where: { userId },
            include: { problem: true, syncJob: true },
            orderBy: { submittedAt: 'desc' },
            take: 30,
          }),
          prisma.submission.count({ where: { userId } }),
        ]);
      if (!user) {
        res.status(401).json({ error: 'UNAUTHENTICATED' });
        return;
      }

      const counts: Record<string, number> = {
        pending: 0,
        running: 0,
        synced: 0,
        failed: 0,
      };
      for (const group of groupedJobs) {
        const key = group.status.toLowerCase();
        if (key in counts) counts[key] = group._count._all;
      }

      const repo = user.repository;
      res.status(200).json({
        account: { githubLogin: user.githubLogin },
        github: {
          connected: user.githubToken?.status === 'ACTIVE',
          status: user.githubToken?.status ?? 'REVOKED',
          expiresAt: user.githubToken?.expiresAt?.toISOString() ?? null,
        },
        leetcode: user.leetcodeConnection
          ? {
              connected: user.leetcodeConnection.status === 'ACTIVE',
              username: user.leetcodeConnection.leetcodeUsername,
              detectedUsername: user.leetcodeConnection.detectedUsername,
              mismatch: Boolean(
                user.leetcodeConnection.detectedUsername &&
                user.leetcodeConnection.detectedUsername.toLowerCase() !==
                  user.leetcodeConnection.leetcodeUsername.toLowerCase(),
              ),
              verifiedAt:
                user.leetcodeConnection.verifiedAt?.toISOString() ?? null,
            }
          : null,
        repository: repo
          ? {
              owner: repo.owner,
              name: repo.name,
              branch: repo.branch,
              url: `https://github.com/${repo.owner}/${repo.name}`,
            }
          : null,
        extension: {
          paired: user.extensionTokens.length > 0,
          lastSeenAt:
            user.extensionTokens
              .map((token) => token.lastSeenAt)
              .filter((value): value is Date => value !== null)
              .sort((left, right) => right.getTime() - left.getTime())[0]
              ?.toISOString() ?? null,
          connected: user.extensionTokens.some(
            (token) =>
              token.lastSeenAt !== null &&
              Date.now() - token.lastSeenAt.getTime() < 60_000,
          ),
        },
        counts: { total: totalSubmissions, jobs: counts },
        submissions: submissions.map((submission) => ({
          id: submission.id,
          providerSubmissionId: submission.providerSubmissionId,
          problem: {
            number: submission.problem.leetcodeNumber,
            title: submission.problem.title,
            slug: submission.problem.slug,
            difficulty: submission.problem.difficulty,
            topicTags: submission.problem.topicTags,
          },
          language: submission.language,
          runtime: submission.runtime,
          memory: submission.memory,
          status: submission.status,
          submittedAt: submission.submittedAt.toISOString(),
          sync: submission.syncJob
            ? {
                id: submission.syncJob.id,
                status: submission.syncJob.status,
                attempts: submission.syncJob.attempts,
                error: plainSyncError(submission.syncJob.lastError),
                path: submission.syncJob.path,
                commitSha: submission.syncJob.commitSha,
                commitUrl:
                  repo && submission.syncJob.commitSha
                    ? `https://github.com/${repo.owner}/${repo.name}/commit/${submission.syncJob.commitSha}`
                    : null,
              }
            : null,
        })),
      });
    } catch (error) {
      next(error);
    }
  });

  app.post(
    '/api/sync/:jobId/retry',
    requireAuth,
    requireCsrf,
    async (req, res, next) => {
      try {
        const params = z
          .object({ jobId: z.string().uuid() })
          .safeParse(req.params);
        if (!params.success) {
          res.status(400).json({ error: 'INVALID_SYNC_JOB' });
          return;
        }
        const userId = userIdFromResponse(res);
        const job = await prisma.syncJob.findFirst({
          where: {
            id: params.data.jobId,
            submission: { userId },
          },
          select: { id: true, status: true },
        });
        if (!job) {
          res.status(404).json({ error: 'SYNC_JOB_NOT_FOUND' });
          return;
        }
        if (job.status !== 'FAILED') {
          res.status(409).json({ error: 'SYNC_JOB_NOT_RETRYABLE' });
          return;
        }

        const now = new Date();
        const retried = await prisma.$transaction(async (transaction) => {
          const changed = await transaction.syncJob.updateMany({
            where: { id: job.id, status: 'FAILED' },
            data: {
              status: 'PENDING',
              attempts: 0,
              nextRunAt: now,
              lastError: null,
              startedAt: null,
              completedAt: null,
            },
          });
          if (!changed.count) return false;
          await transaction.syncJobEvent.create({
            data: {
              syncJobId: job.id,
              step: 'manual_retry',
              outcome: 'queued',
              detail: 'The account owner requested a safe retry.',
            },
          });
          return true;
        });
        if (!retried) {
          res.status(409).json({ error: 'SYNC_JOB_NOT_RETRYABLE' });
          return;
        }
        res.status(202).json({ id: job.id, status: 'PENDING' });
      } catch (error) {
        next(error);
      }
    },
  );
}
