import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp, FRONTEND_ROUTE } from './app.js';

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
  process.env.EXTENSION_ID = 'nadlcboffmafknogdcgohdcledaomppo';
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
    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['permissions-policy']).toContain('camera=()');
    expect(response.headers['content-security-policy']).toContain(
      "frame-ancestors 'none'",
    );
    expect(response.headers['content-security-policy']).toContain(
      "style-src 'self'",
    );
    expect(response.headers['content-security-policy']).not.toContain(
      'unsafe-inline',
    );
  });
});

describe('production frontend route matching', () => {
  it('keeps application routes while excluding files and API paths from the SPA fallback', () => {
    expect(FRONTEND_ROUTE.test('/privacy')).toBe(true);
    expect(FRONTEND_ROUTE.test('/terms')).toBe(true);
    for (const path of [
      '/api/dashboard',
      '/health',
      '/.env',
      '/.git/config',
      '/assets/app.js/chunk',
      '/assets/app.js.map',
      '/favicon.ico',
    ]) {
      expect(FRONTEND_ROUTE.test(path)).toBe(false);
    }
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

describe('GitHub OAuth routes', () => {
  it('creates a one-time state cookie and requests repository access', async () => {
    const response = await request(createApp()).get('/api/auth/github');

    expect(response.status).toBe(302);
    const authorizeUrl = new URL(response.headers.location as string);
    expect(authorizeUrl.hostname).toBe('github.com');
    expect(authorizeUrl.searchParams.get('scope')).toBe('public_repo');
    expect(authorizeUrl.searchParams.get('state')).toHaveLength(43);
    expect(response.headers['set-cookie']).toEqual(
      expect.arrayContaining([
        expect.stringContaining('leetsync_oauth_state='),
        expect.stringContaining('HttpOnly'),
        expect.stringContaining('SameSite=Lax'),
      ]),
    );
  });

  it('rejects a callback without the browser-bound OAuth state', async () => {
    const response = await request(createApp()).get(
      '/api/auth/github/callback?code=fake-code&state=fake-state',
    );

    expect(response.status).toBe(302);
    expect(response.headers.location).toContain('oauth_state_invalid');
  });
});

describe('authenticated API boundaries', () => {
  it('does not expose dashboard data without a session', async () => {
    const response = await request(createApp()).get('/api/dashboard');
    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'UNAUTHENTICATED' });
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('requires authentication for all user and extension data routes', async () => {
    const app = createApp();
    const responses = await Promise.all([
      request(app).get('/api/me'),
      request(app).get('/api/github/repositories'),
      request(app).get('/api/github/repository'),
      request(app).post('/api/github/repository/ensure'),
      request(app).post('/api/leetcode/username'),
      request(app).post('/api/extension/handshake/complete'),
      request(app).post('/api/extension/handshake'),
      request(app).post('/api/leetcode/disconnect'),
      request(app).post('/api/extension/revoke'),
      request(app).post('/api/extension/heartbeat'),
      request(app).post('/api/extension/submissions'),
      request(app).post('/api/sync/00000000-0000-4000-8000-000000000001/retry'),
      request(app).post('/api/auth/disconnect-github'),
      request(app).post('/api/data/delete'),
    ]);
    expect(responses.map((response) => response.status)).toEqual(
      Array(responses.length).fill(401),
    );
  });

  it('allows only the configured dashboard and extension origins', async () => {
    const app = createApp();
    const dashboard = await request(app)
      .options('/api/dashboard')
      .set('Origin', 'http://localhost:5173');
    const extension = await request(app)
      .options('/api/dashboard')
      .set('Origin', 'chrome-extension://nadlcboffmafknogdcgohdcledaomppo');
    const unknown = await request(app)
      .options('/api/dashboard')
      .set('Origin', 'https://attacker.example');
    expect(dashboard.headers['access-control-allow-origin']).toBe(
      'http://localhost:5173',
    );
    expect(extension.headers['access-control-allow-origin']).toBe(
      'chrome-extension://nadlcboffmafknogdcgohdcledaomppo',
    );
    expect(unknown.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('rejects state-changing requests from an untrusted browser origin', async () => {
    const response = await request(createApp())
      .post('/api/auth/logout')
      .set('Origin', 'https://attacker.example');

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'ORIGIN_NOT_ALLOWED' });
  });

  it('rejects malformed and oversized JSON without exposing parser details', async () => {
    const app = createApp();
    const malformed = await request(app)
      .post('/api/extension/submissions')
      .set('Content-Type', 'application/json')
      .send('{"sourceCode":');
    const oversized = await request(app)
      .post('/api/extension/submissions')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ sourceCode: 'x'.repeat(1_100_000) }));

    expect(malformed.status).toBe(400);
    expect(malformed.body).toEqual({ error: 'INVALID_REQUEST_BODY' });
    expect(oversized.status).toBe(413);
    expect(oversized.body).toEqual({ error: 'REQUEST_TOO_LARGE' });
  });

  it('rejects null and lookalike origins for state-changing requests', async () => {
    const app = createApp();
    const results = await Promise.all([
      request(app).post('/api/auth/logout').set('Origin', 'null'),
      request(app)
        .post('/api/auth/logout')
        .set('Origin', 'http://localhost:5173.attacker.example'),
    ]);

    expect(results.map((response) => response.status)).toEqual([403, 403]);
    expect(results.map((response) => response.body.error)).toEqual([
      'ORIGIN_NOT_ALLOWED',
      'ORIGIN_NOT_ALLOWED',
    ]);
  });
});
