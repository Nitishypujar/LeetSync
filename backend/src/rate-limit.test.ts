import { describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { rateLimit } from './rate-limit.js';

function invoke(
  middleware: ReturnType<typeof rateLimit>,
  userId?: string,
  ip = '10.0.0.2',
  cfConnectingIp?: string,
): { next: ReturnType<typeof vi.fn>; status: number | null } {
  const next = vi.fn<NextFunction>();
  let status: number | null = null;
  const request = {
    ip,
    socket: { remoteAddress: ip },
    get: (name: string) =>
      name.toLowerCase() === 'cf-connecting-ip' ? cfConnectingIp : undefined,
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

  it('uses a valid Cloudflare client IP only when explicitly trusted', () => {
    const middleware = rateLimit(1, 60_000, { trustCloudflareIp: true });
    expect(
      invoke(middleware, undefined, '10.0.0.2', '203.0.113.1').status,
    ).toBe(null);
    expect(
      invoke(middleware, undefined, '10.0.0.2', '203.0.113.2').status,
    ).toBe(null);
    expect(
      invoke(middleware, undefined, '10.0.0.2', '203.0.113.1').status,
    ).toBe(429);
  });

  it('ignores malformed Cloudflare addresses and bounds its bucket map', () => {
    const malformedHeader = rateLimit(1, 60_000, {
      trustCloudflareIp: true,
    });
    expect(
      invoke(malformedHeader, undefined, '10.0.0.2', 'not-an-ip').status,
    ).toBeNull();
    expect(
      invoke(malformedHeader, undefined, '10.0.0.2', 'also-not-an-ip').status,
    ).toBe(429);

    const bounded = rateLimit(1, 60_000, { maxBuckets: 2 });
    expect(invoke(bounded, undefined, '10.0.0.1').status).toBeNull();
    expect(invoke(bounded, undefined, '10.0.0.2').status).toBeNull();
    expect(invoke(bounded, undefined, '10.0.0.3').status).toBeNull();
    expect(invoke(bounded, undefined, '10.0.0.1').status).toBeNull();
  });
});
