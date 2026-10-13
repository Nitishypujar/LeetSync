const account = document.querySelector('#account');
const status = document.querySelector('#status');
const statusDot = document.querySelector('#status-dot');
const lastSync = document.querySelector('#last-sync');
const queueCount = document.querySelector('#queue-count');
const notice = document.querySelector('#notice');
const disconnect = document.querySelector('#disconnect');
const discard = document.querySelector('#discard');

function formatDate(value) {
  if (!value) return 'Not yet';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

async function refresh() {
  const state = await chrome.storage.local.get({
    apiBase: 'http://localhost:3000',
    extensionToken: '',
    pendingSubmissions: [],
    detectedUsername: '',
    extensionStatus: 'not-linked',
    lastSyncAt: null,
    lastError: '',
  });
  account.textContent = state.detectedUsername || 'Not detected';
  lastSync.textContent = formatDate(state.lastSyncAt);
  queueCount.textContent = String(state.pendingSubmissions.length);
  discard.hidden = state.pendingSubmissions.length === 0;
  statusDot.classList.toggle('active', state.extensionStatus === 'connected');
  disconnect.hidden = !state.extensionToken;
  const labels = {
    connected: 'Connected. Accepted submissions sync automatically.',
    mismatch:
      state.lastError || 'The LeetCode username does not match the dashboard.',
    offline:
      state.lastError ||
      'Server unavailable. Submissions are buffered for retry.',
    'waiting-username':
      state.lastError || 'Save your LeetCode username in the dashboard.',
    'not-linked':
      state.lastError ||
      'Open the dashboard to link this extension automatically.',
    'capture-error': state.lastError || 'Submission details were incomplete.',
    'buffer-full':
      state.lastError ||
      'Offline storage is full. Reconnect to send saved work.',
  };
  status.textContent =
    labels[state.extensionStatus] || 'Open LeetCode to detect your account.';
}

document.querySelector('#open-dashboard').addEventListener('click', () => {
  chrome.tabs.create({ url: 'http://localhost:5173' });
});

disconnect.addEventListener('click', async () => {
  if (
    !window.confirm(
      'Disconnect this browser from LeetSync? Saved submissions will remain on this browser and may be sent if you reconnect later.',
    )
  )
    return;
  disconnect.disabled = true;
  try {
    const state = await chrome.storage.local.get(['apiBase', 'extensionToken']);
    if (state.extensionToken) {
      const response = await fetch(`${state.apiBase}/api/extension/unpair`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${state.extensionToken}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok && response.status !== 401) {
        throw new Error('The server did not confirm the disconnect.');
      }
    }
    await chrome.storage.local.remove('extensionToken');
    notice.textContent = 'This browser is disconnected.';
    await refresh();
  } catch {
    notice.textContent =
      'Could not reach LeetSync. Keep this popup open and try again.';
  } finally {
    disconnect.disabled = false;
  }
});

discard.addEventListener('click', async () => {
  const state = await chrome.storage.local.get({ pendingSubmissions: [] });
  const count = state.pendingSubmissions.length;
  if (!count) return refresh();
  if (
    !window.confirm(
      `Permanently discard ${count} unsent saved submission${count === 1 ? '' : 's'} from this browser? A submission already being sent may still sync. This cannot be undone.`,
    )
  )
    return;
  chrome.runtime.sendMessage({ type: 'discard-pending' }, async (response) => {
    if (chrome.runtime.lastError || !response?.discarded) {
      notice.textContent =
        'Could not discard the saved submissions. Try again.';
      return;
    }
    notice.textContent = 'Saved submissions were discarded from this browser.';
    await refresh();
  });
});

void refresh();
