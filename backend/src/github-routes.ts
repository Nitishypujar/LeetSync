import type { Express, Response } from 'express';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { prisma } from './db.js';
import { getValidGithubAccessToken, OAUTH_STATE_COOKIE } from './auth.js';
import {
  getGithubRepository,
  listGithubInstallationRepositories,
  getOrCreateDefaultGithubRepository,
  listGithubRepositories,
} from './github.js';
import {
  buildGithubAppInstallationUrl,
  createGithubInstallationAccessToken,
  getGithubUserInstallation,
  uninstallGithubAppInstallation,
} from './github-app.js';
import { requireAuth, requireCsrf } from './sessions.js';
import { rateLimit } from './rate-limit.js';
import { equalSecrets } from './crypto.js';
import { getEnv } from './config.js';

const INSTALL_STATE_MAX_AGE_MS = 10 * 60 * 1000;

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

function setInstallationStateCookie(response: Response, state: string): void {
  response.cookie(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: getEnv().NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/github/installation/callback',
    maxAge: INSTALL_STATE_MAX_AGE_MS,
  });
}

function clearInstallationStateCookie(response: Response): void {
  response.clearCookie(OAUTH_STATE_COOKIE, {
    httpOnly: true,
    secure: getEnv().NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/github/installation/callback',
  });
}

function installationCallbackUrl(
  result: 'success' | 'error',
  code?: string,
): string {
  const url = new URL('/', getEnv().FRONTEND_ORIGIN);
  url.searchParams.set('github_install', result);
  if (code) url.searchParams.set('code', code);
  return url.toString();
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
  app.get(
    '/api/github/installation/start',
    requireAuth,
    async (_req, res, next) => {
      try {
        if (getEnv().GITHUB_AUTH_MODE !== 'github_app') {
          res.status(404).json({ error: 'GITHUB_APP_NOT_CONFIGURED' });
          return;
        }
        const userId = userIdFromResponse(res);
        const [repository, leetcode] = await Promise.all([
          prisma.repository.findUnique({ where: { userId } }),
          prisma.leetcodeConnection.findUnique({
            where: { userId },
            select: { status: true },
          }),
        ]);
        if (!repository) {
          res.status(409).json({ error: 'GITHUB_REPOSITORY_SETUP_REQUIRED' });
          return;
        }
        if (leetcode?.status !== 'ACTIVE') {
          res.status(409).json({ error: 'LEETCODE_CONNECTION_REQUIRED' });
          return;
        }
        const state = randomBytes(32).toString('base64url');
        setInstallationStateCookie(res, state);
        res.status(200).json({
          url: buildGithubAppInstallationUrl(state),
        });
      } catch (error) {
        next(error);
      }
    },
  );

  app.post(
    '/api/github/installation/verify',
    requireAuth,
    requireCsrf,
    rateLimit(5, 60_000),
    async (_req, res, next) => {
      try {
        if (getEnv().GITHUB_AUTH_MODE !== 'github_app') {
          res.status(404).json({ error: 'GITHUB_APP_NOT_CONFIGURED' });
          return;
        }
        const user = res.locals.user as { id: string; githubLogin: string };
        const repository = await prisma.repository.findUnique({
          where: { userId: user.id },
        });
        if (!repository) {
          res
            .status(200)
            .json({ installed: false, reason: 'repository_missing' });
          return;
        }
        const installation = await getGithubUserInstallation(user.githubLogin);
        if (
          !installation ||
          installation.account.type !== 'User' ||
          installation.account.login.toLowerCase() !==
            user.githubLogin.toLowerCase() ||
          installation.repository_selection !== 'selected'
        ) {
          res.status(200).json({ installed: false });
          return;
        }
        const installationId = BigInt(installation.id);
        const inspectionToken = await createGithubInstallationAccessToken(
          installationId,
          undefined,
          'read',
        );
        const installedRepositories =
          await listGithubInstallationRepositories(inspectionToken);
        if (
          installedRepositories.length !== 1 ||
          installedRepositories[0]?.id !== Number(repository.githubRepoId)
        ) {
          res
            .status(200)
            .json({ installed: false, reason: 'repository_selection' });
          return;
        }
        const installationToken = await createGithubInstallationAccessToken(
          installationId,
          repository.githubRepoId,
        );
        const remoteRepository = await getGithubRepository(
          installationToken,
          repository.owner,
          repository.name,
        );
        if (
          remoteRepository.private ||
          remoteRepository.archived ||
          (getEnv().GITHUB_AUTH_MODE !== 'github_app' &&
            remoteRepository.permissions?.push !== true)
        ) {
          res
            .status(200)
            .json({ installed: false, reason: 'repository_unavailable' });
          return;
        }
        await prisma.repository.update({
          where: { userId: user.id },
          data: {
            installationId,
            branch: remoteRepository.default_branch,
          },
        });
        res.status(200).json({ installed: true });
      } catch (error) {
        next(error);
      }
    },
  );

  app.get(
    '/api/github/installation/callback',
    requireAuth,
    async (req, res, next) => {
      try {
        const state =
          typeof req.query.state === 'string' ? req.query.state : null;
        const storedState = req.cookies?.[OAUTH_STATE_COOKIE] as
          string | undefined;
        clearInstallationStateCookie(res);
        if (!state || !storedState || !equalSecrets(state, storedState)) {
          res.redirect(
            302,
            installationCallbackUrl('error', 'installation_state_invalid'),
          );
          return;
        }

        const installationIdText =
          typeof req.query.installation_id === 'string'
            ? req.query.installation_id
            : '';
        if (
          !/^\d+$/.test(installationIdText) ||
          !['install', 'update'].includes(String(req.query.setup_action))
        ) {
          res.redirect(
            302,
            installationCallbackUrl('error', 'installation_incomplete'),
          );
          return;
        }

        const user = res.locals.user as { id: string; githubLogin: string };
        const userId = user.id;
        const repository = await prisma.repository.findUnique({
          where: { userId },
        });
        if (!repository) {
          res.redirect(
            302,
            installationCallbackUrl('error', 'github_reauth_required'),
          );
          return;
        }

        const installationId = BigInt(installationIdText);
        // A classic OAuth token cannot call GitHub's app-installation
        // repository-list endpoint. Inspect with a read-only installation
        // token, then mint a separate token restricted to the one target repo.
        const inspectionToken = await createGithubInstallationAccessToken(
          installationId,
          undefined,
          'read',
        );
        const installedRepositories =
          await listGithubInstallationRepositories(inspectionToken);
        if (
          installedRepositories.length !== 1 ||
          installedRepositories[0]?.id !== Number(repository.githubRepoId)
        ) {
          const removed = await uninstallGithubAppInstallation(
            installationId,
            user.githubLogin,
          ).catch(() => false);
          res.redirect(
            302,
            installationCallbackUrl(
              'error',
              removed
                ? 'installation_removed_wrong_selection'
                : 'remove_installation_from_github_settings',
            ),
          );
          return;
        }

        const installationToken = await createGithubInstallationAccessToken(
          installationId,
          repository.githubRepoId,
        );
        const remoteRepository = await getGithubRepository(
          installationToken,
          repository.owner,
          repository.name,
        );
        if (
          remoteRepository.private ||
          remoteRepository.archived ||
          (getEnv().GITHUB_AUTH_MODE !== 'github_app' &&
            remoteRepository.permissions?.push !== true)
        ) {
          res.redirect(
            302,
            installationCallbackUrl('error', 'repository_write_unavailable'),
          );
          return;
        }

        await prisma.repository.update({
          where: { userId },
          data: {
            installationId,
            branch: remoteRepository.default_branch,
          },
        });
        res.redirect(302, installationCallbackUrl('success'));
      } catch (error) {
        next(error);
      }
    },
  );

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
            installationRequired:
              getEnv().GITHUB_AUTH_MODE === 'github_app' &&
              existing.installationId === null,
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
          installationRequired: getEnv().GITHUB_AUTH_MODE === 'github_app',
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
          if (error.message.includes('GitHub request failed (403)')) {
            res.status(409).json({
              error: 'GITHUB_REPOSITORY_CREATE_PERMISSION_REQUIRED',
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
              installed:
                getEnv().GITHUB_AUTH_MODE !== 'github_app' ||
                repository.installationId !== null,
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
        const user = res.locals.user as { githubLogin: string };
        if (
          getEnv().GITHUB_AUTH_MODE === 'github_app' &&
          (parsed.data.owner.toLowerCase() !== user.githubLogin.toLowerCase() ||
            parsed.data.name.toLowerCase() !== 'leetcode-solutions')
        ) {
          res.status(403).json({ error: 'CANONICAL_REPOSITORY_REQUIRED' });
          return;
        }
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
