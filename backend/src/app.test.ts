import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app.js';

beforeAll(() => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL =
    'postgresql://leetsync:leetsync@localhost:5432/leetsync';
  process.env.SESSION_SECRET =
    'test-session-secret-which-is-long-enough-123456';
  process.env.TOKEN_ENCRYPTION_KEY =
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  process.env.GITHUB_CLIENT_ID = 'test-client';
  process.env.GITHUB_CLIENT_SECRET = 'test-secret';
  process.env.GITHUB_CALLBACK_URL =
    'http://localhost:3000/api/auth/github/callback';
  process.env.FRONTEND_ORIGIN = 'http://localhost:5173';
});

describe('GET /health', () => {
  it('returns the shared-schema health response', async () => {
    const response = await request(createApp()).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: 'ok',
      service: 'leetsync-api',
      version: '0.1.0',
    });
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });
});

describe('GET /api/csrf', () => {
  it('issues a CSRF token cookie without authenticating the caller', async () => {
    const response = await request(createApp()).get('/api/csrf');
    expect(response.status).toBe(200);
    expect(response.body.csrfToken).toEqual(expect.any(String));
    expect(response.headers['set-cookie']).toEqual(
      expect.arrayContaining([expect.stringContaining('leetsync_csrf=')]),
    );
  });
});
