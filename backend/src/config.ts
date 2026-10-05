import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  TOKEN_ENCRYPTION_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/),
  GITHUB_CLIENT_ID: z.string().min(1),
  GITHUB_CLIENT_SECRET: z.string().min(1),
  GITHUB_CALLBACK_URL: z.string().url(),
  FRONTEND_ORIGIN: z.string().url(),
});

let parsedEnv: z.infer<typeof envSchema> | undefined;

export function getEnv(): z.infer<typeof envSchema> {
  parsedEnv ??= envSchema.parse(process.env);
  return parsedEnv;
}
