import assert from 'node:assert/strict';
import test from 'node:test';
import { approvedStoreUrl } from '../src/store-links.mjs';

test('accepts an HTTPS listing on the exact official store host', () => {
  assert.equal(
    approvedStoreUrl(
      'https://chromewebstore.google.com/detail/leetsync/abc123',
      'chromewebstore.google.com',
    ),
    'https://chromewebstore.google.com/detail/leetsync/abc123',
  );
});

test('accepts the official Edge Add-ons host', () => {
  assert.equal(
    approvedStoreUrl(
      'https://microsoftedge.microsoft.com/addons/detail/leetsync/abc123',
      'microsoftedge.microsoft.com',
    ),
    'https://microsoftedge.microsoft.com/addons/detail/leetsync/abc123',
  );
});

test('rejects missing, malformed, insecure, lookalike, or credentialed URLs', () => {
  for (const value of [
    undefined,
    '',
    'not a URL',
    'http://chromewebstore.google.com/detail/leetsync/abc123',
    'https://chromewebstore.google.com.attacker.invalid/detail/leetsync/abc123',
    'https://attacker.invalid/chromewebstore.google.com',
    'https://user@chromewebstore.google.com/detail/leetsync/abc123',
  ]) {
    assert.equal(approvedStoreUrl(value, 'chromewebstore.google.com'), '');
  }
});
