import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';

const API_BASE = (
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'
).replace(/\/$/, '');
const EXTENSION_ID = import.meta.env.VITE_EXTENSION_ID || '';
let csrfToken = '';

type DashboardData = {
  account: { githubLogin: string };
  github: { connected: boolean; status: string; expiresAt: string | null };
  leetcode: {
    connected: boolean;
    username: string;
    detectedUsername: string | null;
    mismatch: boolean;
    verifiedAt: string | null;
  } | null;
  repository: {
    owner: string;
    name: string;
    branch: string;
    url: string;
  } | null;
  extension: { paired: boolean; connected: boolean; lastSeenAt: string | null };
  counts: { total: number; jobs: Record<string, number> };
  submissions: Array<{
    id: string;
    problem: {
      number: number;
      title: string;
      slug: string;
      difficulty: string;
      topicTags: string[];
    };
    language: string;
    runtime: string;
    memory: string;
    status: string;
    submittedAt: string;
    sync: null | {
      id: string;
      status: string;
      attempts: number;
      error: string | null;
      path: string | null;
      commitSha: string | null;
      commitUrl: string | null;
    };
  }>;
};

type ExtensionRuntime = {
  sendMessage?: (
    extensionId: string,
    message: Record<string, unknown>,
    callback: (response?: Record<string, unknown>) => void,
  ) => void;
  lastError?: { message?: string };
};

type ErrorSource = 'load' | 'setup' | 'auth' | 'pairing' | 'action';

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.method && init.method !== 'GET'
        ? { 'X-CSRF-Token': csrfToken }
        : {}),
      ...init.headers,
    },
  });
  if (response.status === 204) return undefined as T;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(
      body.error || `Request failed (${response.status})`,
    );
    Object.assign(error, { status: response.status });
    throw error;
  }
  return body as T;
}

function extensionMessage(
  message: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  const runtime = (
    window as Window & { chrome?: { runtime?: ExtensionRuntime } }
  ).chrome?.runtime;
  if (!EXTENSION_ID || !runtime?.sendMessage) return Promise.resolve(null);
  return new Promise((resolve) => {
    runtime.sendMessage?.(EXTENSION_ID, message, (response) => {
      if (runtime.lastError) resolve(null);
      else resolve(response ?? null);
    });
  });
}

function formatDate(value: string | null): string {
  if (!value) return 'Waiting for the first accepted submission';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function friendlyError(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  const messages: Record<string, string> = {
    GITHUB_REAUTH_REQUIRED: 'Reconnect GitHub to continue syncing.',
    GITHUB_REPOSITORY_SETUP_FAILED:
      'GitHub could not create the public solution repository. Check that the OAuth app has the `public_repo` scope and retry.',
    GITHUB_DEFAULT_REPOSITORY_UNAVAILABLE:
      'Your existing leetcode-solutions repository must be public, active, and writable. LeetSync did not create another repository.',
    GITHUB_REPOSITORY_NAME_UNAVAILABLE:
      'GitHub could not create the canonical repository name. LeetSync did not create a differently named repository.',
    INVALID_LEETCODE_USERNAME: 'Enter a valid LeetCode username and try again.',
    LEETCODE_ACCOUNT_ALREADY_LINKED:
      'That LeetCode username is already linked to another LeetSync account.',
    LEETCODE_USERNAME_MISMATCH:
      'The LeetCode account open in this browser does not match the username you saved.',
    EXTENSION_HANDSHAKE_EXPIRED:
      'The extension link expired. Reload the dashboard to reconnect it.',
    RATE_LIMITED: 'Too many requests. Wait a minute and try again.',
  };
  if (messages[message]) return messages[message];
  if (message.includes('Failed to fetch'))
    return 'The LeetSync server could not be reached. Check that the services are running.';
  return 'Something went wrong. Try again or reconnect GitHub.';
}

function Status({ ok, children }: { ok: boolean; children: string }) {
  return (
    <span className={`status ${ok ? 'status-ok' : 'status-wait'}`}>
      <span className="status-dot" />
      {children}
    </span>
  );
}

function App() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [username, setUsername] = useState('');
  const [usernameSaved, setUsernameSaved] = useState(false);
  const [extensionAvailable, setExtensionAvailable] = useState(false);
  const errorSource = useRef<ErrorSource | null>(null);
  const ensureAttempted = useRef(false);
  const pairingInProgress = useRef(false);
  const pairingDone = useRef(false);

  const loadDashboard = useCallback(async (initial = false) => {
    try {
      const bootstrap = await request<{ csrfToken: string }>(
        '/api/auth/bootstrap',
      );
      csrfToken = bootstrap.csrfToken;
      const data = await request<DashboardData>('/api/dashboard');
      setDashboard(data);
      if (
        errorSource.current === 'load' ||
        (errorSource.current === 'setup' && data.repository)
      ) {
        errorSource.current = null;
        setError('');
      }
      if (initial) setUsername(data.leetcode?.username ?? '');
      if (
        data.github.connected &&
        data.leetcode?.connected &&
        !data.repository &&
        !ensureAttempted.current
      ) {
        ensureAttempted.current = true;
        try {
          await request('/api/github/repository/ensure', {
            method: 'POST',
            body: '{}',
          });
          const refreshed = await request<DashboardData>('/api/dashboard');
          setDashboard(refreshed);
        } catch (setupError) {
          errorSource.current = 'setup';
          setError(friendlyError(setupError));
        }
      }
    } catch (loadError) {
      if (
        loadError instanceof Error &&
        (loadError as Error & { status?: number }).status === 401
      ) {
        setDashboard(null);
      } else {
        errorSource.current = 'load';
        setError(friendlyError(loadError));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const auth = new URLSearchParams(window.location.search).get('auth');
    if (auth === 'success') setNotice('GitHub is connected.');
    if (auth === 'error') {
      const code = new URLSearchParams(window.location.search).get('code');
      errorSource.current = 'auth';
      setError(
        code === 'repo_setup_failed'
          ? friendlyError('GITHUB_REPOSITORY_SETUP_FAILED')
          : 'GitHub sign-in did not complete. Please try again.',
      );
    }
    if (auth) window.history.replaceState({}, '', window.location.pathname);
    void loadDashboard(true);
  }, [loadDashboard]);

  useEffect(() => {
    if (!dashboard) return;
    const timer = window.setInterval(() => void loadDashboard(), 3000);
    return () => window.clearInterval(timer);
  }, [dashboard, loadDashboard]);

  useEffect(() => {
    if (!dashboard?.github.connected || !dashboard.leetcode) {
      pairingDone.current = false;
      return;
    }
    let stopped = false;
    const attemptPairing = async () => {
      if (pairingInProgress.current || pairingDone.current || stopped) return;
      pairingInProgress.current = true;
      try {
        const hello = await extensionMessage({ type: 'LEETSYNC_HELLO' });
        if (stopped) return;
        setExtensionAvailable(Boolean(hello?.available));
        if (!hello?.available) {
          if (errorSource.current === 'pairing') {
            errorSource.current = null;
            setError('');
          }
          return;
        }
        const issued = await request<{ token: string }>(
          '/api/extension/handshake',
          {
            method: 'POST',
            body: JSON.stringify({ extensionVersion: hello.version }),
          },
        );
        const linked = await extensionMessage({
          type: 'LEETSYNC_TOKEN',
          token: issued.token,
          apiBase: API_BASE,
        });
        if (!linked?.saved) {
          errorSource.current = 'pairing';
          setError(
            'The extension did not finish linking. Reload the dashboard to retry.',
          );
          return;
        }
        await request('/api/extension/handshake/complete', {
          method: 'POST',
          body: JSON.stringify({ token: issued.token }),
        });
        if (errorSource.current === 'pairing') {
          errorSource.current = null;
          setError('');
        }
        pairingDone.current = true;
        await loadDashboard();
      } catch (pairError) {
        errorSource.current = 'pairing';
        setError(friendlyError(pairError));
      } finally {
        pairingInProgress.current = false;
      }
    };
    void attemptPairing();
    const timer = window.setInterval(() => void attemptPairing(), 3000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [
    dashboard?.github.connected,
    dashboard?.leetcode?.username,
    loadDashboard,
  ]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    errorSource.current = null;
    setError('');
    setNotice('');
    try {
      await action();
      await loadDashboard();
    } catch (actionError) {
      errorSource.current = 'action';
      setError(friendlyError(actionError));
    } finally {
      setBusy(false);
    }
  };

  const saveUsername = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await run(async () => {
      await request('/api/leetcode/username', {
        method: 'POST',
        body: JSON.stringify({
          username: username.trim(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        }),
      });
      setUsernameSaved(true);
      setNotice(
        extensionAvailable
          ? 'Username saved. LeetSync is checking the account in this browser.'
          : 'Username saved. Load the extension and open LeetCode to verify the account.',
      );
    });
  };

  const retryJob = (jobId: string) =>
    run(async () => {
      await request(`/api/sync/${jobId}/retry`, {
        method: 'POST',
        body: '{}',
      });
      setNotice('Submission added back to the sync queue.');
    });

  const signOut = () =>
    run(async () => {
      await request('/api/auth/logout', { method: 'POST', body: '{}' });
      setDashboard(null);
      pairingDone.current = false;
      setNotice('Signed out. Your saved setup is still here when you return.');
    });

  const disconnectGithub = () => {
    if (
      !window.confirm(
        'Disconnect GitHub from LeetSync? New submissions will no longer sync until you reconnect. Your LeetCode connection, saved submission history, and files already committed to GitHub will remain.',
      )
    )
      return;
    void run(async () => {
      const result = await request<{ providerRevoked: boolean }>(
        '/api/auth/disconnect-github',
        { method: 'POST', body: '{}' },
      );
      setNotice(
        result.providerRevoked
          ? 'GitHub disconnected.'
          : 'GitHub disconnected in LeetSync. You can also remove the app from GitHub settings.',
      );
    });
  };

  const disconnectLeetcode = () => {
    if (
      !window.confirm(
        'Disconnect LeetCode from LeetSync? The extension will be unpaired and no new submissions will be collected. Submissions already received may finish syncing, and locally buffered submissions may send if you reconnect later. Your saved history and files already committed to GitHub will remain.',
      )
    )
      return;
    void run(async () => {
      await request('/api/leetcode/disconnect', {
        method: 'POST',
        body: '{}',
      });
      pairingDone.current = false;
      setNotice('LeetCode disconnected. Your saved history was kept.');
    });
  };

  const deleteData = () => {
    if (
      !window.confirm(
        'Delete your LeetSync account, submissions, and settings?',
      )
    )
      return;
    void run(async () => {
      await request('/api/data/delete', { method: 'POST', body: '{}' });
      setDashboard(null);
      setNotice('Your LeetSync data was deleted.');
    });
  };

  if (loading) {
    return (
      <main className="page-loading" aria-label="Loading dashboard">
        <span className="brand-mark">L</span>
        <div className="skeleton skeleton-title" />
        <div className="skeleton skeleton-card" />
        <p>Loading your saved workspace…</p>
      </main>
    );
  }

  if (!dashboard) {
    return (
      <main className="landing">
        <header className="topbar">
          <a className="brand" href="/">
            <span className="brand-mark">L</span>
            <span>LeetSync</span>
          </a>
          <span className="muted">Your solutions, in sync</span>
        </header>
        <section className="hero">
          <div>
            <p className="eyebrow">AUTOMATIC SOLUTION SYNC</p>
            <h1>
              Accepted on LeetCode.
              <br />
              <em>Saved to your GitHub.</em>
            </h1>
            <p className="hero-copy">
              Sign in once and add your LeetCode username. LeetSync handles the
              repository and browser connection for you.
            </p>
            <a
              className="button button-primary"
              href={`${API_BASE}/api/auth/github`}
            >
              Sign in with GitHub <span aria-hidden="true">↗</span>
            </a>
            <p className="subtle">
              Your LeetCode password and session stay in your browser.
            </p>
          </div>
          <div className="hero-card" aria-hidden="true">
            <div className="hero-card-top">
              <i />
              <i />
              <i />
              <span>Accepted</span>
            </div>
            <pre>{`class Solution:\n    def solve(self, data):\n        return answer`}</pre>
            <div className="hero-sync">
              ✓ <span>Committed to GitHub</span>
            </div>
          </div>
        </section>
        {error && (
          <p className="notice notice-error" role="alert">
            {error}
          </p>
        )}
      </main>
    );
  }

  const queued =
    (dashboard.counts.jobs.pending ?? 0) + (dashboard.counts.jobs.running ?? 0);
  const usernameLinked = Boolean(dashboard.leetcode?.connected);

  return (
    <main className="app-shell">
      <header className="topbar app-topbar">
        <a className="brand" href="#top">
          <span className="brand-mark">L</span>
          <span>LeetSync</span>
        </a>
        <div className="account-actions">
          <span className="avatar">
            {dashboard.account.githubLogin.slice(0, 1).toUpperCase()}
          </span>
          <b>@{dashboard.account.githubLogin}</b>
          <button
            className="button button-quiet"
            onClick={() => void signOut()}
            disabled={busy}
          >
            Sign out
          </button>
        </div>
      </header>

      <div className="content" id="top">
        <div className="welcome">
          <div>
            <p className="eyebrow">YOUR WORKSPACE</p>
            <h1>Everything is in one place.</h1>
            <p className="muted">
              Setup is saved to your account and restored when you return.
            </p>
          </div>
          <span className="live-label">
            <i /> Live status
          </span>
        </div>

        {notice && (
          <p className="notice" role="status" aria-live="polite">
            {notice}
            <button onClick={() => setNotice('')} aria-label="Dismiss">
              ×
            </button>
          </p>
        )}
        {error && (
          <p className="notice notice-error" role="alert">
            {error}
            <button
              onClick={() => {
                errorSource.current = null;
                setError('');
              }}
              aria-label="Dismiss"
            >
              ×
            </button>
          </p>
        )}

        <section className="stats" aria-label="Submission totals">
          <article>
            <span>ACCEPTED</span>
            <strong>{dashboard.counts.total}</strong>
            <small>Accepted submissions</small>
          </article>
          <article>
            <span>QUEUED</span>
            <strong>{queued}</strong>
            <small>Waiting for GitHub</small>
          </article>
          <article>
            <span>SYNCED</span>
            <strong>{dashboard.counts.jobs.synced ?? 0}</strong>
            <small>Committed to your repo</small>
          </article>
          <article>
            <span>FAILED</span>
            <strong>{dashboard.counts.jobs.failed ?? 0}</strong>
            <small>Ready for retry</small>
          </article>
        </section>

        <section className="panel setup-panel">
          <div className="section-title">
            <div>
              <p className="eyebrow">SETUP</p>
              <h2>Your connections</h2>
            </div>
          </div>
          <div className="checklist">
            <div className="check-row">
              <Status ok={dashboard.github.connected}>GitHub connected</Status>
              {dashboard.github.connected ? (
                <span>@{dashboard.account.githubLogin}</span>
              ) : (
                <a href={`${API_BASE}/api/auth/github`}>Reconnect GitHub ↗</a>
              )}
            </div>
            <div className="check-row">
              <Status ok={Boolean(dashboard.repository)}>
                Solution repository ready
              </Status>
              {dashboard.repository ? (
                <a
                  href={dashboard.repository.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {dashboard.repository.owner}/{dashboard.repository.name} ↗
                </a>
              ) : dashboard.github.connected &&
                dashboard.leetcode?.connected ? (
                <button
                  className="text-button"
                  onClick={() =>
                    void run(async () => {
                      await request('/api/github/repository/ensure', {
                        method: 'POST',
                        body: '{}',
                      });
                    })
                  }
                >
                  Retry setup
                </button>
              ) : (
                <span>
                  Connect GitHub and verify LeetCode to create your repository.
                </span>
              )}
            </div>
            <div className="check-row">
              <Status ok={dashboard.extension.connected}>
                {dashboard.extension.connected
                  ? 'Extension connected'
                  : dashboard.extension.paired
                    ? 'Extension paired'
                    : 'Extension setup pending'}
              </Status>
              <span>
                {dashboard.extension.connected
                  ? `Last seen ${formatDate(dashboard.extension.lastSeenAt)}`
                  : dashboard.extension.paired
                    ? `Last seen ${formatDate(dashboard.extension.lastSeenAt)} · open LeetCode in the Edge or Chrome profile with LeetSync installed`
                    : extensionAvailable
                      ? 'Waiting for a LeetCode tab'
                      : 'Install the extension and open LeetCode'}
              </span>
            </div>
            <div className="check-row">
              <Status ok={dashboard.counts.total > 0}>
                {dashboard.counts.total > 0
                  ? 'Submissions syncing automatically'
                  : 'Waiting for first accepted submission'}
              </Status>
              <span>
                {dashboard.counts.total > 0
                  ? `${dashboard.counts.total} accepted submission${dashboard.counts.total === 1 ? '' : 's'} synced`
                  : 'Your first Accepted result will sync automatically'}
              </span>
            </div>
          </div>

          <form
            className="username-form"
            onSubmit={(event) => void saveUsername(event)}
          >
            <label htmlFor="leetcode-username">LeetCode username</label>
            <div className="input-row">
              <input
                id="leetcode-username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="your-username"
                maxLength={39}
                required
              />
              {usernameLinked &&
              username.trim().toLowerCase() ===
                dashboard.leetcode?.username.toLowerCase() ? (
                <span className="username-connected" role="status">
                  <span aria-hidden="true">✓</span> Connected
                </span>
              ) : (
                <button
                  className="button button-primary"
                  disabled={busy || !username.trim()}
                >
                  {usernameSaved || dashboard.leetcode
                    ? 'Save username'
                    : 'Connect LeetCode'}
                </button>
              )}
            </div>
            <small>
              {dashboard.leetcode?.mismatch
                ? `This browser is signed in as ${dashboard.leetcode.detectedUsername}. Switch to ${dashboard.leetcode.username} on LeetCode to sync.`
                : usernameLinked
                  ? `Detected ${dashboard.leetcode?.username} in this browser.`
                  : 'The extension detects the signed-in account. No password or profile code is needed.'}
            </small>
          </form>
          {!dashboard.extension.connected && (
            <p className="fix-line">
              {dashboard.extension.paired
                ? 'To reconnect, open or refresh LeetCode in the Edge or Chrome profile where LeetSync is installed. The dashboard can stay open in another browser.'
                : 'In Chrome or Edge, load the LeetSync folder from the extensions page with Developer mode enabled, then open LeetCode.'}
            </p>
          )}
        </section>

        <section className="panel history-panel">
          <div className="section-title">
            <div>
              <p className="eyebrow">SYNC HISTORY</p>
              <h2>Recent submissions</h2>
            </div>
            <span className="muted">Latest 30</span>
          </div>
          {dashboard.submissions.length === 0 ? (
            <div className="empty-state">
              <strong>No accepted submissions yet</strong>
              <p>
                Keep LeetCode open with the extension installed. An Accepted
                result will appear here and sync automatically.
              </p>
            </div>
          ) : (
            <div className="history-list">
              <div className="history-head">
                <span>PROBLEM</span>
                <span>LANGUAGE</span>
                <span>TIME</span>
                <span>STATUS</span>
                <span />
              </div>
              {dashboard.submissions.map((item) => (
                <article className="history-row" key={item.id}>
                  <div className="problem">
                    <b>
                      {item.problem.number}. {item.problem.title}
                    </b>
                    <small>
                      {item.problem.difficulty} ·{' '}
                      {item.runtime || 'Runtime n/a'} ·{' '}
                      {item.memory || 'Memory n/a'}
                    </small>
                  </div>
                  <span className="language">{item.language}</span>
                  <time dateTime={item.submittedAt}>
                    {formatDate(item.submittedAt)}
                  </time>
                  <span
                    className={`job-status job-${(item.sync?.status ?? 'pending').toLowerCase()}`}
                  >
                    {item.sync?.status ?? 'PENDING'}
                  </span>
                  <div className="row-action">
                    {item.sync?.commitUrl ? (
                      <a
                        href={item.sync.commitUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Commit ↗
                      </a>
                    ) : item.sync?.status === 'FAILED' ? (
                      <button
                        className="text-button"
                        onClick={() => void retryJob(item.sync!.id)}
                        disabled={busy}
                      >
                        Retry
                      </button>
                    ) : (
                      <span>{item.sync?.error ?? ''}</span>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <footer className="footer-actions">
          {dashboard.github.connected ? (
            <button
              className="text-button"
              onClick={disconnectGithub}
              disabled={busy}
            >
              Disconnect GitHub
            </button>
          ) : (
            <a className="text-button" href={`${API_BASE}/api/auth/github`}>
              Reconnect GitHub
            </a>
          )}
          {dashboard.leetcode && (
            <button
              className="text-button"
              onClick={disconnectLeetcode}
              disabled={busy}
            >
              Disconnect LeetCode
            </button>
          )}
          <button
            className="text-button danger"
            onClick={deleteData}
            disabled={busy}
          >
            Delete my data
          </button>
          <a href="https://github.com" target="_blank" rel="noreferrer">
            GitHub ↗
          </a>
        </footer>
      </div>
    </main>
  );
}

export default App;
