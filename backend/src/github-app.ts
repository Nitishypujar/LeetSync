import { createSign } from 'node:crypto';
import { z } from 'zod';
import { getEnv } from './config.js';

const GITHUB_API = 'https://api.github.com';
const GITHUB_WEB = 'https://github.com';
const GITHUB_API_VERSION = '2026-03-10';

const installationTokenSchema = z.object({
  token: z.string().min(1),
  expires_at: z.string().datetime({ offset: true }),
});

export function buildGithubAppInstallationUrl(state: string): string {
  const slug = getEnv().GITHUB_APP_SLUG;
  if (!slug) throw new Error('GitHub App slug is not configured');
  const url = new URL(
    `${GITHUB_WEB}/apps/${encodeURIComponent(slug)}/installations/new`,
  );
  url.searchParams.set('state', state);
  return url.toString();
}

function createGithubAppJwt(): string {
  const env = getEnv();
  if (!env.GITHUB_APP_ID || !env.GITHUB_APP_PRIVATE_KEY) {
    throw new Error('GitHub App credentials are not configured');
  }
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({
    iat: now - 60,
    exp: now + 9 * 60,
    iss: env.GITHUB_APP_ID,
  })}`;
  const signer = createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  const privateKey = env.GITHUB_APP_PRIVATE_KEY.replace(/\\n/g, '\n');
  return `${unsigned}.${signer.sign(privateKey).toString('base64url')}`;
}

export async function createGithubInstallationAccessToken(
  installationId: bigint,
  repositoryId: bigint,
): Promise<string> {
  const repositoryIdNumber = Number(repositoryId);
  if (!Number.isSafeInteger(repositoryIdNumber) || repositoryIdNumber <= 0) {
    throw new Error('GitHub repository ID is outside the supported range');
  }
  const response = await fetch(
    `${GITHUB_API}/app/installations/${installationId}/access_tokens`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${createGithubAppJwt()}`,
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': GITHUB_API_VERSION,
      },
      body: JSON.stringify({
        repository_ids: [repositoryIdNumber],
        permissions: { contents: 'write' },
      }),
    },
  );
  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `GitHub App installation request failed (${response.status})`,
    );
  }
  const data: unknown = JSON.parse(text);
  return installationTokenSchema.parse(data).token;
}

/** Undo an installation that was granted access beyond the one target repo. */
export async function uninstallGithubAppInstallation(
  installationId: bigint,
  expectedUserLogin: string,
): Promise<boolean> {
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${createGithubAppJwt()}`,
    'X-GitHub-Api-Version': GITHUB_API_VERSION,
  };
  const installationResponse = await fetch(
    `${GITHUB_API}/app/installations/${installationId}`,
    { headers },
  );
  if (installationResponse.status === 404) return true;
  if (!installationResponse.ok) return false;
  const installation = z
    .object({ account: z.object({ login: z.string(), type: z.string() }) })
    .parse(await installationResponse.json());
  if (
    installation.account.type !== 'User' ||
    installation.account.login.toLowerCase() !== expectedUserLogin.toLowerCase()
  ) {
    return false;
  }
  const response = await fetch(
    `${GITHUB_API}/app/installations/${installationId}`,
    { method: 'DELETE', headers },
  );
  return response.status === 202 || response.status === 404;
}
