import { describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { rateLimit } from './rate-limit.js';

function invoke(
  middleware: ReturnType<typeof rateLimit>,
  userId?: string,
): { next: ReturnType<typeof vi.fn>; status: number | null } {
  const next = vi.fn<NextFunction>();
  let status: number | null = null;
  const request = {
    ip: '10.0.0.2',
    socket: { remoteAddress: '10.0.0.2' },
  } as Request;
  const response = {
    locals: userId ? { user: { id: userId } } : {},
    setHeader: vi.fn(),
    status(code: number) {
      status = code;
      return this;
    },
    json: vi.fn(),
  } as unknown as Response;

  middleware(request, response, next as unknown as NextFunction);
  return { next, status };
}

describe('route rate limits', () => {
  it('rejects requests over the limit with a retry hint', () => {
    const middleware = rateLimit(1, 60_000);
    expect(invoke(middleware, 'user-a').next).toHaveBeenCalledTimes(1);

    const limited = invoke(middleware, 'user-a');
    expect(limited.status).toBe(429);
  });

  it('isolates authenticated users behind the same reverse proxy', () => {
    const middleware = rateLimit(1, 60_000);
    expect(invoke(middleware, 'user-a').status).toBeNull();
    expect(invoke(middleware, 'user-b').status).toBeNull();
    expect(invoke(middleware, 'user-a').status).toBe(429);
  });
});
