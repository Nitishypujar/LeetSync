import type { Request, Response, NextFunction } from 'express';
import { randomBytes } from 'node:crypto';
import type { User } from '@prisma/client';
import { prisma } from './db.js';
import { hashToken, equalSecrets } from './crypto.js';
import { getEnv } from './config.js';

export const SESSION_COOKIE = 'leetsync_session';
export const CSRF_COOKIE = 'leetsync_csrf';
const SESSION_TTL_DAYS = 30;

function secureCookie(): boolean {
  return getEnv().NODE_ENV === 'production';
}

function csrfToken(): string {
  return randomBytes(32).toString('base64url');
}

export function issueCsrfCookie(response: Response): string {
  const token = csrfToken();
  response.cookie(CSRF_COOKIE, token, {
    httpOnly: false,
    secure: secureCookie(),
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 1000,
  });
  return token;
}

export async function createSession(
  userId: string,
  response: Response,
): Promise<void> {
  const rawToken = randomBytes(48).toString('base64url');
  const expiresAt = new Date(
    Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
  );
  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashToken(rawToken),
      expiresAt,
    },
  });

  response.cookie(SESSION_COOKIE, rawToken, {
    httpOnly: true,
    secure: secureCookie(),
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
  });
}

export async function revokeSession(rawToken: string): Promise<void> {
  await prisma.session.updateMany({
    where: { tokenHash: hashToken(rawToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export function clearSessionCookie(response: Response): void {
  response.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    secure: secureCookie(),
    sameSite: 'lax',
    path: '/',
  });
}

export function clearCsrfCookie(response: Response): void {
  response.clearCookie(CSRF_COOKIE, {
    httpOnly: false,
    secure: secureCookie(),
    sameSite: 'lax',
    path: '/',
  });
}

export async function findSessionUser(rawToken?: string): Promise<User | null> {
  if (!rawToken) return null;
  const session = await prisma.session.findFirst({
    where: {
      tokenHash: hashToken(rawToken),
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    include: { user: true },
  });
  return session?.user ?? null;
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const rawToken = req.cookies?.[SESSION_COOKIE] as string | undefined;
    const user = await findSessionUser(rawToken);
    if (!user) {
      res.status(401).json({ error: 'UNAUTHENTICATED' });
      return;
    }
    res.locals.user = user;
    next();
  } catch (error) {
    next(error);
  }
}

export function requireCsrf(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const cookieToken = req.cookies?.[CSRF_COOKIE] as string | undefined;
  const headerToken = req.get('x-csrf-token') ?? '';
  if (!cookieToken || !equalSecrets(cookieToken, headerToken)) {
    res.status(403).json({ error: 'CSRF_INVALID' });
    return;
  }
  next();
}
