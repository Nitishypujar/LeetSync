import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const LOCAL_DATABASE_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  'postgres',
]);

function parseDatabaseUrlFromEnvFile(contents: string): string | undefined {
  for (const line of contents.split(/\r?\n/)) {
    const assignment = line.trim().replace(/^export\s+/, '');
    const separator = assignment.indexOf('=');

    if (
      separator < 0 ||
      assignment.slice(0, separator).trim() !== 'DATABASE_URL'
    ) {
      continue;
    }

    const value = assignment.slice(separator + 1).trim();
    if (!value) return '';

    const quote = value[0];
    if ((quote === '"' || quote === "'") && value.endsWith(quote)) {
      const unquoted = value.slice(1, -1);
      return quote === '"'
        ? unquoted
            .replace(/\\n/g, '\n')
            .replace(/\\"/g, '"')
            .replace(/\\\\/g, '\\')
        : unquoted;
    }

    return value.replace(/\s+#.*$/, '').trim();
  }

  return undefined;
}

export function resolveDatabaseUrl(
  environment: NodeJS.ProcessEnv = process.env,
  envFilePath = resolve(process.cwd(), '.env'),
): string | undefined {
  if (environment.DATABASE_URL !== undefined) {
    return environment.DATABASE_URL.trim();
  }

  try {
    return parseDatabaseUrlFromEnvFile(readFileSync(envFilePath, 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

export function isLocalDatabaseUrl(databaseUrl: string): boolean {
  try {
    const url = new URL(databaseUrl);
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    return (
      (url.protocol === 'postgres:' || url.protocol === 'postgresql:') &&
      LOCAL_DATABASE_HOSTS.has(hostname)
    );
  } catch {
    return false;
  }
}

export function assertLocalDatabaseTarget(
  environment: NodeJS.ProcessEnv = process.env,
  envFilePath?: string,
): void {
  const databaseUrl = resolveDatabaseUrl(environment, envFilePath);
  if (!databaseUrl) {
    throw new Error(
      'Refusing database administration: DATABASE_URL is missing. Configure a local PostgreSQL database first.',
    );
  }

  if (!isLocalDatabaseUrl(databaseUrl)) {
    throw new Error(
      'Refusing database administration: this command only accepts localhost, 127.0.0.1, ::1, or the Docker Compose host "postgres". Do not point local migration or database-test commands at hosted Supabase.',
    );
  }
}

export function assertDatabaseTestTarget(
  environment: NodeJS.ProcessEnv = process.env,
  envFilePath?: string,
): void {
  if (environment.RUN_DB_TESTS === 'true') {
    assertLocalDatabaseTarget(environment, envFilePath);
  }
}
