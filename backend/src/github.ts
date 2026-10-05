import { z } from 'zod';
import { getEnv } from './config.js';

const GITHUB_API = 'https://api.github.com';
const GITHUB_OAUTH = 'https://github.com/login/oauth';
const GITHUB_API_VERSION = '2026-03-10';
const GITHUB_SCOPE = 'public_repo';

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string().min(1),
  scope: z.string().optional(),
  expires_in: z.coerce.number().int().positive().optional(),
  refresh_token: z.string().min(1).optional(),
  refresh_token_expires_in: z.coerce.number().int().positive().optional(),
});

const githubUserSchema = z.object({
  id: z.number().int().positive(),
  login: z.string().min(1),
});

export type GithubTokenResponse = z.infer<typeof tokenResponseSchema>;
export type GithubUser = z.infer<typeof githubUserSchema>;

function githubHeaders(accessToken?: string): HeadersInit {
  return {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': GITHUB_API_VERSION,
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  };
}

export function buildGithubAuthorizeUrl(state: string): string {
  const env = getEnv();
  const url = new URL(`${GITHUB_OAUTH}/authorize`);
  url.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
  url.searchParams.set('redirect_uri', env.GITHUB_CALLBACK_URL);
  url.searchParams.set('scope', GITHUB_SCOPE);
  url.searchParams.set('state', state);
  return url.toString();
}

async function parseGithubResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text) as unknown;
  } catch {
    // Keep the plain-text response for diagnostics.
  }

  if (!response.ok) {
    throw new Error(`GitHub request failed (${response.status})`);
  }
  return body;
}

export async function exchangeGithubCode(
  code: string,
): Promise<GithubTokenResponse> {
  const env = getEnv();
  const body = new URLSearchParams({
    client_id: env.GITHUB_CLIENT_ID,
    client_secret: env.GITHUB_CLIENT_SECRET,
    code,
    redirect_uri: env.GITHUB_CALLBACK_URL,
  });
  const response = await fetch(`${GITHUB_OAUTH}/access_token`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  const data = await parseGithubResponse(response);
  return tokenResponseSchema.parse(data);
}

export async function refreshGithubToken(
  refreshToken: string,
): Promise<GithubTokenResponse> {
  const env = getEnv();
  const body = new URLSearchParams({
    client_id: env.GITHUB_CLIENT_ID,
    client_secret: env.GITHUB_CLIENT_SECRET,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
  const response = await fetch(`${GITHUB_OAUTH}/access_token`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  const data = await parseGithubResponse(response);
  return tokenResponseSchema.parse(data);
}

export async function getAuthenticatedGithubUser(
  accessToken: string,
): Promise<GithubUser> {
  const response = await fetch(`${GITHUB_API}/user`, {
    method: 'GET',
    headers: githubHeaders(accessToken),
  });
  const data = await parseGithubResponse(response);
  return githubUserSchema.parse(data);
}
