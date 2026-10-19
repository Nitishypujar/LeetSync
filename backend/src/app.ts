import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { healthResponseSchema } from '@leetsync/shared';
import { registerAuthRoutes } from './auth.js';
import { registerGithubRoutes } from './github-routes.js';
import { registerLeetcodeRoutes } from './leetcode-routes.js';
import { registerExtensionRoutes } from './extension-routes.js';
import { registerDashboardRoutes } from './dashboard-routes.js';
import { issueCsrfCookie } from './sessions.js';
import { getEnv } from './config.js';

export function createApp(): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());

  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
    next();
  });

  app.use((req, res, next) => {
    const origin = req.get('origin');
    const env = getEnv();
    const allowedOrigins = new Set([
      new URL(env.FRONTEND_ORIGIN).origin,
      ...(env.EXTENSION_ID ? [`chrome-extension://${env.EXTENSION_ID}`] : []),
    ]);
    if (
      ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) &&
      origin &&
      !allowedOrigins.has(origin)
    ) {
      res.status(403).json({ error: 'ORIGIN_NOT_ALLOWED' });
      return;
    }
    if (origin && allowedOrigins.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Authorization, Content-Type, X-CSRF-Token',
      );
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
      res.setHeader('Vary', 'Origin');
    }
    if (req.method === 'OPTIONS') {
      res.status(204).send();
      return;
    }
    next();
  });

  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  app.get('/health', (_req, res) => {
    res.status(200).json(
      healthResponseSchema.parse({
        status: 'ok',
        service: 'leetsync-api',
        version: '0.1.0',
      }),
    );
  });

  app.get('/api/auth/bootstrap', (_req, res) => {
    const csrfToken = issueCsrfCookie(res);
    res.status(200).json({ csrfToken, loginUrl: '/api/auth/github' });
  });

  registerAuthRoutes(app);
  registerGithubRoutes(app);
  registerLeetcodeRoutes(app);
  registerExtensionRoutes(app);
  registerDashboardRoutes(app);

  if (getEnv().NODE_ENV === 'production') {
    const frontendDirectory = resolve(
      fileURLToPath(new URL('.', import.meta.url)),
      '../../frontend/dist',
    );
    app.use(
      express.static(frontendDirectory, {
        index: false,
        maxAge: '1d',
        etag: true,
      }),
    );
    app.get(/^\/(?!api(?:\/|$)|health$).*/, (_req, res, next) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(resolve(frontendDirectory, 'index.html'), (error) => {
        if (error) next(error);
      });
    });
  }

  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      next: express.NextFunction,
    ) => {
      void next;
      const status =
        typeof error === 'object' && error !== null && 'status' in error
          ? error.status
          : undefined;
      const type =
        typeof error === 'object' && error !== null && 'type' in error
          ? error.type
          : undefined;
      if (status === 413 || type === 'entity.too.large') {
        res.status(413).json({ error: 'REQUEST_TOO_LARGE' });
        return;
      }
      if (status === 400 || type === 'entity.parse.failed') {
        res.status(400).json({ error: 'INVALID_REQUEST_BODY' });
        return;
      }
      res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
    },
  );

  return app;
}
