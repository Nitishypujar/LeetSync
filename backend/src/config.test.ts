import { describe, expect, it } from 'vitest';
import { parseEnvironment } from './config.js';

const productionEnvironment = {
  NODE_ENV: 'production',
  PORT: '3000',
  DATABASE_URL: 'postgresql://user:password@db.example.com:5432/leetsync',
  SESSION_SECRET: 'production-session-secret-with-more-than-32-characters',
  TOKEN_ENCRYPTION_KEY:
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  GITHUB_CLIENT_ID: 'github-client-id',
  GITHUB_CLIENT_SECRET: 'github-client-secret',
  GITHUB_CALLBACK_URL: 'https://api.example.com/api/auth/github/callback',
  FRONTEND_ORIGIN: 'https://app.example.com',
  EXTENSION_ID: 'nadlcboffmafknogdcgohdcledaomppo',
};

describe('production environment validation', () => {
  it('accepts HTTPS public origins and callback URLs', () => {
    expect(() => parseEnvironment(productionEnvironment)).not.toThrow();
  });

  it('does not trust the Cloudflare client IP header by default', () => {
    expect(parseEnvironment(productionEnvironment).TRUST_CF_CONNECTING_IP).toBe(
      'false',
    );
  });

  it('allows an explicit Cloudflare client IP trust setting', () => {
    expect(
      parseEnvironment({
        ...productionEnvironment,
        TRUST_CF_CONNECTING_IP: 'true',
      }).TRUST_CF_CONNECTING_IP,
    ).toBe('true');
    expect(() =>
      parseEnvironment({
        ...productionEnvironment,
        TRUST_CF_CONNECTING_IP: 'yes',
      }),
    ).toThrow();
  });

  it('rejects insecure or local production callback URLs', () => {
    for (const callback of [
      'http://api.example.com/api/auth/github/callback',
      'https://localhost/api/auth/github/callback',
      'https://127.0.0.1/api/auth/github/callback',
    ]) {
      expect(() =>
        parseEnvironment({
          ...productionEnvironment,
          GITHUB_CALLBACK_URL: callback,
        }),
      ).toThrow();
    }
  });

  it('rejects insecure or non-origin production frontend URLs', () => {
    for (const origin of [
      'http://app.example.com',
      'https://app.example.com/dashboard',
      'https://app.example.com/?next=other',
    ]) {
      expect(() =>
        parseEnvironment({ ...productionEnvironment, FRONTEND_ORIGIN: origin }),
      ).toThrow();
    }
  });

  it('rejects sample credentials in production configuration', () => {
    expect(() =>
      parseEnvironment({
        ...productionEnvironment,
        SESSION_SECRET:
          'replace-with-a-long-random-secret-at-least-32-characters',
      }),
    ).toThrow();
    expect(() =>
      parseEnvironment({
        ...productionEnvironment,
        GITHUB_CLIENT_SECRET: 'replace-me',
      }),
    ).toThrow();
  });

  it('keeps local development origins available outside production', () => {
    expect(() =>
      parseEnvironment({
        ...productionEnvironment,
        NODE_ENV: 'development',
        GITHUB_CALLBACK_URL: 'http://localhost:3000/api/auth/github/callback',
        FRONTEND_ORIGIN: 'http://localhost:5173',
      }),
    ).not.toThrow();
  });
});
