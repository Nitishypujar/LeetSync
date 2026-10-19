import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { TextEncoder } from 'node:util';
import { URL } from 'node:url';
import vm from 'node:vm';
import { test } from 'node:test';

const source = await readFile(
  new URL('../background.js', import.meta.url),
  'utf8',
);

function createHarness({
  recentIds = ['12345'],
  userStatus = { username: 'test-user', isSignedIn: true },
  detailsOverrides = {},
  heartbeatBody = { accepted: true },
  submissionResponse = async () => ({
    status: 202,
    body: { accepted: true },
  }),
} = {}) {
  const state = {
    apiBase: 'http://localhost:3000',
    extensionToken: 'lsx_ext_abcdefghijklmnopqrstuvwxyz0123456789',
    pendingSubmissions: [],
    detectedUsername: '',
    extensionStatus: 'connected',
    lastSyncAt: null,
    lastError: '',
  };
  const requests = [];
  let messageListener;
  let externalMessageListener;
  const chrome = {
    runtime: {
      id: 'test-extension-id',
      getManifest: () => ({
        version: '0.1.5',
        host_permissions: [
          'http://localhost:3000/*',
          'http://127.0.0.1:3000/*',
          'https://api.leetsync.app/*',
          'https://leetsync-nitishypujar.onrender.com/*',
          'https://leetcode.com/*',
          'https://leetcode.cn/*',
        ],
        externally_connectable: {
          matches: [
            'http://localhost:5173/*',
            'http://127.0.0.1:5173/*',
            'https://app.leetsync.app/*',
            'https://leetsync-nitishypujar.onrender.com/*',
          ],
        },
      }),
      onMessage: { addListener: (listener) => (messageListener = listener) },
      onMessageExternal: {
        addListener: (listener) => (externalMessageListener = listener),
      },
      onStartup: { addListener() {} },
      onInstalled: { addListener() {} },
    },
    storage: {
      local: {
        async get(defaults) {
          return { ...defaults, ...state };
        },
        async set(values) {
          Object.assign(state, values);
        },
        async remove(keys) {
          for (const key of Array.isArray(keys) ? keys : [keys])
            delete state[key];
        },
      },
    },
    alarms: {
      create() {},
      clear: async () => true,
      onAlarm: { addListener() {} },
    },
  };
  const fetch = async (url, options = {}) => {
    requests.push({ url, options });
    if (url.endsWith('/graphql/')) {
      const { query } = JSON.parse(options.body);
      let data;
      if (query.includes('LeetSyncUserStatus')) {
        data = { userStatus };
      } else if (query.includes('LeetSyncRecentAccepted')) {
        data = {
          recentAcSubmissionList: recentIds.map((id) => ({
            id,
            titleSlug: 'two-sum',
            timestamp: 1_700_000_000,
            statusDisplay: 'Accepted',
          })),
        };
      } else if (query.includes('LeetSyncSubmissionDetails')) {
        const { submissionId } = JSON.parse(options.body).variables;
        data = {
          submissionDetails: {
            id: String(submissionId),
            code: 'class Solution: pass',
            timestamp: 1_700_000_000,
            statusCode: 10,
            statusDisplay: 'Accepted',
            runtimeDisplay: '50 ms',
            memoryDisplay: '17.8 MB',
            lang: { name: 'python3' },
            question: { titleSlug: 'two-sum' },
            ...detailsOverrides,
          },
        };
      } else {
        data = {
          question: {
            questionFrontendId: '1',
            title: 'Two Sum',
            titleSlug: 'two-sum',
            difficulty: 'Easy',
            topicTags: [{ name: 'Array' }],
          },
        };
      }
      return { ok: true, json: async () => ({ data }) };
    }
    if (url.endsWith('/api/extension/submissions')) {
      const result = await submissionResponse();
      return {
        ok: result.status >= 200 && result.status < 300,
        status: result.status,
        json: async () => result.body,
      };
    }
    return {
      ok: true,
      status: 202,
      json: async () => heartbeatBody,
    };
  };
  const context = {
    chrome,
    fetch,
    TextEncoder,
    AbortSignal: globalThis.AbortSignal,
    URL,
    Date,
  };
  vm.runInNewContext(source, context);
  return {
    requests,
    state,
    enqueue: context.enqueueSubmission,
    flushPending: context.flushPending,
    async discard() {
      return await new Promise((resolve) => {
        messageListener(
          { type: 'discard-pending' },
          {
            id: 'test-extension-id',
            url: 'chrome-extension://test-extension-id/popup.html',
          },
          resolve,
        );
      });
    },
    async send(
      message,
      page = 'https://leetcode.com/problems/two-sum/submissions/12345/',
    ) {
      return await new Promise((resolve) => {
        messageListener(message, { url: page }, resolve);
      });
    },
    async sendExternal(message, page) {
      return await new Promise((resolve) => {
        externalMessageListener(message, { url: page }, resolve);
      });
    },
  };
}

test('dashboard pairing accepts only API origins declared by extension permissions', async () => {
  const harness = createHarness();
  const token = 'lsx_ext_abcdefghijklmnopqrstuvwxyz0123456789';
  const dashboardUrl = 'https://leetsync-nitishypujar.onrender.com/dashboard';

  const rejected = await harness.sendExternal(
    { type: 'LEETSYNC_TOKEN', token, apiBase: 'https://attacker.example' },
    dashboardUrl,
  );
  assert.deepEqual(JSON.parse(JSON.stringify(rejected)), { saved: false });
  assert.equal(harness.state.apiBase, 'http://localhost:3000');

  const accepted = await harness.sendExternal(
    {
      type: 'LEETSYNC_TOKEN',
      token,
      apiBase: 'https://leetsync-nitishypujar.onrender.com',
    },
    dashboardUrl,
  );
  assert.equal(accepted.saved, true);
  assert.equal(
    harness.state.apiBase,
    'https://leetsync-nitishypujar.onrender.com',
  );
});

function bufferedSubmission(submissionId) {
  return {
    submissionId,
    leetcodeUsername: 'test-user',
    status: 'Accepted',
    problemTitle: 'Two Sum',
    titleSlug: 'two-sum',
    frontendId: '1',
    difficulty: 'Easy',
    topicTags: ['Array'],
    language: 'python3',
    sourceCode: `class Solution: # ${submissionId}`,
    runtime: '50 ms',
    memory: '17.8 MB',
    submittedAt: 1_700_000_000,
  };
}

test('background independently verifies the LeetCode account and source before sending', async () => {
  const harness = createHarness();
  await harness.send({
    type: 'submission-candidate',
    submissionId: '12345',
    sourceCode: 'forged source must be ignored',
    leetcodeUsername: 'forged-user',
    status: 'Accepted',
  });

  const graphqlCalls = harness.requests.filter((request) =>
    request.url.endsWith('/graphql/'),
  );
  assert.equal(graphqlCalls.length, 4);
  assert.ok(
    graphqlCalls.every((call) => call.options.credentials === 'include'),
  );
  const send = harness.requests.find((request) =>
    request.url.endsWith('/api/extension/submissions'),
  );
  assert.ok(send);
  const sentSubmission = JSON.parse(send.options.body);
  assert.equal(sentSubmission.sourceCode, 'class Solution: pass');
  assert.equal(sentSubmission.leetcodeUsername, 'test-user');
  assert.equal(sentSubmission.submissionId, '12345');
  assert.equal(sentSubmission.forged, undefined);
});

test('background does not send an ID absent from the signed-in user’s accepted list', async () => {
  const harness = createHarness({ recentIds: ['88888'] });
  await harness.send({ type: 'submission-candidate', submissionId: '12345' });

  assert.equal(
    harness.requests.some((request) =>
      request.url.endsWith('/api/extension/submissions'),
    ),
    false,
  );
  assert.equal(harness.state.extensionStatus, 'capture-error');
});

test('background will not sync an older accepted solution from a forged page message', async () => {
  const harness = createHarness({ recentIds: ['88888', '12345'] });
  await harness.send({ type: 'submission-candidate', submissionId: '12345' });

  assert.equal(
    harness.requests.some((request) =>
      request.url.endsWith('/api/extension/submissions'),
    ),
    false,
  );
  assert.equal(harness.state.extensionStatus, 'capture-error');
});

test('captures Accepted results on the problem page and rejects mismatched detail routes', async () => {
  const harness = createHarness();
  await harness.send(
    { type: 'submission-candidate', submissionId: '12345' },
    'https://leetcode.com/problems/two-sum/',
  );
  assert.ok(
    harness.requests.some((request) =>
      request.url.endsWith('/api/extension/submissions'),
    ),
  );

  const mismatched = createHarness();
  await mismatched.send(
    { type: 'submission-candidate', submissionId: '12345' },
    'https://leetcode.com/problems/two-sum/submissions/99999/',
  );

  assert.equal(mismatched.requests.length, 0);
  assert.equal(mismatched.state.pendingSubmissions.length, 0);
});

test('background ignores the page-supplied account name and derives identity from LeetCode', async () => {
  const harness = createHarness();
  await harness.send({ type: 'leetcode-page-active', username: 'forged-user' });
  assert.equal(harness.state.detectedUsername, 'test-user');
  assert.equal(
    harness.requests.some(
      (request) =>
        request.url.endsWith('/api/extension/heartbeat') &&
        JSON.parse(request.options.body).leetcodeUsername === 'forged-user',
    ),
    false,
  );
});

test('background rejects a LeetCode account that is not signed in', async () => {
  const harness = createHarness({
    userStatus: { username: 'test-user', isSignedIn: false },
  });
  await harness.send({ type: 'submission-candidate', submissionId: '12345' });

  assert.equal(harness.requests.length, 1);
  assert.equal(harness.requests[0].url, 'https://leetcode.com/graphql/');
  assert.equal(harness.state.detectedUsername, '');
  assert.equal(harness.state.extensionStatus, 'not-signed-in');
});

test('background rejects details that contradict the Accepted list', async () => {
  const harness = createHarness({
    detailsOverrides: { statusCode: 11, statusDisplay: 'Wrong Answer' },
  });
  await harness.send({ type: 'submission-candidate', submissionId: '12345' });

  assert.equal(
    harness.requests.some((request) =>
      request.url.endsWith('/api/extension/submissions'),
    ),
    false,
  );
  assert.equal(harness.state.extensionStatus, 'capture-error');
});

test('background stops when the dashboard says this LeetCode account is mismatched', async () => {
  const harness = createHarness({ heartbeatBody: { mismatch: true } });
  await harness.send({ type: 'submission-candidate', submissionId: '12345' });

  assert.equal(
    harness.requests.some((request) => request.url.endsWith('/graphql/')),
    true,
  );
  assert.equal(
    harness.requests.some((request) =>
      request.url.endsWith('/api/extension/submissions'),
    ),
    false,
  );
  assert.equal(harness.state.extensionStatus, 'mismatch');
});

test('matching heartbeat waits for dashboard pairing before submission delivery', async () => {
  const harness = createHarness({
    heartbeatBody: { linked: false, confirmationRequired: true },
    submissionResponse: async () => ({
      status: 409,
      body: { error: 'LEETCODE_ACCOUNT_NOT_LINKED' },
    }),
  });
  await harness.send({ type: 'submission-candidate', submissionId: '12345' });

  assert.equal(harness.state.extensionStatus, 'waiting-dashboard');
  assert.equal(harness.state.pendingSubmissions.length, 1);
  assert.equal(
    harness.requests.some((request) =>
      request.url.endsWith('/api/extension/submissions'),
    ),
    true,
  );
});

test('background never sends an oversized source returned by LeetCode', async () => {
  const harness = createHarness({
    detailsOverrides: { code: 'x'.repeat(500_001) },
  });
  await harness.send({ type: 'submission-candidate', submissionId: '12345' });

  assert.equal(
    harness.requests.some((request) =>
      request.url.endsWith('/api/extension/submissions'),
    ),
    false,
  );
  assert.equal(harness.state.pendingSubmissions.length, 0);
  assert.equal(harness.state.extensionStatus, 'capture-error');
});

test('preserves buffered submissions when the server reports an account mismatch', async () => {
  const harness = createHarness({
    submissionResponse: async () => ({
      status: 403,
      body: { error: 'LEETCODE_USERNAME_MISMATCH' },
    }),
  });
  harness.state.detectedUsername = 'test-user';
  harness.state.pendingSubmissions = [bufferedSubmission('123456')];

  await harness.enqueue(bufferedSubmission('123457'));
  await harness.flushPending();

  assert.deepEqual(
    Array.from(harness.state.pendingSubmissions, (item) => item.submissionId),
    ['123456', '123457'],
  );
  assert.equal(harness.state.extensionStatus, 'mismatch');

  await harness.discard();
  assert.equal(harness.state.pendingSubmissions.length, 0);
  assert.equal(harness.state.extensionStatus, 'mismatch');
  assert.equal(
    harness.state.lastError,
    'The LeetCode username does not match the dashboard.',
  );
});

test('serializes queue flush and capture so a new submission is not erased', async () => {
  let requestStarted;
  let finishRequest;
  const started = new Promise((resolve) => (requestStarted = resolve));
  const requestGate = new Promise((resolve) => (finishRequest = resolve));
  const harness = createHarness({
    submissionResponse: async () => {
      requestStarted();
      await requestGate;
      return { status: 202, body: { accepted: true } };
    },
  });
  harness.state.pendingSubmissions = [bufferedSubmission('123456')];
  harness.state.detectedUsername = 'test-user';

  const initialFlush = harness.flushPending();
  await started;
  const enqueue = harness.enqueue(bufferedSubmission('123457'));
  finishRequest();
  await Promise.all([initialFlush, enqueue]);
  await harness.flushPending();

  const deliveredIds = harness.requests
    .filter((request) => request.url.endsWith('/api/extension/submissions'))
    .map((request) => JSON.parse(request.options.body).submissionId);
  assert.deepEqual(deliveredIds, ['123456', '123457']);
  assert.equal(harness.state.pendingSubmissions.length, 0);
});

test('a confirmed discard stops sending the rest of the queue', async () => {
  let requestStarted;
  let finishRequest;
  const started = new Promise((resolve) => (requestStarted = resolve));
  const requestGate = new Promise((resolve) => (finishRequest = resolve));
  const harness = createHarness({
    submissionResponse: async () => {
      requestStarted();
      await requestGate;
      return { status: 202, body: { accepted: true } };
    },
  });
  harness.state.pendingSubmissions = [
    bufferedSubmission('123456'),
    bufferedSubmission('123457'),
  ];

  const initialFlush = harness.flushPending();
  await started;
  const discard = harness.discard();
  finishRequest();
  await Promise.all([initialFlush, discard]);

  const deliveredIds = harness.requests
    .filter((request) => request.url.endsWith('/api/extension/submissions'))
    .map((request) => JSON.parse(request.options.body).submissionId);
  assert.deepEqual(deliveredIds, ['123456']);
  assert.equal(harness.state.pendingSubmissions.length, 0);
});
