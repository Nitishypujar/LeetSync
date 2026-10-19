import type { NextFunction, Request, Response } from 'express';
import { isIP } from 'node:net';
import { getEnv } from './config.js';

type Bucket = { count: number; resetAt: number };
type RateLimitOptions = {
  trustCloudflareIp?: boolean;
  maxBuckets?: number;
};
const DEFAULT_MAX_BUCKETS = 4096;

/** A small per-process limiter for sensitive routes in the single API service. */
export function rateLimit(
  limit: number,
  windowMs: number,
  options: RateLimitOptions = {},
) {
  const buckets = new Map<string, Bucket>();
  const trustCloudflareIp =
    options.trustCloudflareIp ?? getEnv().TRUST_CF_CONNECTING_IP === 'true';
  const maxBuckets = Math.max(
    1,
    Math.floor(options.maxBuckets ?? DEFAULT_MAX_BUCKETS),
  );

  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    const principalId =
      (res.locals.extensionUserId as string | undefined) ??
      (res.locals.user as { id?: string } | undefined)?.id;
    const cloudflareIp = req.get('cf-connecting-ip')?.trim();
    const clientIp =
      trustCloudflareIp && cloudflareIp && isIP(cloudflareIp)
        ? cloudflareIp
        : req.ip || req.socket.remoteAddress || 'unknown';
    const key = principalId ? `user:${principalId}` : `ip:${clientIp}`;
    let bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      if (!bucket && buckets.size >= maxBuckets) {
        for (const [entryKey, entry] of buckets) {
          if (entry.resetAt <= now) buckets.delete(entryKey);
        }
        if (buckets.size >= maxBuckets) {
          let earliestKey: string | undefined;
          let earliestReset = Number.POSITIVE_INFINITY;
          for (const [entryKey, entry] of buckets) {
            if (entry.resetAt < earliestReset) {
              earliestKey = entryKey;
              earliestReset = entry.resetAt;
            }
          }
          if (earliestKey !== undefined) buckets.delete(earliestKey);
        }
      }
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;
    if (bucket.count > limit) {
      res.setHeader(
        'Retry-After',
        Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
      );
      res.status(429).json({ error: 'RATE_LIMITED' });
      return;
    }

    next();
  };
}
