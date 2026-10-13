import { describe, expect, it } from 'vitest';
import { getDatabasePoolConfig } from './db-config.js';

describe('database TLS configuration', () => {
  it('uses the Supabase root CA with strict certificate verification', () => {
    const config = getDatabasePoolConfig(
      'postgresql://test-user:test-password@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?schema=public&sslmode=require',
      '',
    );

    expect(config.ssl?.rejectUnauthorized).toBe(true);
    expect(config.ssl?.ca).toContain('-----BEGIN CERTIFICATE-----');

    const url = new URL(config.connectionString);
    expect(url.searchParams.get('schema')).toBe('public');
    expect(url.searchParams.has('sslmode')).toBe(false);
  });

  it('leaves local PostgreSQL connection configuration unchanged', () => {
    const connectionString =
      'postgresql://leetsync:leetsync@localhost:5432/leetsync?schema=public';

    expect(getDatabasePoolConfig(connectionString, '')).toEqual({
      connectionString,
    });
  });
});
