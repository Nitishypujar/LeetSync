import type { NextFunction, Request, Response } from 'express';

type Bucket = { count: number; resetAt: number };

/** A small per-process limiter for sensitive routes in the single API service. */
export function rateLimit(limit: number, windowMs: number) {
  const buckets = new Map<string, Bucket>();

  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    const principalId =
      (res.locals.extensionUserId as string | undefined) ??
      (res.locals.user as { id?: string } | undefined)?.id;
    const key = principalId
      ? `user:${principalId}`
      : `ip:${req.ip || req.socket.remoteAddress || 'unknown'}`;
    let bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
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

    if (buckets.size > 4096) {
      for (const [entryKey, entry] of buckets) {
        if (entry.resetAt <= now) buckets.delete(entryKey);
      }
    }

    next();
  };
}
