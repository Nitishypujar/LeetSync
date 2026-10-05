import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { healthResponseSchema } from '@leetsync/shared';
import { getEnv } from './config.js';
import { registerAuthRoutes } from './auth.js';
import { issueCsrfCookie } from './sessions.js';

export function createApp(): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());

  app.use((req, res, next) => {
    const origin = req.get('origin');
    const allowedOrigin = process.env.FRONTEND_ORIGIN;
    if (origin && allowedOrigin && origin === allowedOrigin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, X-CSRF-Token',
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

  app.use(express.json({ limit: '256kb' }));
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

  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      next: express.NextFunction,
    ) => {
      void next;
      const message =
        error instanceof Error ? error.message : 'Internal server error';
      if (getEnv().NODE_ENV !== 'production') {
        res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message });
        return;
      }
      res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
    },
  );

  return app;
}
