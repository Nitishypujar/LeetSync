import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildGithubAuthorizeUrl,
  createGithubCommit,
  getOrCreateDefaultGithubRepository,
} from './github.js';

const repository = {
  id: 123,
  name: 'leetcode-solutions',
  full_name: 'octocat/leetcode-solutions',
  owner: { login: 'octocat' },
  default_branch: 'main',
  private: false,
  archived: false,
  html_url: 'https://github.com/octocat/leetcode-solutions',
  permissions: { push: true },
};

beforeEach(() => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = 'postgresql://localhost:5432/leetsync_test';
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

afterEach(() => vi.unstubAllGlobals());

describe('GitHub OAuth and repository setup', () => {
  it('requests access to public repositories only', () => {
    const url = new URL(buildGithubAuthorizeUrl('state'));
    expect(url.searchParams.get('scope')).toBe('public_repo');
  });

  it('reuses the owned default repository without changing its contents', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify(repository), { status: 200 }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const result = await getOrCreateDefaultGithubRepository('token', 'octocat');

    expect(result.name).toBe('leetcode-solutions');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBeUndefined();
  });

  it.each([
    { private: true, archived: false, permissions: { push: true } },
    { private: false, archived: true, permissions: { push: true } },
    { private: false, archived: false, permissions: { push: false } },
  ])(
    'does not claim an unavailable canonical repository is ready: %o',
    async (state) => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ...repository, ...state }), {
          status: 200,
        }),
      );
      vi.stubGlobal('fetch', fetchMock);

      await expect(
        getOrCreateDefaultGithubRepository('token', 'octocat'),
      ).rejects.toThrow(/must be public, unarchived, and writable/);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0]?.[1]?.method).toBeUndefined();
    },
  );

  it('creates one public initialized repository under the canonical name', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('{}', { status: 404 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(repository), { status: 201 }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const result = await getOrCreateDefaultGithubRepository('token', 'octocat');

    expect(result.name).toBe('leetcode-solutions');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const createCall = fetchMock.mock.calls[1];
    expect(JSON.parse(String(createCall?.[1]?.body))).toMatchObject({
      private: false,
      auto_init: true,
      name: 'leetcode-solutions',
    });
  });

  it('does not create a differently named repository when the canonical name conflicts', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('{}', { status: 404 }))
      .mockResolvedValueOnce(new Response('{}', { status: 422 }))
      .mockResolvedValueOnce(new Response('{}', { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      getOrCreateDefaultGithubRepository('token', 'octocat'),
    ).rejects.toThrow(/No extra repository was created/);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe('dated Git commits', () => {
  it('writes all solution files in one default-branch commit with submission authorship', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('{}', { status: 404 }))
      .mockResolvedValueOnce(new Response('{}', { status: 404 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ object: { sha: 'parent-commit' } }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ sha: 'parent-commit', tree: { sha: 'base-tree' } }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ sha: 'new-tree' }), { status: 201 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ sha: 'new-commit' }), { status: 201 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ref: 'refs/heads/main' }), {
          status: 200,
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const author = {
      name: 'Octocat',
      email: '123+octocat@users.noreply.github.com',
      date: '2024-02-01T12:00:00.000+05:30',
    };
    const sha = await createGithubCommit({
      accessToken: 'token',
      owner: 'octocat',
      repository: 'leetcode-solutions',
      branch: 'main',
      files: [
        { path: 'solutions/1-example/solution.py', content: 'print(1)' },
        {
          path: 'solutions/1-example/README.md',
          content:
            '# Example\n\n[View problem on LeetCode](https://leetcode.com/problems/example/)',
        },
      ],
      message: 'Solved #1 Example (python3) - 4 ms, 12 MB',
      author,
      committer: author,
    });

    expect(sha).toBe('new-commit');
    const treeCall = fetchMock.mock.calls[4];
    expect(JSON.parse(String(treeCall?.[1]?.body))).toMatchObject({
      base_tree: 'base-tree',
      tree: [
        {
          path: 'solutions/1-example/solution.py',
          type: 'blob',
          mode: '100644',
        },
        {
          path: 'solutions/1-example/README.md',
          type: 'blob',
          mode: '100644',
        },
      ],
    });
    const commitCall = fetchMock.mock.calls[5];
    expect(JSON.parse(String(commitCall?.[1]?.body))).toMatchObject({
      message: 'Solved #1 Example (python3) - 4 ms, 12 MB',
      author,
      committer: author,
      parents: ['parent-commit'],
      tree: 'new-tree',
    });
    expect(String(fetchMock.mock.calls[6]?.[0])).toContain(
      '/git/refs/heads/main',
    );
  });
});
