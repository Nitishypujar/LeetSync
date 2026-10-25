import { randomBytes } from 'node:crypto';
import type { Express, NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from './db.js';
import { hashToken } from './crypto.js';
import {
  acceptedSubmissionSchema,
  normalizeLeetcodeUsername,
  toAcceptedSubmission,
} from './leetcode.js';
import { queueAcceptedSubmission } from './sync-queue.js';
import { requireAuth, requireCsrf } from './sessions.js';
import { rateLimit } from './rate-limit.js';

const extensionHandshakeSchema = z.object({
  extensionVersion: z.string().max(64).optional(),
});
const handshakeCompleteSchema = z.object({
  token: z.string().regex(/^lsx_ext_[A-Za-z0-9_-]{32,}$/),
});
const heartbeatSchema = z.object({
  leetcodeUsername: z
    .string()
    .trim()
    .min(1)
    .max(39)
    .regex(/^[A-Za-z0-9_-]+$/),
  extensionVersion: z.string().max(64).optional(),
});

function userIdFromResponse(response: Response): string {
  return (response.locals.user as { id: string }).id;
}

export async function requireExtensionAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authorization = req.get('authorization') ?? '';
    const match = /^Bearer\s+(lsx_ext_[A-Za-z0-9_-]{32,})$/i.exec(
      authorization,
    );
    const rawToken = match?.[1];
    if (!rawToken) {
      res.status(401).json({ error: 'EXTENSION_UNAUTHORIZED' });
      return;
    }
    const token = await prisma.extensionToken.findFirst({
      where: { tokenHash: hashToken(rawToken), revokedAt: null },
      select: { id: true, userId: true },
    });
    if (!token) {
      res.status(401).json({ error: 'EXTENSION_UNAUTHORIZED' });
      return;
    }
    res.locals.extensionUserId = token.userId;
    res.locals.extensionTokenId = token.id;
    next();
  } catch (error) {
    next(error);
  }
}

export function registerExtensionRoutes(app: Express): void {
  app.post(
    '/api/extension/handshake',
    requireAuth,
    requireCsrf,
    rateLimit(10, 60_000),
    async (req, res, next) => {
      try {
        const parsed = extensionHandshakeSchema.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({ error: 'INVALID_EXTENSION_REQUEST' });
          return;
        }
        const userId = userIdFromResponse(res);
        const leetcodeConnection = await prisma.leetcodeConnection.findUnique({
          where: { userId },
          select: { userId: true },
        });
        if (!leetcodeConnection) {
          res.status(409).json({ error: 'LEETCODE_ACCOUNT_NOT_LINKED' });
          return;
        }
        const rawToken = `lsx_ext_${randomBytes(32).toString('base64url')}`;
        const token = await prisma.extensionToken.create({
          data: {
            userId,
            tokenHash: hashToken(rawToken),
            extensionVersion: parsed.data.extensionVersion,
          },
          select: { id: true },
        });
        const stillLinked = await prisma.leetcodeConnection.findUnique({
          where: { userId },
          select: { userId: true },
        });
        if (!stillLinked) {
          await prisma.extensionToken.update({
            where: { id: token.id },
            data: { revokedAt: new Date() },
          });
          res.status(409).json({ error: 'LEETCODE_ACCOUNT_NOT_LINKED' });
          return;
        }
        res.status(201).json({ token: rawToken, tokenId: token.id });
      } catch (error) {
        next(error);
      }
    },
  );

  app.post(
    '/api/extension/handshake/complete',
    requireAuth,
    requireCsrf,
    rateLimit(10, 60_000),
    async (req, res, next) => {
      try {
        const parsed = handshakeCompleteSchema.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({ error: 'INVALID_EXTENSION_REQUEST' });
          return;
        }
        const userId = userIdFromResponse(res);
        const current = await prisma.extensionToken.findFirst({
          where: {
            userId,
            tokenHash: hashToken(parsed.data.token),
            revokedAt: null,
          },
          select: { id: true },
        });
        if (!current) {
          res.status(409).json({ error: 'EXTENSION_HANDSHAKE_EXPIRED' });
          return;
        }
        const connection = await prisma.leetcodeConnection.findUnique({
          where: { userId },
          select: {
            leetcodeUsername: true,
            detectedUsername: true,
            status: true,
          },
        });
        if (
          !connection ||
          !connection.detectedUsername ||
          normalizeLeetcodeUsername(connection.leetcodeUsername) !==
            normalizeLeetcodeUsername(connection.detectedUsername)
        ) {
          res.status(409).json({ error: 'LEETCODE_ACCOUNT_NOT_DETECTED' });
          return;
        }
        await prisma.$transaction([
          prisma.extensionToken.updateMany({
            where: {
              userId,
              revokedAt: null,
              id: { not: current.id },
            },
            data: { revokedAt: new Date() },
          }),
          prisma.extensionToken.update({
            where: { id: current.id },
            data: { lastSeenAt: new Date() },
          }),
          ...(connection.status === 'PENDING'
            ? [
                prisma.leetcodeConnection.updateMany({
                  where: {
                    userId,
                    status: 'PENDING',
                    detectedUsername: connection.detectedUsername,
                  },
                  data: { status: 'ACTIVE', verifiedAt: new Date() },
                }),
              ]
            : []),
        ]);
        const confirmed = await prisma.leetcodeConnection.findUnique({
          where: { userId },
          select: { status: true },
        });
        if (confirmed?.status !== 'ACTIVE') {
          res.status(409).json({ error: 'LEETCODE_ACCOUNT_NOT_DETECTED' });
          return;
        }
        res.status(204).send();
      } catch (error) {
        next(error);
      }
    },
  );

  app.post(
    '/api/extension/revoke',
    requireAuth,
    requireCsrf,
    async (_req, res, next) => {
      try {
        await prisma.extensionToken.updateMany({
          where: { userId: userIdFromResponse(res), revokedAt: null },
          data: { revokedAt: new Date() },
        });
        res.status(204).send();
      } catch (error) {
        next(error);
      }
    },
  );

  app.post(
    '/api/extension/unpair',
    requireExtensionAuth,
    async (_req, res, next) => {
      try {
        await prisma.extensionToken.updateMany({
          where: {
            id: res.locals.extensionTokenId as string,
            revokedAt: null,
          },
          data: { revokedAt: new Date() },
        });
        res.status(204).send();
      } catch (error) {
        next(error);
      }
    },
  );

  app.post(
    '/api/extension/heartbeat',
    requireExtensionAuth,
    rateLimit(60, 60_000),
    async (req, res, next) => {
      try {
        const parsed = heartbeatSchema.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({ error: 'INVALID_LEETCODE_USERNAME' });
          return;
        }
        const userId = res.locals.extensionUserId as string;
        const username = normalizeLeetcodeUsername(
          parsed.data.leetcodeUsername,
        );
        const connection = await prisma.leetcodeConnection.findUnique({
          where: { userId },
          select: { leetcodeUsername: true, status: true },
        });
        const matches = Boolean(
          connection &&
          normalizeLeetcodeUsername(connection.leetcodeUsername) === username,
        );
        const now = new Date();
        const mismatch = Boolean(connection && !matches);
        await prisma.$transaction([
          prisma.extensionToken.update({
            where: { id: res.locals.extensionTokenId as string },
            data: {
              lastSeenAt: now,
              extensionVersion: parsed.data.extensionVersion,
            },
          }),
          ...(connection
            ? [
                prisma.leetcodeConnection.update({
                  where: { userId },
                  data: {
                    detectedUsername: parsed.data.leetcodeUsername,
                    // An extension bearer token can report identity, but cannot
                    // activate a pending link. A mismatch can still deactivate it.
                    ...(mismatch
                      ? { status: 'PENDING' as const, verifiedAt: null }
                      : {}),
                  },
                }),
              ]
            : []),
        ]);
        res.status(200).json({
          linked: matches && connection?.status === 'ACTIVE',
          confirmationRequired: matches && connection?.status !== 'ACTIVE',
          mismatch,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  app.post(
    '/api/extension/submissions',
    requireExtensionAuth,
    rateLimit(30, 60_000),
    async (req, res, next) => {
      try {
        const parsed = acceptedSubmissionSchema.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({ error: 'INVALID_ACCEPTED_SUBMISSION' });
          return;
        }
        if (parsed.data.sourceCode.length === 0) {
          res.status(400).json({ error: 'SUBMISSION_CODE_MISSING' });
          return;
        }

        const userId = res.locals.extensionUserId as string;
        const connection = await prisma.leetcodeConnection.findUnique({
          where: { userId },
          select: {
            leetcodeUsername: true,
            detectedUsername: true,
            status: true,
          },
        });
        const expected = connection?.leetcodeUsername;
        if (
          !connection ||
          !expected ||
          normalizeLeetcodeUsername(parsed.data.leetcodeUsername) !==
            normalizeLeetcodeUsername(expected) ||
          (connection.detectedUsername &&
            normalizeLeetcodeUsername(connection.detectedUsername) !==
              normalizeLeetcodeUsername(expected))
        ) {
          res.status(403).json({ error: 'LEETCODE_USERNAME_MISMATCH' });
          return;
        }
        if (connection.status !== 'ACTIVE') {
          res.status(409).json({ error: 'LEETCODE_ACCOUNT_NOT_LINKED' });
          return;
        }

        let accepted;
        try {
          accepted = toAcceptedSubmission(parsed.data);
        } catch {
          res.status(400).json({ error: 'INVALID_SUBMISSION_METADATA' });
          return;
        }
        const queued = await queueAcceptedSubmission(userId, accepted);
        res.status(queued.duplicate ? 200 : 202).json(queued);
      } catch (error) {
        next(error);
      }
    },
  );
}
