import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchWithTimeout } from './http.js';

afterEach(() => vi.unstubAllGlobals());

describe('bounded provider requests', () => {
  it('aborts a provider request that exceeds its deadline', async () => {
    const fetchMock = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(init.signal?.reason),
            { once: true },
          );
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      fetchWithTimeout('https://api.github.com/user', {}, 5),
    ).rejects.toMatchObject({ name: 'TimeoutError' });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });

  it('preserves a caller abort signal while also applying its deadline', async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(init.signal?.reason),
            { once: true },
          );
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const request = fetchWithTimeout(
      'https://api.github.com/user',
      { signal: controller.signal },
      1_000,
    );
    controller.abort();

    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });

  it('rejects invalid timeout values before calling the provider', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    expect(() =>
      fetchWithTimeout('https://api.github.com/user', {}, 0),
    ).toThrow('HTTP timeout must be a positive safe integer');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
