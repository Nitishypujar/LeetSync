import { beforeEach, describe, expect, it } from 'vitest';
import {
  decryptSecret,
  encryptSecret,
  equalSecrets,
  hashToken,
} from './crypto.js';

beforeEach(() => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL =
    'postgresql://leetsync:leetsync@localhost:5432/leetsync';
  process.env.SESSION_SECRET =
    'test-session-secret-which-is-long-enough-123456';
  process.env.TOKEN_ENCRYPTION_KEY =
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  process.env.GITHUB_CLIENT_ID = 'test-client';
  process.env.GITHUB_CLIENT_SECRET = 'test-secret';
  process.env.GITHUB_CALLBACK_URL =
    'http://localhost:3000/api/auth/github/callback';
  process.env.FRONTEND_ORIGIN = 'http://localhost:5173';
});

describe('crypto helpers', () => {
  it('encrypts and decrypts token material', () => {
    const plaintext = 'github-token-example';
    const encrypted = encryptSecret(plaintext);
    expect(encrypted).not.toContain(plaintext);
    expect(decryptSecret(encrypted)).toBe(plaintext);
  });

  it('hashes deterministically and compares secrets safely', () => {
    expect(hashToken('abc')).toBe(hashToken('abc'));
    expect(hashToken('abc')).not.toBe(hashToken('abcd'));
    expect(equalSecrets('abc', 'abc')).toBe(true);
    expect(equalSecrets('abc', 'abd')).toBe(false);
  });
});
