import { prisma } from './db.js';
import { getValidGithubAccessToken } from './auth.js';
import { createGithubCommit, getGithubRepository } from './github.js';
import { createGithubInstallationAccessToken } from './github-app.js';
import { getEnv } from './config.js';
import { buildSolutionFiles } from './solution-files.js';

const MAX_ATTEMPTS = 5;
const STALE_AFTER_MS = 15 * 60_000;
type ClaimedJob = { id: string };

function formatCommitDate(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
    hourCycle: 'h23',
    timeZoneName: 'longOffset',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? '';
  const offsetPart = part('timeZoneName');
  const offset =
    offsetPart === 'GMT' ? '+00:00' : offsetPart.replace('GMT', '');
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}:${part('second')}.${part('fractionalSecond')}${offset}`;
}

export function formatError(error: unknown): string {
  if (!(error instanceof Error)) return 'Sync failed due to an internal error.';

  // Persist only known, non-sensitive diagnostics. Arbitrary upstream or
  // database messages can contain credentials, request data, or source code.
  const githubStatus = /^GitHub request failed \(([45]\d\d)\)$/.exec(
    error.message,
  );
  if (githubStatus) return `GitHub request failed (${githubStatus[1]})`;

  const safeMessages = new Set([
    'Choose a GitHub repository before syncing.',
    'Reconnect GitHub before syncing.',
    'The selected GitHub repository is not writable.',
    'GitHub did not return a commit for the written file',
    'LeetCode source code exceeds the supported size',
  ]);
  return safeMessages.has(error.message)
    ? error.message
    : 'Sync failed due to an internal error.';
}

async function failStaleJobsAtRetryLimit(): Promise<void> {
  const cutoff = new Date(Date.now() - STALE_AFTER_MS);
  const stale = await prisma.syncJob.findMany({
    where: {
      status: 'RUNNING',
      attempts: { gte: MAX_ATTEMPTS },
      startedAt: { lt: cutoff },
    },
    select: { id: true },
  });
  for (const job of stale) {
    const now = new Date();
    const changed = await prisma.syncJob.updateMany({
      where: {
        id: job.id,
        status: 'RUNNING',
        attempts: { gte: MAX_ATTEMPTS },
        startedAt: { lt: cutoff },
      },
      data: {
        status: 'FAILED',
        lastError: 'Worker lease expired after the retry limit.',
        startedAt: null,
        completedAt: now,
      },
    });
    if (changed.count) {
      await prisma.syncJobEvent.create({
        data: {
          syncJobId: job.id,
          step: 'worker_recovery',
          outcome: 'failed',
          detail: 'Worker lease expired after the retry limit.',
        },
      });
    }
  }
}

async function claimNextJob(): Promise<string | null> {
  await failStaleJobsAtRetryLimit();
  const claimed = await prisma.$queryRaw<ClaimedJob[]>`
    WITH candidate AS (
      SELECT jobs."id"
      FROM "sync_jobs" AS jobs
      INNER JOIN "submissions" AS submissions
        ON submissions."id" = jobs."submission_id"
      WHERE (
        (jobs."status" = 'PENDING'::"SyncJobStatus" AND jobs."next_run_at" <= NOW())
        OR
        (jobs."status" = 'RUNNING'::"SyncJobStatus"
          AND jobs."started_at" < NOW() - INTERVAL '15 minutes'
          AND jobs."attempts" < ${MAX_ATTEMPTS})
      )
      ORDER BY jobs."next_run_at", submissions."submitted_at", jobs."id"
      LIMIT 1
      FOR UPDATE OF jobs SKIP LOCKED
    )
    UPDATE "sync_jobs" AS jobs
    SET "status" = 'RUNNING'::"SyncJobStatus",
        "attempts" = jobs."attempts" + 1,
        "started_at" = NOW(),
        "completed_at" = NULL
    FROM candidate
    WHERE jobs."id" = candidate."id"
    RETURNING jobs."id"
  `;
  return claimed[0]?.id ?? null;
}

async function markJobFailed(
  job: {
    id: string;
    attempts: number;
  },
  error: unknown,
): Promise<void> {
  const retry = job.attempts < MAX_ATTEMPTS;
  const now = new Date();
  const backoffMs = Math.min(
    30_000 * 2 ** Math.max(0, job.attempts - 1),
    6 * 60 * 60_000,
  );
  const detail = formatError(error);
  await prisma.$transaction([
    prisma.syncJob.update({
      where: { id: job.id },
      data: {
        status: retry ? 'PENDING' : 'FAILED',
        nextRunAt: retry ? new Date(now.getTime() + backoffMs) : now,
        lastError: detail,
        startedAt: null,
        completedAt: retry ? null : now,
      },
    }),
    prisma.syncJobEvent.create({
      data: {
        syncJobId: job.id,
        step: 'github_write',
        outcome: retry ? 'retry_scheduled' : 'failed',
        detail,
      },
    }),
  ]);
}

export async function processOneSyncJob(): Promise<boolean> {
  const jobId = await claimNextJob();
  if (!jobId) return false;

  const job = await prisma.syncJob.findUnique({
    where: { id: jobId },
    include: {
      submission: {
        include: {
          problem: true,
          user: { include: { repository: true } },
        },
      },
    },
  });
  if (!job) return true;

  await prisma.syncJobEvent.create({
    data: {
      syncJobId: job.id,
      step: 'worker_claim',
      outcome: 'started',
      detail: `Attempt ${job.attempts} started.`,
    },
  });

  try {
    if (job.submission.status !== 'ACCEPTED') {
      throw new Error(
        'Only verified Accepted submissions can be synchronized.',
      );
    }
    const newestSubmission = await prisma.submission.findFirst({
      where: {
        userId: job.submission.userId,
        problemId: job.submission.problemId,
        status: 'ACCEPTED',
      },
      orderBy: [{ submittedAt: 'desc' }, { createdAt: 'desc' }],
      select: { id: true },
    });
    if (newestSubmission && newestSubmission.id !== job.submissionId) {
      const now = new Date();
      await prisma.$transaction([
        prisma.syncJob.update({
          where: { id: job.id },
          data: {
            status: 'SKIPPED',
            lastError: 'Superseded by a newer Accepted submission.',
            startedAt: null,
            completedAt: now,
          },
        }),
        prisma.syncJobEvent.create({
          data: {
            syncJobId: job.id,
            step: 'github_write',
            outcome: 'superseded',
            detail: 'A newer Accepted solution exists for this problem.',
          },
        }),
      ]);
      return true;
    }
    const repository = job.submission.user.repository;
    if (!repository)
      throw new Error('Choose a GitHub repository before syncing.');
    const accessToken =
      getEnv().GITHUB_AUTH_MODE === 'github_app'
        ? repository.installationId
          ? await createGithubInstallationAccessToken(
              repository.installationId,
              repository.githubRepoId,
            )
          : null
        : await getValidGithubAccessToken(job.submission.userId);
    if (!accessToken) throw new Error('Reconnect GitHub before syncing.');

    const remoteRepository = await getGithubRepository(
      accessToken,
      repository.owner,
      repository.name,
    );
    if (!remoteRepository.permissions?.push || remoteRepository.archived) {
      throw new Error('The selected GitHub repository is not writable.');
    }

    const solutionFiles = buildSolutionFiles({
      number: job.submission.problem.leetcodeNumber,
      slug: job.submission.problem.slug,
      title: job.submission.problem.title,
      language: job.submission.language,
      sourceCode: job.submission.sourceCode,
    });
    const commitDate = formatCommitDate(
      job.submission.submittedAt,
      job.submission.user.timeZone,
    );
    const author = {
      name:
        job.submission.user.githubDisplayName ||
        job.submission.user.githubLogin,
      email: `${job.submission.user.githubUserId}+${job.submission.user.githubLogin}@users.noreply.github.com`,
      date: commitDate,
    };
    const commitMessage = `Solved #${job.submission.problem.leetcodeNumber} ${job.submission.problem.title} (${job.submission.language}) - ${job.submission.runtime || 'Unknown'}, ${job.submission.memory || 'Unknown'}`;
    const commitSha = await createGithubCommit({
      accessToken,
      owner: repository.owner,
      repository: repository.name,
      branch: remoteRepository.default_branch,
      files: solutionFiles.files,
      message: commitMessage,
      author,
      committer: author,
    });
    const now = new Date();
    await prisma.$transaction([
      prisma.syncJob.update({
        where: { id: job.id },
        data: {
          status: 'SYNCED',
          path: solutionFiles.solutionPath,
          commitSha,
          lastError: null,
          startedAt: null,
          completedAt: now,
        },
      }),
      prisma.syncJobEvent.create({
        data: {
          syncJobId: job.id,
          step: 'github_write',
          outcome: 'synced',
          detail: `Committed ${solutionFiles.solutionPath}; commit ${commitSha}.`,
        },
      }),
    ]);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('GitHub request failed (401)')
    ) {
      await prisma.githubToken.updateMany({
        where: { userId: job.submission.userId },
        data: { status: 'ATTENTION_REQUIRED' },
      });
    }
    await markJobFailed({ id: job.id, attempts: job.attempts }, error);
  }

  return true;
}
