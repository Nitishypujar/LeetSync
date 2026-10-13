import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from './app.js';
import { hashToken } from './crypto.js';
import { prisma } from './db.js';

const testSuite =
  process.env.RUN_DB_TESTS === 'true' ? describe : describe.skip;

beforeAll(() => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL ??=
    'postgresql://leetsync:leetsync@localhost:5432/leetsync_test';
  process.env.SESSION_SECRET ??=
    'test-session-secret-which-is-long-enough-123456';
  process.env.TOKEN_ENCRYPTION_KEY ??=
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  process.env.GITHUB_CLIENT_ID ??= 'test-client';
  process.env.GITHUB_CLIENT_SECRET ??= 'test-secret';
  process.env.GITHUB_CALLBACK_URL ??=
    'http://localhost:3000/api/auth/github/callback';
  process.env.FRONTEND_ORIGIN ??= 'http://localhost:5173';
});

testSuite('LeetCode disconnect', () => {
  it('removes the LeetCode link and revokes extension tokens without deleting the account', async () => {
    const githubUserId = BigInt(
      800000000000000 + Math.floor(Math.random() * 1000000),
    );
    const rawSession = `test-session-${randomBytes(24).toString('hex')}`;
    const rawExtensionToken = `lsx_ext_${randomBytes(32).toString('base64url')}`;
    const csrfToken = randomBytes(24).toString('base64url');
    const user = await prisma.user.create({
      data: {
        githubUserId,
        githubLogin: `disconnect-${githubUserId}`,
        leetcodeConnection: {
          create: {
            leetcodeIdentity: `leetcode-${githubUserId}`,
            leetcodeUsername: `leetcode-${githubUserId}`,
            status: 'ACTIVE',
          },
        },
        extensionTokens: {
          create: { tokenHash: hashToken(rawExtensionToken) },
        },
        sessions: {
          create: {
            tokenHash: hashToken(rawSession),
            expiresAt: new Date(Date.now() + 60_000),
          },
        },
      },
    });

    try {
      const app = createApp();
      const sessionCookie = [
        `leetsync_session=${rawSession}`,
        `leetsync_csrf=${csrfToken}`,
      ];
      const response = await request(app)
        .post('/api/leetcode/disconnect')
        .set('Cookie', sessionCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({});

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ disconnected: true });
      expect(
        await prisma.leetcodeConnection.findUnique({
          where: { userId: user.id },
        }),
      ).toBeNull();
      const extensionToken = await prisma.extensionToken.findFirst({
        where: { userId: user.id },
      });
      expect(extensionToken?.revokedAt).toBeInstanceOf(Date);
      expect(
        await prisma.user.findUnique({ where: { id: user.id } }),
      ).not.toBeNull();

      const reconnectHandshake = await request(app)
        .post('/api/extension/handshake')
        .set('Cookie', sessionCookie)
        .set('X-CSRF-Token', csrfToken)
        .send({ extensionVersion: '0.1.2' });
      expect(reconnectHandshake.status).toBe(409);
      expect(reconnectHandshake.body).toEqual({
        error: 'LEETCODE_ACCOUNT_NOT_LINKED',
      });
    } finally {
      await prisma.user.delete({ where: { id: user.id } });
    }
  });

  it('does not provision a GitHub repository until LeetCode is verified', async () => {
    const githubUserId = BigInt(
      810000000000000 + Math.floor(Math.random() * 1000000),
    );
    const rawSession = `test-session-${randomBytes(24).toString('hex')}`;
    const csrfToken = randomBytes(24).toString('base64url');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const user = await prisma.user.create({
      data: {
        githubUserId,
        githubLogin: `pending-${githubUserId}`,
        leetcodeConnection: {
          create: {
            leetcodeIdentity: `leetcode-pending-${githubUserId}`,
            leetcodeUsername: `leetcode-pending-${githubUserId}`,
            status: 'PENDING',
          },
        },
        sessions: {
          create: {
            tokenHash: hashToken(rawSession),
            expiresAt: new Date(Date.now() + 60_000),
          },
        },
      },
    });

    try {
      const cookie = [
        `leetsync_session=${rawSession}`,
        `leetsync_csrf=${csrfToken}`,
      ];
      const crossSite = await request(createApp())
        .post('/api/github/repository/ensure')
        .set('Cookie', cookie)
        .set('Origin', 'https://attacker.example')
        .set('X-CSRF-Token', csrfToken)
        .send({});
      const invalidCsrf = await request(createApp())
        .post('/api/github/repository/ensure')
        .set('Cookie', cookie)
        .set('X-CSRF-Token', 'attacker-controlled-token')
        .send({});
      const response = await request(createApp())
        .post('/api/github/repository/ensure')
        .set('Cookie', cookie)
        .set('X-CSRF-Token', csrfToken)
        .send({});

      expect(crossSite.status).toBe(403);
      expect(crossSite.body).toEqual({ error: 'ORIGIN_NOT_ALLOWED' });
      expect(invalidCsrf.status).toBe(403);
      expect(invalidCsrf.body).toEqual({ error: 'CSRF_INVALID' });
      expect(response.status).toBe(409);
      expect(response.body).toEqual({ error: 'LEETCODE_CONNECTION_REQUIRED' });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(
        await prisma.repository.findUnique({ where: { userId: user.id } }),
      ).toBeNull();
    } finally {
      await prisma.user.delete({ where: { id: user.id } });
      vi.unstubAllGlobals();
    }
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
