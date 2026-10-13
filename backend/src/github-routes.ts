import type { Express, Response } from 'express';
import { z } from 'zod';
import { prisma } from './db.js';
import { getValidGithubAccessToken } from './auth.js';
import {
  getGithubRepository,
  getOrCreateDefaultGithubRepository,
  listGithubRepositories,
} from './github.js';
import { requireAuth, requireCsrf } from './sessions.js';
import { rateLimit } from './rate-limit.js';

const selectedRepositorySchema = z.object({
  owner: z
    .string()
    .min(1)
    .max(255)
    .regex(/^[A-Za-z0-9-]+$/),
  name: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[A-Za-z0-9_.-]+$/),
  repositoryId: z.string().regex(/^\d+$/).optional(),
});

function userIdFromResponse(response: Response): string {
  return (response.locals.user as { id: string }).id;
}

async function accessTokenOrRespond(
  userId: string,
  response: Response,
): Promise<string | null> {
  const accessToken = await getValidGithubAccessToken(userId);
  if (!accessToken) {
    response.status(409).json({ error: 'GITHUB_REAUTH_REQUIRED' });
    return null;
  }
  return accessToken;
}

export function registerGithubRoutes(app: Express): void {
  app.post(
    '/api/github/repository/ensure',
    requireAuth,
    requireCsrf,
    rateLimit(5, 60_000),
    async (_req, res, next) => {
      try {
        const userId = userIdFromResponse(res);
        const existing = await prisma.repository.findUnique({
          where: { userId },
        });
        if (existing) {
          res.status(200).json({
            owner: existing.owner,
            name: existing.name,
            branch: existing.branch,
            url: `https://github.com/${existing.owner}/${existing.name}`,
          });
          return;
        }
        const leetcodeConnection = await prisma.leetcodeConnection.findUnique({
          where: { userId },
          select: { status: true },
        });
        if (leetcodeConnection?.status !== 'ACTIVE') {
          res.status(409).json({ error: 'LEETCODE_CONNECTION_REQUIRED' });
          return;
        }
        const accessToken = await accessTokenOrRespond(userId, res);
        if (!accessToken) return;
        const user = res.locals.user as { githubLogin: string };
        const repository = await getOrCreateDefaultGithubRepository(
          accessToken,
          user.githubLogin,
        );
        await prisma.repository.upsert({
          where: { userId },
          create: {
            userId,
            githubRepoId: BigInt(repository.id),
            owner: repository.owner.login,
            name: repository.name,
            branch: repository.default_branch,
          },
          update: {
            githubRepoId: BigInt(repository.id),
            owner: repository.owner.login,
            name: repository.name,
            branch: repository.default_branch,
          },
        });
        res.status(201).json({
          owner: repository.owner.login,
          name: repository.name,
          branch: repository.default_branch,
          url: repository.html_url,
        });
      } catch (error) {
        if (error instanceof Error) {
          if (
            error.message.includes('must be public, unarchived, and writable')
          ) {
            res.status(409).json({
              error: 'GITHUB_DEFAULT_REPOSITORY_UNAVAILABLE',
            });
            return;
          }
          if (error.message.includes('No extra repository was created')) {
            res.status(409).json({
              error: 'GITHUB_REPOSITORY_NAME_UNAVAILABLE',
            });
            return;
          }
        }
        next(error);
      }
    },
  );

  app.get('/api/github/repositories', requireAuth, async (_req, res, next) => {
    try {
      const userId = userIdFromResponse(res);
      const accessToken = await accessTokenOrRespond(userId, res);
      if (!accessToken) return;
      const repositories = await listGithubRepositories(accessToken);
      res.status(200).json({
        repositories: repositories
          .filter(
            (repository) =>
              repository.permissions?.push && !repository.archived,
          )
          .map((repository) => ({
            id: String(repository.id),
            owner: repository.owner.login,
            name: repository.name,
            fullName: repository.full_name,
            branch: repository.default_branch,
            private: repository.private,
            url: repository.html_url,
          })),
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/github/repository', requireAuth, async (_req, res, next) => {
    try {
      const repository = await prisma.repository.findUnique({
        where: { userId: userIdFromResponse(res) },
      });
      res.status(200).json({
        repository: repository
          ? {
              id: repository.githubRepoId.toString(),
              owner: repository.owner,
              name: repository.name,
              branch: repository.branch,
              url: `https://github.com/${repository.owner}/${repository.name}`,
            }
          : null,
      });
    } catch (error) {
      next(error);
    }
  });

  app.post(
    '/api/github/repository',
    requireAuth,
    requireCsrf,
    rateLimit(10, 60_000),
    async (req, res, next) => {
      try {
        const parsed = selectedRepositorySchema.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({ error: 'INVALID_REPOSITORY' });
          return;
        }
        const userId = userIdFromResponse(res);
        const accessToken = await accessTokenOrRespond(userId, res);
        if (!accessToken) return;
        const repository = await getGithubRepository(
          accessToken,
          parsed.data.owner,
          parsed.data.name,
        );
        if (
          (parsed.data.repositoryId &&
            parsed.data.repositoryId !== String(repository.id)) ||
          !repository.permissions?.push ||
          repository.archived
        ) {
          res.status(403).json({ error: 'REPOSITORY_NOT_WRITABLE' });
          return;
        }

        await prisma.repository.upsert({
          where: { userId },
          create: {
            userId,
            githubRepoId: BigInt(repository.id),
            owner: repository.owner.login,
            name: repository.name,
            branch: repository.default_branch,
          },
          update: {
            githubRepoId: BigInt(repository.id),
            owner: repository.owner.login,
            name: repository.name,
            branch: repository.default_branch,
          },
        });
        res.status(200).json({
          repository: {
            id: String(repository.id),
            owner: repository.owner.login,
            name: repository.name,
            branch: repository.default_branch,
            url: repository.html_url,
          },
        });
      } catch (error) {
        next(error);
      }
    },
  );
}
