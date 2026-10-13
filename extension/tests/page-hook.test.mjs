import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { URL } from 'node:url';
import vm from 'node:vm';
import { test } from 'node:test';

const pageHookSource = await readFile(
  new URL('../page-hook.js', import.meta.url),
  'utf8',
);
const bridgeSource = await readFile(
  new URL('../bridge.js', import.meta.url),
  'utf8',
);
const manifest = JSON.parse(
  await readFile(new URL('../manifest.json', import.meta.url), 'utf8'),
);

function createHook({ pathname = '/problems/two-sum/', result = {} } = {}) {
  const messages = [];
  let intervalCallback;
  const location = {
    origin: 'https://leetcode.com',
    pathname,
    href: `https://leetcode.com${pathname}`,
  };
  const window = {
    postMessage(data, targetOrigin) {
      messages.push({ data, targetOrigin });
    },
    setInterval(callback) {
      intervalCallback = callback;
      return 1;
    },
  };
  const document = { body: { innerText: '' } };
  class XMLHttpRequest {
    addEventListener() {}
  }
  const response = (payload) => ({
    clone: () => ({ json: async () => payload }),
  });
  window.fetch = async () => response(result);
  vm.runInNewContext(pageHookSource, {
    window,
    document,
    location,
    XMLHttpRequest,
    URL,
  });
  return {
    messages,
    window,
    document,
    runInterval: () => intervalCallback?.(),
  };
}

test('relays only a candidate ID after an Accepted check result', async () => {
  const { messages, window } = createHook({
    result: {
      finished: true,
      status_code: 10,
      status_msg: 'Accepted',
    },
  });
  await window.fetch('https://leetcode.com/submissions/detail/12345/check/');
  await delay(0);

  assert.equal(messages.length, 1);
  assert.equal(messages[0].data.type, 'submission-candidate');
  assert.equal(messages[0].data.submissionId, '12345');
  assert.deepEqual(Object.keys(messages[0].data).sort(), [
    'namespace',
    'submissionId',
    'type',
  ]);
});

test('does not relay a Wrong Answer result or an unrelated response', async () => {
  const { messages, window } = createHook({
    result: { finished: true, status_code: 11, status_msg: 'Wrong Answer' },
  });
  await window.fetch('https://leetcode.com/submissions/detail/12345/check/');
  await window.fetch('https://leetcode.com/graphql/', {
    body: JSON.stringify({ data: { code: 'secret source code' } }),
  });
  await delay(0);
  assert.equal(messages.length, 0);
});

test('result-page detection sends only the route ID for independent verification', () => {
  const { messages, document, runInterval } = createHook({
    pathname: '/problems/two-sum/submissions/12345/',
  });
  document.body.innerText = 'Accepted';
  runInterval();
  assert.equal(messages.length, 1);
  assert.deepEqual(
    { ...messages[0].data },
    {
      namespace: 'leetsync-page-hook',
      type: 'submission-candidate',
      submissionId: '12345',
    },
  );
});

test('bridge allowlists candidate IDs and requests isolated-world account verification', () => {
  const sent = [];
  let onMessage;
  const location = { origin: 'https://leetcode.com' };
  const window = {
    addEventListener(type, callback) {
      if (type === 'message') onMessage = callback;
    },
  };
  const chrome = {
    runtime: {
      sendMessage(message) {
        sent.push(message);
      },
    },
  };
  vm.runInNewContext(bridgeSource, { window, location, chrome });
  onMessage({
    source: window,
    origin: location.origin,
    data: {
      namespace: 'leetsync-page-hook',
      type: 'submission-candidate',
      submissionId: '12345',
      sourceCode: 'must never cross the bridge',
      status: 'Accepted',
    },
  });
  onMessage({
    source: window,
    origin: location.origin,
    data: {
      namespace: 'leetsync-page-hook',
      type: 'submission-candidate',
      submissionId: 'not-an-id',
    },
  });

  assert.deepEqual(JSON.parse(JSON.stringify(sent)), [
    { type: 'leetcode-page-active' },
    { type: 'submission-candidate', submissionId: '12345' },
  ]);
});

test('manifest keeps browser permissions minimal and restricts supported hosts', () => {
  assert.deepEqual(manifest.permissions, ['storage', 'alarms']);
  assert.ok(manifest.host_permissions.includes('https://leetcode.com/*'));
  assert.ok(manifest.host_permissions.includes('https://leetcode.cn/*'));
  assert.ok(!manifest.permissions.includes('cookies'));
  assert.ok(!manifest.permissions.includes('debugger'));
});
