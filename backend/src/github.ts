import { z } from 'zod';
import { getEnv } from './config.js';

const GITHUB_API = 'https://api.github.com';
const GITHUB_OAUTH = 'https://github.com/login/oauth';
const GITHUB_API_VERSION = '2026-03-10';
// LeetSync only creates and writes a public solution repository. Avoid asking
// for access to the user's private repositories.
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
  name: z.string().nullable().optional(),
});

const githubRepositorySchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  full_name: z.string().min(1),
  owner: z.object({ login: z.string().min(1) }),
  default_branch: z.string().min(1),
  private: z.boolean(),
  archived: z.boolean().default(false),
  html_url: z.string().url(),
  permissions: z.object({ push: z.boolean().optional() }).optional(),
});

const contentResponseSchema = z.object({
  content: z.string(),
  sha: z.string().min(1),
});

const commitResponseSchema = z.object({
  sha: z.string().min(1),
});

const refResponseSchema = z.object({
  object: z.object({ sha: z.string().min(1) }),
});

const commitDetailsSchema = z.object({
  sha: z.string().min(1),
  tree: z.object({ sha: z.string().min(1) }),
});

export type GithubTokenResponse = z.infer<typeof tokenResponseSchema>;
export type GithubUser = z.infer<typeof githubUserSchema>;
export type GithubRepository = z.infer<typeof githubRepositorySchema>;

export type GithubCommitAuthor = {
  name: string;
  email: string;
  date: string;
};

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

export async function revokeGithubAuthorization(
  accessToken: string,
): Promise<boolean> {
  const env = getEnv();
  const authorization = Buffer.from(
    `${env.GITHUB_CLIENT_ID}:${env.GITHUB_CLIENT_SECRET}`,
  ).toString('base64');
  const response = await fetch(
    `${GITHUB_API}/applications/${encodeURIComponent(env.GITHUB_CLIENT_ID)}/grant`,
    {
      method: 'DELETE',
      headers: {
        ...githubHeaders(),
        Authorization: `Basic ${authorization}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ access_token: accessToken }),
    },
  );
  if (response.status === 204 || response.status === 404) return true;
  if (response.ok) return true;
  return false;
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

export async function listGithubRepositories(
  accessToken: string,
): Promise<GithubRepository[]> {
  const repositories: GithubRepository[] = [];
  for (let page = 1; page <= 10; page += 1) {
    const response = await fetch(
      `${GITHUB_API}/user/repos?per_page=100&page=${page}&sort=updated&affiliation=owner%2Ccollaborator%2Corganization_member`,
      { headers: githubHeaders(accessToken) },
    );
    const data = z
      .array(githubRepositorySchema)
      .parse(await parseGithubResponse(response));
    repositories.push(...data);
    if (data.length < 100) break;
  }
  return repositories;
}

export async function getGithubRepository(
  accessToken: string,
  owner: string,
  name: string,
): Promise<GithubRepository> {
  const response = await fetch(
    `${GITHUB_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`,
    { headers: githubHeaders(accessToken) },
  );
  return githubRepositorySchema.parse(await parseGithubResponse(response));
}

export async function getOrCreateDefaultGithubRepository(
  accessToken: string,
  login: string,
): Promise<GithubRepository> {
  const requireReadyRepository = (
    repository: GithubRepository,
  ): GithubRepository => {
    if (
      repository.private ||
      repository.archived ||
      repository.permissions?.push !== true
    ) {
      throw new Error(
        'The existing leetcode-solutions repository must be public, unarchived, and writable. No extra repository was created.',
      );
    }
    return repository;
  };

  const getOwnedRepository = async (
    name: string,
  ): Promise<GithubRepository | null> => {
    const response = await fetch(
      `${GITHUB_API}/repos/${encodeURIComponent(login)}/${encodeURIComponent(name)}`,
      { headers: githubHeaders(accessToken) },
    );
    if (response.status === 404) return null;
    return githubRepositorySchema.parse(await parseGithubResponse(response));
  };

  const preferred = await getOwnedRepository('leetcode-solutions');
  if (preferred) return requireReadyRepository(preferred);

  const createRepository = async (name: string): Promise<Response> =>
    fetch(`${GITHUB_API}/user/repos`, {
      method: 'POST',
      headers: {
        ...githubHeaders(accessToken),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name,
        description: 'Accepted LeetCode solutions synced by LeetSync',
        private: false,
        auto_init: true,
      }),
    });

  const created = await createRepository('leetcode-solutions');
  if (created.ok) {
    return requireReadyRepository(
      githubRepositorySchema.parse(await created.json()),
    );
  }
  if (created.status !== 422) await parseGithubResponse(created);

  const raced = await getOwnedRepository('leetcode-solutions');
  if (raced) return requireReadyRepository(raced);
  throw new Error(
    'GitHub could not create leetcode-solutions because that repository name is unavailable. No extra repository was created.',
  );
}

async function getGithubFile(
  accessToken: string,
  owner: string,
  repository: string,
  path: string,
  branch: string,
): Promise<{ content: string; sha: string } | null> {
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  const url = `${GITHUB_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`;
  const response = await fetch(url, { headers: githubHeaders(accessToken) });
  if (response.status === 404) return null;
  return contentResponseSchema.parse(await parseGithubResponse(response));
}

async function getLatestCommitSha(
  accessToken: string,
  owner: string,
  repository: string,
  path: string,
  branch: string,
): Promise<string> {
  const query = new URLSearchParams({ path, sha: branch, per_page: '1' });
  const response = await fetch(
    `${GITHUB_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/commits?${query}`,
    { headers: githubHeaders(accessToken) },
  );
  const data = z
    .array(commitResponseSchema)
    .parse(await parseGithubResponse(response));
  if (!data[0])
    throw new Error('GitHub did not return a commit for the written file');
  return data[0].sha;
}

async function getBranchHead(
  accessToken: string,
  owner: string,
  repository: string,
  branch: string,
): Promise<{ sha: string; treeSha: string }> {
  const encodedBranch = branch.split('/').map(encodeURIComponent).join('/');
  const refUrl = `${GITHUB_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/git/ref/heads/${encodedBranch}`;
  const ref = refResponseSchema.parse(
    await parseGithubResponse(
      await fetch(refUrl, { headers: githubHeaders(accessToken) }),
    ),
  );
  const commitUrl = `${GITHUB_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/git/commits/${ref.object.sha}`;
  const commit = commitDetailsSchema.parse(
    await parseGithubResponse(
      await fetch(commitUrl, { headers: githubHeaders(accessToken) }),
    ),
  );
  return { sha: commit.sha, treeSha: commit.tree.sha };
}

async function getTextFile(
  accessToken: string,
  owner: string,
  repository: string,
  path: string,
  branch: string,
): Promise<string | null> {
  const file = await getGithubFile(
    accessToken,
    owner,
    repository,
    path,
    branch,
  );
  if (!file) return null;
  return Buffer.from(file.content.replace(/\s/g, ''), 'base64').toString(
    'utf8',
  );
}

/** Creates one dated Git commit containing every changed solution file. */
export async function createGithubCommit(input: {
  accessToken: string;
  owner: string;
  repository: string;
  branch: string;
  files: Array<{ path: string; content: string }>;
  message: string;
  author: GithubCommitAuthor;
  committer: GithubCommitAuthor;
}): Promise<string> {
  const repoUrl = `${GITHUB_API}/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repository)}`;
  const currentFiles = await Promise.all(
    input.files.map(async (file) => ({
      ...file,
      current: await getTextFile(
        input.accessToken,
        input.owner,
        input.repository,
        file.path,
        input.branch,
      ),
    })),
  );
  const head = await getBranchHead(
    input.accessToken,
    input.owner,
    input.repository,
    input.branch,
  );
  if (currentFiles.every((file) => file.current === file.content)) {
    return getLatestCommitSha(
      input.accessToken,
      input.owner,
      input.repository,
      input.files[0]?.path ?? 'README.md',
      input.branch,
    );
  }

  const treeResponse = await fetch(`${repoUrl}/git/trees`, {
    method: 'POST',
    headers: {
      ...githubHeaders(input.accessToken),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      base_tree: head.treeSha,
      tree: currentFiles.map(({ path, content }) => ({
        path,
        mode: '100644',
        type: 'blob',
        content,
      })),
    }),
  });
  const tree = z
    .object({ sha: z.string().min(1) })
    .parse(await parseGithubResponse(treeResponse));

  const commitResponse = await fetch(`${repoUrl}/git/commits`, {
    method: 'POST',
    headers: {
      ...githubHeaders(input.accessToken),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: input.message,
      tree: tree.sha,
      parents: [head.sha],
      author: input.author,
      committer: input.committer,
    }),
  });
  const commit = commitResponseSchema.parse(
    await parseGithubResponse(commitResponse),
  );

  const encodedBranch = input.branch
    .split('/')
    .map(encodeURIComponent)
    .join('/');
  const updateResponse = await fetch(
    `${repoUrl}/git/refs/heads/${encodedBranch}`,
    {
      method: 'PATCH',
      headers: {
        ...githubHeaders(input.accessToken),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sha: commit.sha, force: false }),
    },
  );
  await parseGithubResponse(updateResponse);
  return commit.sha;
}
