import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { URL, fileURLToPath } from 'node:url';
import { configureNginx } from '../configure-nginx.mjs';

const templatePath = fileURLToPath(new URL('../nginx.conf', import.meta.url));

test('Nginx CSP allows the configured API origin on every response location', async () => {
  const template = await readFile(templatePath, 'utf8');
  const configured = configureNginx(
    template,
    'https://api.custom-leetsync.example/v1',
  );

  assert.equal(configured.includes('__API_CONNECT_ORIGIN__'), false);
  assert.equal(
    (
      configured.match(
        /connect-src 'self' https:\/\/api\.custom-leetsync\.example/g,
      ) ?? []
    ).length,
    3,
  );
  assert.equal(configured.includes('localhost:3000'), false);
});

test('local API URLs require an explicit local-build opt-in', async () => {
  const template = await readFile(templatePath, 'utf8');

  assert.throws(() => configureNginx(template, 'http://localhost:3000'));
  assert.doesNotThrow(() =>
    configureNginx(template, 'http://localhost:3000', { allowLocal: true }),
  );
});

test('Nginx configuration rejects invalid, credentialed, or non-HTTP API URLs', async () => {
  const template = await readFile(templatePath, 'utf8');

  for (const apiBaseUrl of [
    'not-a-url',
    'javascript:alert(1)',
    'https://user:password@api.example.com',
    'https://api.example.com?token=secret',
  ]) {
    assert.throws(() => configureNginx(template, apiBaseUrl));
  }
});
