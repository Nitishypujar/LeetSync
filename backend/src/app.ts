import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { healthResponseSchema } from '@leetsync/shared';

export function createApp(): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(express.json({ limit: '256kb' }));
  app.use(cookieParser());

  app.get('/health', (_req, res) => {
    res.status(200).json(healthResponseSchema.parse({
      status: 'ok', service: 'leetsync-api', version: '0.1.0',
    }));
  });
  return app;
}
