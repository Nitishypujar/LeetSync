import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  assertDatabaseTestTarget,
  assertLocalDatabaseTarget,
  isLocalDatabaseUrl,
  resolveDatabaseUrl,
} from './local-db-guard.js';

const temporaryDirectories: string[] = [];

function temporaryEnvFile(contents: string): string {
  const directory = mkdtempSync(join(tmpdir(), 'leetsync-db-guard-'));
  temporaryDirectories.push(directory);
  const filePath = join(directory, '.env');
  writeFileSync(filePath, contents, 'utf8');
  return filePath;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('local database safety guard', () => {
  it.each([
    'postgresql://user:password@localhost:5432/leetsync',
    'postgresql://user:password@127.0.0.1:5432/leetsync',
    'postgresql://user:password@[::1]:5432/leetsync',
    'postgresql://user:password@postgres:5432/leetsync',
  ])('accepts local PostgreSQL target %s', (databaseUrl) => {
    expect(isLocalDatabaseUrl(databaseUrl)).toBe(true);
    expect(() =>
      assertLocalDatabaseTarget({ DATABASE_URL: databaseUrl }),
    ).not.toThrow();
  });

  it.each([
    'postgresql://user:password@db.example.com:5432/leetsync',
    'postgresql://user:password@aws-0.pooler.supabase.com:5432/postgres',
    'not-a-database-url',
  ])('rejects non-local or malformed target %s', (databaseUrl) => {
    expect(isLocalDatabaseUrl(databaseUrl)).toBe(false);
    expect(() =>
      assertLocalDatabaseTarget({ DATABASE_URL: databaseUrl }),
    ).toThrow(/only accepts localhost/);
  });

  it('reads a quoted DATABASE_URL from an env file without displaying it', () => {
    const envFile = temporaryEnvFile(
      'NODE_ENV=development\nDATABASE_URL="postgresql://user:password@localhost:5432/leetsync"\n',
    );

    expect(resolveDatabaseUrl({}, envFile)).toBe(
      'postgresql://user:password@localhost:5432/leetsync',
    );
    expect(() => assertLocalDatabaseTarget({}, envFile)).not.toThrow();
  });

  it('prefers the process environment over an env file', () => {
    const envFile = temporaryEnvFile(
      'DATABASE_URL=postgresql://user:password@db.example.com:5432/leetsync\n',
    );

    expect(() =>
      assertLocalDatabaseTarget(
        { DATABASE_URL: 'postgresql://user:password@localhost:5432/leetsync' },
        envFile,
      ),
    ).not.toThrow();
  });

  it('fails closed when no database URL is configured', () => {
    expect(() =>
      assertLocalDatabaseTarget({ DATABASE_URL: '' }, 'missing.env'),
    ).toThrow(/DATABASE_URL is missing/);
  });

  it('checks the target before enabling database integration tests', () => {
    const envFile = temporaryEnvFile(
      'DATABASE_URL=postgresql://user:password@db.example.com:5432/leetsync\n',
    );

    expect(() =>
      assertDatabaseTestTarget({ RUN_DB_TESTS: 'false' }, envFile),
    ).not.toThrow();
    expect(() =>
      assertDatabaseTestTarget({ RUN_DB_TESTS: 'true' }, envFile),
    ).toThrow(/only accepts localhost/);
  });
});
