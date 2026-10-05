import { randomBytes } from 'node:crypto';
import type { Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from './db.js';
import { decryptSecret, encryptSecret, equalSecrets } from './crypto.js';
import {
  buildGithubAuthorizeUrl,
  exchangeGithubCode,
  getAuthenticatedGithubUser,
  refreshGithubToken,
} from './github.js';
import { getEnv } from './config.js';
import {
  createSession,
  clearCsrfCookie,
  clearSessionCookie,
  findSessionUser,
  issueCsrfCookie,
  requireAuth,
  requireCsrf,
  revokeSession,
  SESSION_COOKIE,
} from './sessions.js';

export const OAUTH_STATE_COOKIE = 'leetsync_oauth_state';
const OAUTH_STATE_MAX_AGE_MS = 10 * 60 * 1000;
const REFRESH_SKEW_MS = 60 * 1000;

function secureCookie(): boolean {
  return getEnv().NODE_ENV === 'production';
}

function setOauthStateCookie(response: Response, state: string): void {
  response.cookie(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: secureCookie(),
    sameSite: 'lax',
    path: '/api/auth/github',
    maxAge: OAUTH_STATE_MAX_AGE_MS,
  });
}

function clearOauthStateCookie(response: Response): void {
  response.clearCookie(OAUTH_STATE_COOKIE, {
    httpOnly: true,
    secure: secureCookie(),
    sameSite: 'lax',
    path: '/api/auth/github',
  });
}

function frontendSuccessUrl(): string {
  const url = new URL('/', getEnv().FRONTEND_ORIGIN);
  url.searchParams.set('auth', 'success');
  return url.toString();
}

function frontendErrorUrl(code: string): string {
  const url = new URL('/', getEnv().FRONTEND_ORIGIN);
  url.searchParams.set('auth', 'error');
  url.searchParams.set('code', code);
  return url.toString();
}

export function registerAuthRoutes(app: import('express').Express): void {
  app.get('/api/auth/github', (_req, res) => {
    const state = randomBytes(32).toString('base64url');
    setOauthStateCookie(res, state);
    res.redirect(302, buildGithubAuthorizeUrl(state));
  });

  app.get('/api/auth/github/callback', async (req, res, next) => {
    try {
      const code = typeof req.query.code === 'string' ? req.query.code : null;
      const state =
        typeof req.query.state === 'string' ? req.query.state : null;
      const storedState = req.cookies?.[OAUTH_STATE_COOKIE] as
        string | undefined;
      clearOauthStateCookie(res);

      if (!state || !storedState || !equalSecrets(state, storedState)) {
        res.redirect(302, frontendErrorUrl('oauth_state_invalid'));
        return;
      }

      if (req.query.error) {
        res.redirect(302, frontendErrorUrl('oauth_denied'));
        return;
      }

      if (!code) {
        res.redirect(302, frontendErrorUrl('oauth_code_missing'));
        return;
      }

      const tokenResponse = await exchangeGithubCode(code);
      const githubUser = await getAuthenticatedGithubUser(
        tokenResponse.access_token,
      );
      const now = Date.now();
      const expiresAt = tokenResponse.expires_in
        ? new Date(now + tokenResponse.expires_in * 1000)
        : null;

      const user = await prisma.user.upsert({
        where: { githubUserId: BigInt(githubUser.id) },
        update: { githubLogin: githubUser.login },
        create: {
          githubUserId: BigInt(githubUser.id),
          githubLogin: githubUser.login,
        },
      });

      await prisma.githubToken.upsert({
        where: { userId: user.id },
        update: {
          accessTokenEnc: encryptSecret(tokenResponse.access_token),
          refreshTokenEnc: tokenResponse.refresh_token
            ? encryptSecret(tokenResponse.refresh_token)
            : undefined,
          expiresAt,
          status: 'ACTIVE',
        },
        create: {
          userId: user.id,
          accessTokenEnc: encryptSecret(tokenResponse.access_token),
          refreshTokenEnc: tokenResponse.refresh_token
            ? encryptSecret(tokenResponse.refresh_token)
            : null,
          expiresAt,
          status: 'ACTIVE',
        },
      });

      await createSession(user.id, res);
      issueCsrfCookie(res);
      res.redirect(302, frontendSuccessUrl());
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        res.redirect(302, frontendErrorUrl('github_identity_conflict'));
        return;
      }
      next(error);
    }
  });

  app.get('/api/csrf', (_req, res) => {
    const token = issueCsrfCookie(res);
    res.status(200).json({ csrfToken: token });
  });

  app.get('/api/me', requireAuth, async (_req, res, next) => {
    try {
      const user = res.locals.user as NonNullable<
        Awaited<ReturnType<typeof findSessionUser>>
      >;
      const githubToken = await prisma.githubToken.findUnique({
        where: { userId: user.id },
      });
      res.status(200).json({
        id: user.id,
        githubUserId: user.githubUserId.toString(),
        githubLogin: user.githubLogin,
        createdAt: user.createdAt.toISOString(),
        github: {
          connected: Boolean(githubToken),
          status: githubToken?.status ?? 'REVOKED',
          expiresAt: githubToken?.expiresAt?.toISOString() ?? null,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  app.post(
    '/api/auth/logout',
    requireAuth,
    requireCsrf,
    async (req, res, next) => {
      try {
        const rawToken = req.cookies?.[SESSION_COOKIE] as string | undefined;
        if (rawToken) await revokeSession(rawToken);
        clearSessionCookie(res);
        clearCsrfCookie(res);
        res.status(204).send();
      } catch (error) {
        next(error);
      }
    },
  );
}

export async function getValidGithubAccessToken(
  userId: string,
): Promise<string | null> {
  const token = await prisma.githubToken.findUnique({ where: { userId } });
  if (!token || token.status === 'REVOKED') return null;

  try {
    if (
      token.expiresAt &&
      token.expiresAt.getTime() > Date.now() + REFRESH_SKEW_MS
    ) {
      return decryptSecret(token.accessTokenEnc);
    }

    if (!token.refreshTokenEnc) {
      await prisma.githubToken.update({
        where: { userId },
        data: { status: 'ATTENTION_REQUIRED' },
      });
      return null;
    }

    const refreshToken = decryptSecret(token.refreshTokenEnc);
    const refreshed = await refreshGithubToken(refreshToken);
    const expiresAt = refreshed.expires_in
      ? new Date(Date.now() + refreshed.expires_in * 1000)
      : null;

    await prisma.githubToken.update({
      where: { userId },
      data: {
        accessTokenEnc: encryptSecret(refreshed.access_token),
        refreshTokenEnc: refreshed.refresh_token
          ? encryptSecret(refreshed.refresh_token)
          : token.refreshTokenEnc,
        expiresAt,
        status: 'ACTIVE',
      },
    });
    return refreshed.access_token;
  } catch {
    await prisma.githubToken.update({
      where: { userId },
      data: { status: 'ATTENTION_REQUIRED' },
    });
    return null;
  }
}
