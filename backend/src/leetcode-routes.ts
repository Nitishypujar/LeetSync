import type { Express, Response } from 'express';
import { z } from 'zod';
import { prisma } from './db.js';
import { requireAuth, requireCsrf } from './sessions.js';
import { rateLimit } from './rate-limit.js';
import { normalizeLeetcodeUsername } from './leetcode.js';

const usernameSchema = z.object({
  username: z
    .string()
    .trim()
    .min(1)
    .max(39)
    .regex(/^@?[A-Za-z0-9_-]+$/),
  timeZone: z.string().trim().min(1).max(100),
});

function userIdFromResponse(response: Response): string {
  return (response.locals.user as { id: string }).id;
}

function validTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export function registerLeetcodeRoutes(app: Express): void {
  app.post(
    '/api/leetcode/disconnect',
    requireAuth,
    requireCsrf,
    rateLimit(5, 60_000),
    async (_req, res, next) => {
      try {
        const userId = userIdFromResponse(res);
        await prisma.$transaction([
          prisma.leetcodeConnection.deleteMany({ where: { userId } }),
          prisma.extensionToken.updateMany({
            where: { userId, revokedAt: null },
            data: { revokedAt: new Date() },
          }),
        ]);
        res.status(200).json({ disconnected: true });
      } catch (error) {
        next(error);
      }
    },
  );

  app.post(
    '/api/leetcode/username',
    requireAuth,
    requireCsrf,
    rateLimit(10, 60_000),
    async (req, res, next) => {
      try {
        const parsed = usernameSchema.safeParse(req.body);
        if (!parsed.success || !validTimeZone(parsed.data.timeZone)) {
          res.status(400).json({ error: 'INVALID_LEETCODE_USERNAME' });
          return;
        }

        const userId = userIdFromResponse(res);
        const username = parsed.data.username.replace(/^@/, '');
        const identity = normalizeLeetcodeUsername(username);
        const existing = await prisma.leetcodeConnection.findUnique({
          where: { userId },
        });
        await prisma.user.update({
          where: { id: userId },
          data: { timeZone: parsed.data.timeZone },
        });

        const sameIdentity =
          existing &&
          normalizeLeetcodeUsername(existing.leetcodeUsername) === identity;
        const connection = sameIdentity
          ? await prisma.leetcodeConnection.update({
              where: { userId },
              data: { leetcodeUsername: username },
              select: {
                leetcodeUsername: true,
                status: true,
                detectedUsername: true,
                verifiedAt: true,
              },
            })
          : await prisma.leetcodeConnection.upsert({
              where: { userId },
              create: {
                userId,
                leetcodeIdentity: identity,
                leetcodeUsername: username,
                status: 'PENDING',
              },
              update: {
                leetcodeIdentity: identity,
                leetcodeUsername: username,
                detectedUsername: null,
                verifiedAt: null,
                status: 'PENDING',
              },
              select: {
                leetcodeUsername: true,
                status: true,
                detectedUsername: true,
                verifiedAt: true,
              },
            });

        res.status(200).json({
          username: connection.leetcodeUsername,
          connected: connection.status === 'ACTIVE',
          mismatch: Boolean(
            connection.detectedUsername &&
            normalizeLeetcodeUsername(connection.detectedUsername) !== identity,
          ),
          verifiedAt: connection.verifiedAt?.toISOString() ?? null,
        });
      } catch (error) {
        if (
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          error.code === 'P2002'
        ) {
          res.status(409).json({ error: 'LEETCODE_ACCOUNT_ALREADY_LINKED' });
          return;
        }
        next(error);
      }
    },
  );
}
