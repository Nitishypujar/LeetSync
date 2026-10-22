import { describe, expect, it } from 'vitest';
import { formatError } from './sync-worker.js';

describe('formatError', () => {
  it('keeps only the known safe GitHub status diagnostic', () => {
    expect(formatError(new Error('GitHub request failed (503)'))).toBe(
      'GitHub request failed (503)',
    );
  });

  it('does not persist arbitrary upstream messages or secrets', () => {
    const source = 'int main(){ return 42; }';
    const secret = 'non-production-credential-sentinel';
    const databaseUrl = 'postgresql://user:password@db.example.test/app';
    const formatted = formatError(
      new Error(`${source} ${secret} ${databaseUrl}`),
    );

    expect(formatted).toBe('Sync failed due to an internal error.');
    expect(formatted).not.toContain(source);
    expect(formatted).not.toContain(secret);
    expect(formatted).not.toContain(databaseUrl);
  });

  it('does not expose unknown values or stack details', () => {
    expect(formatError({ message: 'sensitive payload' })).toBe(
      'Sync failed due to an internal error.',
    );
    const error = new Error('unknown failure');
    error.stack = 'stack containing private data';
    expect(formatError(error)).toBe('Sync failed due to an internal error.');
  });
});
