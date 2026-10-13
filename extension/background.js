const RETRY_ALARM = 'leetsync-retry';
const PENDING_LIMIT = 40;
const PENDING_BYTES_LIMIT = 4_000_000;
const MANIFEST_VERSION = chrome.runtime.getManifest().version;
const MAX_VERIFICATIONS_PER_MINUTE = 10;
const verifyingSubmissions = new Set();
const verificationCooldowns = new Map();
const verificationTimes = [];
const lastAccountCheck = new Map();
let pendingQueueOperations = Promise.resolve();
let discardPendingRequested = false;

function withPendingQueueLock(operation) {
  const current = pendingQueueOperations.then(operation, operation);
  pendingQueueOperations = current.then(
    () => undefined,
    () => undefined,
  );
  return current;
}

function allowedDashboard(sender) {
  try {
    return [
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'https://app.leetsync.app',
    ].includes(new URL(sender.url).origin);
  } catch {
    return false;
  }
}

function allowedApi(value) {
  try {
    const url = new URL(value);
    return (
      !url.username &&
      !url.password &&
      ((url.protocol === 'http:' &&
        ['localhost', '127.0.0.1'].includes(url.hostname)) ||
        (url.protocol === 'https:' && url.hostname === 'api.leetsync.app'))
    );
  } catch {
    return false;
  }
}

async function getState() {
  return chrome.storage.local.get({
    apiBase: 'http://localhost:3000',
    extensionToken: '',
    pendingSubmissions: [],
    detectedUsername: '',
    extensionStatus: 'not-linked',
    lastSyncAt: null,
    lastError: '',
  });
}

async function setStatus(extensionStatus, lastError = '') {
  await chrome.storage.local.set({ extensionStatus, lastError });
}

async function leetcodeGraphql(origin, query, variables = {}) {
  const response = await fetch(`${origin}/graphql/`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error('LeetCode request failed');
  const payload = await response.json();
  if (payload?.errors?.length || !payload?.data)
    throw new Error('LeetCode response was incomplete');
  return payload.data;
}

async function readLeetCodeAccount(origin) {
  const data = await leetcodeGraphql(
    origin,
    'query LeetSyncUserStatus { userStatus { username isSignedIn } }',
  );
  const status = data?.userStatus;
  const username = status?.username;
  if (
    !(status?.isSignedIn === true || status?.isSignedIn === 1) ||
    typeof username !== 'string' ||
    !/^[A-Za-z0-9_-]{1,39}$/.test(username)
  )
    return '';
  return username;
}

async function verifyAndQueueSubmission(origin, submissionId) {
  const now = Date.now();
  while (verificationTimes.length && now - verificationTimes[0] >= 60_000)
    verificationTimes.shift();
  const lastAttempt = verificationCooldowns.get(submissionId) ?? 0;
  if (
    verifyingSubmissions.has(submissionId) ||
    now - lastAttempt < 30_000 ||
    verificationTimes.length >= MAX_VERIFICATIONS_PER_MINUTE
  )
    return;

  verificationCooldowns.set(submissionId, now);
  if (verificationCooldowns.size > 200) {
    const oldest = verificationCooldowns.keys().next().value;
    if (oldest !== undefined) verificationCooldowns.delete(oldest);
  }
  verificationTimes.push(now);
  verifyingSubmissions.add(submissionId);
  try {
    const username = await readLeetCodeAccount(origin);
    if (!username) {
      await chrome.storage.local.set({ detectedUsername: '' });
      await setStatus(
        'not-signed-in',
        'Sign in to LeetCode in this browser to connect your account.',
      );
      return;
    }
    const heartbeat = await sendHeartbeat(username);
    if (heartbeat?.mismatch) return;

    // This username-scoped LeetCode list is the ownership check. A page can
    // forge an ID signal, but it cannot supply the code or mark it Accepted.
    const recent = await leetcodeGraphql(
      origin,
      'query LeetSyncRecentAccepted($username: String!, $limit: Int!) { recentAcSubmissionList(username: $username, limit: $limit) { id titleSlug timestamp statusDisplay } }',
      { username, limit: 20 },
    );
    const recentAccepted = recent?.recentAcSubmissionList;
    const ownedAccepted = recentAccepted?.find(
      (item) =>
        String(item?.id ?? '') === submissionId &&
        (!item?.statusDisplay || item.statusDisplay === 'Accepted'),
    );
    // Only the newest accepted result may trigger an automatic sync. This
    // prevents a forged page message from draining older accepted solutions.
    if (
      !ownedAccepted ||
      String(recentAccepted?.[0]?.id ?? '') !== submissionId
    ) {
      await setStatus(
        'capture-error',
        'LeetCode could not verify this as the newest Accepted submission for the signed-in account. Nothing was sent.',
      );
      return;
    }

    const detailsData = await leetcodeGraphql(
      origin,
      'query LeetSyncSubmissionDetails($submissionId: Int!) { submissionDetails(submissionId: $submissionId) { id code timestamp statusCode statusDisplay runtime runtimeDisplay memory memoryDisplay lang { name verboseName } question { questionId titleSlug } } }',
      { submissionId: Number(submissionId) },
    );
    const details = detailsData?.submissionDetails;
    const statusCode = details?.statusCode;
    if (
      !details ||
      String(details.id ?? '') !== submissionId ||
      (statusCode !== undefined &&
        statusCode !== null &&
        Number(statusCode) !== 10) ||
      (details.statusDisplay && details.statusDisplay !== 'Accepted') ||
      typeof details.code !== 'string' ||
      !details.code
    ) {
      await setStatus(
        'capture-error',
        'LeetCode did not confirm the Accepted source code. Nothing was sent.',
      );
      return;
    }

    const titleSlug = details.question?.titleSlug ?? ownedAccepted.titleSlug;
    if (typeof titleSlug !== 'string' || !/^[a-z0-9-]{1,255}$/i.test(titleSlug))
      throw new Error('LeetCode submission question was incomplete');
    const questionData = await leetcodeGraphql(
      origin,
      'query LeetSyncQuestionDetails($titleSlug: String!) { question(titleSlug: $titleSlug) { questionFrontendId title titleSlug difficulty topicTags { name } } }',
      { titleSlug },
    );
    const question = questionData?.question;
    if (
      !question ||
      question.titleSlug?.toLowerCase() !== titleSlug.toLowerCase()
    )
      throw new Error('LeetCode question metadata was incomplete');

    const rawLanguage = details.lang;
    const language =
      typeof rawLanguage === 'string'
        ? rawLanguage
        : (rawLanguage?.name ?? rawLanguage?.verboseName ?? '');
    const timestamp = Number(details.timestamp ?? ownedAccepted.timestamp);
    const submission = {
      submissionId,
      leetcodeUsername: username,
      status: 'Accepted',
      problemTitle: question.title,
      titleSlug: question.titleSlug,
      frontendId: String(question.questionFrontendId ?? ''),
      difficulty: question.difficulty,
      topicTags: Array.isArray(question.topicTags)
        ? question.topicTags.map((tag) => tag?.name)
        : [],
      language,
      sourceCode: details.code,
      runtime: String(
        details.runtimeDisplay ??
          (details.runtime == null ? '' : `${details.runtime} ms`),
      ),
      memory: String(
        details.memoryDisplay ??
          (details.memory == null ? '' : `${details.memory} MB`),
      ),
      submittedAt: timestamp,
    };
    await enqueueSubmission(submission);
  } catch {
    await setStatus(
      'capture-error',
      'LeetCode could not independently verify this submission. Refresh its Accepted result page and try again.',
    );
  } finally {
    verifyingSubmissions.delete(submissionId);
  }
}

function validatedSubmission(value) {
  if (!value || typeof value !== 'object') return null;
  if (
    value.status !== 'Accepted' ||
    typeof value.submissionId !== 'string' ||
    !/^\d{1,20}$/.test(value.submissionId) ||
    typeof value.leetcodeUsername !== 'string' ||
    !/^[A-Za-z0-9_-]{1,39}$/.test(value.leetcodeUsername) ||
    typeof value.problemTitle !== 'string' ||
    !value.problemTitle.trim() ||
    value.problemTitle.length > 500 ||
    typeof value.titleSlug !== 'string' ||
    !/^[a-z0-9-]{1,255}$/i.test(value.titleSlug) ||
    typeof value.frontendId !== 'string' ||
    !/^\d{1,12}$/.test(value.frontendId) ||
    !['Easy', 'Medium', 'Hard'].includes(value.difficulty) ||
    typeof value.language !== 'string' ||
    !value.language.trim() ||
    value.language.length > 100 ||
    typeof value.sourceCode !== 'string' ||
    !value.sourceCode ||
    value.sourceCode.length > 500_000 ||
    new TextEncoder().encode(value.sourceCode).byteLength > 500_000 ||
    typeof value.runtime !== 'string' ||
    value.runtime.length > 100 ||
    typeof value.memory !== 'string' ||
    value.memory.length > 100 ||
    typeof value.submittedAt !== 'number' ||
    !Number.isFinite(value.submittedAt) ||
    value.submittedAt <= 0 ||
    !Array.isArray(value.topicTags) ||
    value.topicTags.length > 100 ||
    value.topicTags.some(
      (tag) => typeof tag !== 'string' || !tag.trim() || tag.length > 100,
    )
  )
    return null;

  return {
    submissionId: value.submissionId,
    leetcodeUsername: value.leetcodeUsername,
    status: 'Accepted',
    problemTitle: value.problemTitle,
    titleSlug: value.titleSlug,
    frontendId: value.frontendId,
    difficulty: value.difficulty,
    topicTags: [...value.topicTags],
    language: value.language,
    sourceCode: value.sourceCode,
    runtime: value.runtime,
    memory: value.memory,
    submittedAt: value.submittedAt,
  };
}

async function sendHeartbeat(username) {
  await chrome.storage.local.set({ detectedUsername: username });
  const state = await getState();
  if (!state.extensionToken) {
    await chrome.storage.local.set({ detectedUsername: username });
    await setStatus('not-linked');
    return { mismatch: false };
  }

  try {
    const response = await fetch(`${state.apiBase}/api/extension/heartbeat`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${state.extensionToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        leetcodeUsername: username,
        extensionVersion: MANIFEST_VERSION,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status === 401) {
      await chrome.storage.local.remove('extensionToken');
      await chrome.storage.local.set({ detectedUsername: username });
      await setStatus(
        'not-linked',
        'Open the dashboard to reconnect the extension.',
      );
      return;
    }
    if (!response.ok) throw new Error(`Heartbeat failed (${response.status})`);
    const body = await response.json();
    await chrome.storage.local.set({ detectedUsername: username });
    if (body.mismatch) {
      await setStatus(
        'mismatch',
        'The LeetCode username does not match the dashboard.',
      );
      return { mismatch: true };
    } else if (!body.linked) {
      await setStatus(
        'waiting-username',
        'Save your LeetCode username in the dashboard to finish linking.',
      );
    } else {
      const latest = await getState();
      if (
        !['capture-error', 'mismatch', 'buffer-full'].includes(
          latest.extensionStatus,
        )
      )
        await setStatus('connected');
    }
    if (body.linked) void flushPending();
    return { mismatch: false };
  } catch {
    await chrome.storage.local.set({ detectedUsername: username });
    await setStatus(
      'offline',
      'LeetSync server is unavailable. Saved submissions will retry automatically.',
    );
    return { mismatch: false };
  }
}

async function enqueueSubmission(submission) {
  return withPendingQueueLock(() => enqueueSubmissionLocked(submission));
}

async function enqueueSubmissionLocked(submission) {
  const validSubmission = validatedSubmission(submission);
  if (!validSubmission) {
    await setStatus(
      'capture-error',
      'LeetCode returned incomplete submission details. Refresh the problem page and try again.',
    );
    return;
  }
  const state = await getState();
  const detected = state.detectedUsername.toLowerCase();
  if (
    !detected ||
    detected !== validSubmission.leetcodeUsername.toLowerCase()
  ) {
    await setStatus(
      'mismatch',
      'The LeetCode account could not be matched. Check the signed-in account and refresh.',
    );
    return;
  }
  const pending = [...state.pendingSubmissions];
  if (
    pending.some((item) => item.submissionId === validSubmission.submissionId)
  )
    return;
  const record = validSubmission;
  const size = new TextEncoder().encode(JSON.stringify(record)).byteLength;
  const total = pending.reduce(
    (sum, item) =>
      sum + new TextEncoder().encode(JSON.stringify(item)).byteLength,
    0,
  );
  if (pending.length >= PENDING_LIMIT || total + size > PENDING_BYTES_LIMIT) {
    await setStatus(
      'buffer-full',
      'Offline submission storage is full. Reconnect LeetSync before submitting more solutions.',
    );
    return;
  }
  pending.push(record);
  await chrome.storage.local.set({ pendingSubmissions: pending });
  void flushPending();
}

async function flushPending() {
  return withPendingQueueLock(flushPendingLocked);
}

async function flushPendingLocked() {
  let pauseForMismatch = false;
  const state = await getState();
  if (!state.extensionToken || state.pendingSubmissions.length === 0) return;
  const remaining = [...state.pendingSubmissions];
  while (remaining.length) {
    if (discardPendingRequested) break;
    const submission = remaining[0];
    try {
      const response = await fetch(
        `${state.apiBase}/api/extension/submissions`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${state.extensionToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(submission),
          signal: AbortSignal.timeout(15_000),
        },
      );
      const body = await response.json().catch(() => ({}));
      if (response.ok) {
        remaining.shift();
        await chrome.storage.local.set({
          pendingSubmissions: remaining,
          lastSyncAt: new Date().toISOString(),
        });
        await setStatus('connected');
        continue;
      }
      if (response.status === 401) {
        await chrome.storage.local.remove('extensionToken');
        await setStatus(
          'not-linked',
          'Open the dashboard to reconnect the extension.',
        );
        return;
      }
      if (
        response.status === 409 &&
        body.error === 'LEETCODE_ACCOUNT_NOT_LINKED'
      ) {
        await setStatus(
          'waiting-username',
          'Save your LeetCode username in the dashboard to finish linking.',
        );
        break;
      }
      if (
        response.status === 403 &&
        body.error === 'LEETCODE_USERNAME_MISMATCH'
      ) {
        pauseForMismatch = true;
        await setStatus(
          'mismatch',
          'Saved submissions are paused until the LeetCode account matches. They have not been discarded.',
        );
        break;
      }
      if ([400, 413, 422].includes(response.status)) {
        remaining.shift();
        await chrome.storage.local.set({ pendingSubmissions: remaining });
        await setStatus(
          'capture-error',
          'LeetCode submission details were incomplete, so this result was skipped.',
        );
        continue;
      }
      await setStatus(
        'offline',
        'LeetSync could not be reached. The submission is saved locally and will retry.',
      );
      break;
    } catch {
      await setStatus(
        'offline',
        'LeetSync could not be reached. The submission is saved locally and will retry.',
      );
      break;
    }
  }
  if (remaining.length && !pauseForMismatch && !discardPendingRequested) {
    await chrome.alarms.create(RETRY_ALARM, { delayInMinutes: 1 });
  } else {
    await chrome.alarms.clear(RETRY_ALARM);
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (
    sender.id === chrome.runtime.id &&
    sender.url?.startsWith(`chrome-extension://${chrome.runtime.id}/`) &&
    message?.type === 'discard-pending'
  ) {
    discardPendingRequested = true;
    void withPendingQueueLock(async () => {
      try {
        await chrome.storage.local.set({ pendingSubmissions: [] });
        await chrome.alarms.clear(RETRY_ALARM);
        const state = await getState();
        if (
          state.extensionStatus === 'mismatch' &&
          state.lastError.includes('Saved submissions are paused')
        ) {
          await setStatus(
            'mismatch',
            'The LeetCode username does not match the dashboard.',
          );
        }
      } finally {
        discardPendingRequested = false;
      }
    }).then(
      () => sendResponse({ discarded: true }),
      () => sendResponse({ discarded: false }),
    );
    return true;
  }

  let pageUrl;
  try {
    pageUrl = sender.url ? new URL(sender.url) : null;
  } catch {
    return;
  }
  if (
    !pageUrl ||
    !['https://leetcode.com', 'https://leetcode.cn'].includes(pageUrl.origin)
  )
    return;
  if (message?.type === 'leetcode-page-active') {
    const now = Date.now();
    const lastCheck = lastAccountCheck.get(pageUrl.origin) ?? 0;
    if (now - lastCheck < 10_000) {
      sendResponse({ received: true });
      return;
    }
    lastAccountCheck.set(pageUrl.origin, now);
    void readLeetCodeAccount(pageUrl.origin)
      .then(async (username) => {
        if (username) await sendHeartbeat(username);
        else {
          await chrome.storage.local.set({ detectedUsername: '' });
          await setStatus(
            'not-signed-in',
            'Sign in to LeetCode in this browser to connect your account.',
          );
        }
      })
      .then(() => sendResponse({ received: true }))
      .catch(() => sendResponse({ received: false }));
    return true;
  }
  if (message?.type === 'submission-candidate') {
    const submissionId = message.submissionId;
    const route = /^\/problems\/[a-z0-9-]+\/submissions\/(\d+)\/?$/i.exec(
      pageUrl.pathname,
    );
    const problemPage = /^\/problems\/[a-z0-9-]+(?:\/[a-z0-9-]+)*\/?$/i.test(
      pageUrl.pathname,
    );
    if (
      typeof submissionId !== 'string' ||
      !/^\d{1,20}$/.test(submissionId) ||
      (!problemPage && !route) ||
      (route && route[1] !== submissionId)
    ) {
      sendResponse({ received: false });
      return;
    }
    void verifyAndQueueSubmission(pageUrl.origin, submissionId).then(() =>
      sendResponse({ received: true }),
    );
    return true;
  }
});

chrome.runtime.onMessageExternal.addListener(
  (message, sender, sendResponse) => {
    if (!allowedDashboard(sender)) return;
    if (message?.type === 'LEETSYNC_HELLO') {
      void getState().then((state) =>
        sendResponse({
          available: true,
          version: MANIFEST_VERSION,
          linked: Boolean(state.extensionToken),
        }),
      );
      return true;
    }
    if (message?.type === 'LEETSYNC_TOKEN') {
      const token = message.token;
      const apiBase = message.apiBase;
      if (
        typeof token !== 'string' ||
        !/^lsx_ext_[A-Za-z0-9_-]{32,}$/.test(token) ||
        typeof apiBase !== 'string' ||
        !allowedApi(apiBase)
      ) {
        sendResponse({ saved: false });
        return;
      }
      void chrome.storage.local
        .set({ apiBase: new URL(apiBase).origin, extensionToken: token })
        .then(async () => {
          await setStatus('waiting-username');
          sendResponse({ saved: true });
          const state = await getState();
          if (state.detectedUsername)
            void sendHeartbeat(state.detectedUsername);
          void flushPending();
        });
      return true;
    }
  },
);

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === RETRY_ALARM) void flushPending();
});

chrome.runtime.onStartup.addListener(() => void flushPending());
chrome.runtime.onInstalled.addListener(() => void flushPending());
