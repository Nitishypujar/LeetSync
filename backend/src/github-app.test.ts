import { generateKeyPairSync } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

Object.assign(process.env, {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://test:test@localhost:5432/leetsync',
  SESSION_SECRET: 'test-session-secret-which-is-long-enough-123456',
  TOKEN_ENCRYPTION_KEY:
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  GITHUB_CLIENT_ID: 'github-app-client',
  GITHUB_CLIENT_SECRET: 'github-app-client-secret',
  GITHUB_CALLBACK_URL: 'http://localhost:3000/api/auth/github/callback',
  FRONTEND_ORIGIN: 'http://localhost:5173',
  GITHUB_AUTH_MODE: 'github_app',
  GITHUB_APP_ID: '12345',
  GITHUB_APP_SLUG: 'leetsync-test',
  GITHUB_APP_PRIVATE_KEY: privateKey,
});

const {
  buildGithubAppInstallationUrl,
  createGithubInstallationAccessToken,
  uninstallGithubAppInstallation,
} = await import('./github-app.js');

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GitHub App access', () => {
  it('preserves the one-time state in the installation URL', () => {
    const url = new URL(buildGithubAppInstallationUrl('state-token'));
    expect(url.hostname).toBe('github.com');
    expect(url.pathname).toBe('/apps/leetsync-test/installations/new');
    expect(url.searchParams.get('state')).toBe('state-token');
  });

  it('mints an installation token for one repository with Contents write', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          token: 'ghs-test-installation-token',
          expires_at: '2026-10-16T12:00:00Z',
        }),
        { status: 201 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(createGithubInstallationAccessToken(12n, 34n)).resolves.toBe(
      'ghs-test-installation-token',
    );
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://api.github.com/app/installations/12/access_tokens',
    );
    expect(JSON.parse(String(init.body))).toEqual({
      repository_ids: [34],
      permissions: { contents: 'write' },
    });
  });

  it('refuses unsafe repository IDs without requesting a token', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      createGithubInstallationAccessToken(
        12n,
        BigInt(Number.MAX_SAFE_INTEGER) + 1n,
      ),
    ).rejects.toThrow('outside the supported range');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uninstalls only this user’s installation after excess repository access', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ account: { login: 'Nitishypujar', type: 'User' } }),
          { status: 200 },
        ),
      )
      .mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      uninstallGithubAppInstallation(12n, 'nitishypujar'),
    ).resolves.toBe(true);
    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toBe('https://api.github.com/app/installations/12');
    expect(init.method).toBe('DELETE');
    expect(String(new Headers(init.headers).get('Authorization'))).toMatch(
      /^Bearer [A-Za-z0-9_.-]+$/,
    );
  });

  it('will not uninstall an organization or another user installation', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          account: { login: 'example-org', type: 'Organization' },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      uninstallGithubAppInstallation(12n, 'nitishypujar'),
    ).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
