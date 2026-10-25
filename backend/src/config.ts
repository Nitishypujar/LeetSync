import { z } from 'zod';

const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    RUN_SYNC_WORKER: z.enum(['true', 'false']).default('false'),
    TRUST_CF_CONNECTING_IP: z.enum(['true', 'false']).default('false'),
    GITHUB_AUTH_MODE: z.enum(['oauth', 'github_app']).default('oauth'),
    DATABASE_URL: z.string().min(1),
    SESSION_SECRET: z.string().min(32),
    TOKEN_ENCRYPTION_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/),
    TOKEN_ENCRYPTION_KEY_PREVIOUS: z
      .string()
      .regex(/^[0-9a-fA-F]{64}$/)
      .optional(),
    GITHUB_CLIENT_ID: z.string().min(1),
    GITHUB_CLIENT_SECRET: z.string().min(1),
    GITHUB_APP_ID: z.string().regex(/^\d+$/).optional(),
    GITHUB_APP_SLUG: z.string().min(1).optional(),
    GITHUB_APP_PRIVATE_KEY: z.string().min(1).optional(),
    GITHUB_CALLBACK_URL: z.string().url(),
    FRONTEND_ORIGIN: z.string().url(),
    EXTENSION_ID: z.string().default(''),
  })
  .superRefine((env, context) => {
    if (env.GITHUB_AUTH_MODE === 'github_app') {
      for (const key of [
        'GITHUB_APP_ID',
        'GITHUB_APP_SLUG',
        'GITHUB_APP_PRIVATE_KEY',
      ] as const) {
        if (!env[key]) {
          context.addIssue({
            code: 'custom',
            path: [key],
            message: 'Required when GITHUB_AUTH_MODE=github_app',
          });
        }
      }
    }
    if (env.NODE_ENV !== 'production') return;

    const secretValues = [
      ['SESSION_SECRET', env.SESSION_SECRET],
      ['TOKEN_ENCRYPTION_KEY', env.TOKEN_ENCRYPTION_KEY],
      ['GITHUB_CLIENT_ID', env.GITHUB_CLIENT_ID],
      ['GITHUB_CLIENT_SECRET', env.GITHUB_CLIENT_SECRET],
      ...(env.GITHUB_AUTH_MODE === 'github_app'
        ? ([
            ['GITHUB_APP_ID', env.GITHUB_APP_ID ?? ''],
            ['GITHUB_APP_SLUG', env.GITHUB_APP_SLUG ?? ''],
            ['GITHUB_APP_PRIVATE_KEY', env.GITHUB_APP_PRIVATE_KEY ?? ''],
          ] as const)
        : []),
    ] as const;
    const placeholder =
      /^(?:replace(?:[-_ ]with)?|change[-_ ]me|your[-_ ]|example[-_ ]|test[-_ ]|dummy[-_ ])/i;
    for (const [name, value] of secretValues) {
      if (placeholder.test(value)) {
        context.addIssue({
          code: 'custom',
          path: [name],
          message: 'Production secrets cannot contain example placeholders',
        });
      }
    }

    const publicUrls = [
      ['GITHUB_CALLBACK_URL', env.GITHUB_CALLBACK_URL],
      ['FRONTEND_ORIGIN', env.FRONTEND_ORIGIN],
    ] as const;
    for (const [name, value] of publicUrls) {
      const url = new URL(value);
      if (
        url.protocol !== 'https:' ||
        ['localhost', '127.0.0.1', '::1'].includes(url.hostname) ||
        url.username ||
        url.password
      ) {
        context.addIssue({
          code: 'custom',
          path: [name],
          message: 'Production public URLs must use HTTPS and a public host',
        });
      }
    }

    const frontend = new URL(env.FRONTEND_ORIGIN);
    if (frontend.pathname !== '/' || frontend.search || frontend.hash) {
      context.addIssue({
        code: 'custom',
        path: ['FRONTEND_ORIGIN'],
        message: 'Production frontend origin must not include a path or query',
      });
    }
  });

export function parseEnvironment(input: NodeJS.ProcessEnv) {
  return envSchema.parse(input);
}

let parsedEnv: z.infer<typeof envSchema> | undefined;

export function getEnv(): z.infer<typeof envSchema> {
  parsedEnv ??= parseEnvironment(process.env);
  return parsedEnv;
}
