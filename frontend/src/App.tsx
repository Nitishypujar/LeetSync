import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import {
  formatDashboardRefreshTime,
  getSubmissionSyncSummary,
} from './dashboard-display.mjs';
import { approvedStoreUrl } from './store-links.mjs';

const API_BASE = (
  import.meta.env.VITE_API_BASE_URL ??
  (import.meta.env.DEV ? 'http://localhost:3000' : '')
).replace(/\/$/, '');
const EXTENSION_ID = import.meta.env.VITE_EXTENSION_ID || '';
const CHROME_STORE_URL = approvedStoreUrl(
  import.meta.env.VITE_CHROME_WEB_STORE_URL,
  'chromewebstore.google.com',
);
const EDGE_ADDONS_URL = approvedStoreUrl(
  import.meta.env.VITE_EDGE_ADDONS_URL,
  'microsoftedge.microsoft.com',
);
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
    installed: boolean;
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
type ConfirmationAction = 'github' | 'leetcode' | 'delete';

const DASHBOARD_POLL_INTERVAL_MS = 15_000;
const EXTENSION_PAIRING_INTERVAL_MS = 5_000;

const CONFIRMATION_DETAILS: Record<
  ConfirmationAction,
  {
    title: string;
    description: string;
    details: string[];
    confirmLabel: string;
    requiresText?: string;
    destructive?: boolean;
  }
> = {
  github: {
    title: 'Disconnect GitHub?',
    description:
      'LeetSync will stop writing new solutions until GitHub is connected again.',
    details: [
      'Your LeetCode connection and saved LeetSync history will remain.',
      'Files and commits already in GitHub will not be removed.',
      'If GitHub cannot be reached to revoke access, remove LeetSync from your GitHub settings.',
    ],
    confirmLabel: 'Disconnect GitHub',
  },
  leetcode: {
    title: 'Disconnect LeetCode?',
    description:
      'The extension will be unpaired and LeetSync will stop capturing new Accepted submissions.',
    details: [
      'Submissions already received by the server may finish syncing.',
      'Your saved history and files already committed to GitHub will remain.',
      'Submissions buffered in the extension may send if you reconnect later.',
    ],
    confirmLabel: 'Disconnect LeetCode',
  },
  delete: {
    title: 'Delete your LeetSync data?',
    description:
      'This permanently removes your LeetSync account and its active stored records.',
    details: [
      'Files and commits already in GitHub are not deleted.',
      'LeetSync will try to revoke provider access; if GitHub is unreachable, remove the app in GitHub settings.',
      'Type DELETE below to confirm this permanent action.',
    ],
    confirmLabel: 'Permanently delete my data',
    requiresText: 'DELETE',
    destructive: true,
  },
};

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
      'GitHub could not create the public solution repository. Check the GitHub connection and retry.',
    GITHUB_REPOSITORY_CREATE_PERMISSION_REQUIRED:
      'The GitHub App needs Repository creation write permission to create the single solution repository.',
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

function ConfirmationDialog({
  action,
  value,
  onValueChange,
  onCancel,
  onConfirm,
  busy,
}: {
  action: ConfirmationAction | null;
  value: string;
  onValueChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  busy: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const details = action ? CONFIRMATION_DETAILS[action] : null;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (action && !dialog.open) dialog.showModal();
    else if (!action && dialog.open) dialog.close();
  }, [action]);

  const canConfirm =
    Boolean(details) &&
    (!details?.requiresText || value === details.requiresText) &&
    !busy;

  return (
    <dialog
      ref={dialogRef}
      className="confirmation-dialog"
      aria-labelledby="confirmation-title"
      aria-describedby="confirmation-description"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      {details && (
        <form
          className={`confirmation-card ${details.destructive ? 'confirmation-card-danger' : ''}`}
          onSubmit={(event) => {
            event.preventDefault();
            if (canConfirm) onConfirm();
          }}
        >
          <div className="confirmation-icon" aria-hidden="true">
            {details.destructive ? '!' : '↗'}
          </div>
          <h2 id="confirmation-title">{details.title}</h2>
          <p id="confirmation-description">{details.description}</p>
          <ul>
            {details.details.map((detail) => (
              <li key={detail}>{detail}</li>
            ))}
          </ul>
          {details.requiresText && (
            <label className="confirmation-phrase">
              Confirmation phrase
              <input
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                value={value}
                onChange={(event) => onValueChange(event.target.value)}
                placeholder={details.requiresText}
                aria-label={`Type ${details.requiresText} to confirm`}
              />
            </label>
          )}
          <div className="confirmation-actions">
            <button
              type="button"
              className="button button-quiet"
              onClick={onCancel}
              autoFocus
            >
              Cancel
            </button>
            <button
              type="submit"
              className={`button ${details.destructive ? 'button-danger' : 'button-primary'}`}
              disabled={!canConfirm}
            >
              {details.confirmLabel}
            </button>
          </div>
        </form>
      )}
    </dialog>
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
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [confirmationAction, setConfirmationAction] =
    useState<ConfirmationAction | null>(null);
  const [confirmationText, setConfirmationText] = useState('');
  const errorSource = useRef<ErrorSource | null>(null);
  const dashboardLoadInProgress = useRef(false);
  const installationVerifyAttempted = useRef(false);
  const pairingInProgress = useRef(false);
  const pairingDone = useRef(false);
  const pairingToken = useRef<string | null>(null);
  const hasDashboard = dashboard !== null;

  const loadDashboard = useCallback(async (initial = false) => {
    if (dashboardLoadInProgress.current) return;
    dashboardLoadInProgress.current = true;
    if (!initial) setRefreshing(true);
    try {
      const bootstrap = await request<{ csrfToken: string }>(
        '/api/auth/bootstrap',
      );
      csrfToken = bootstrap.csrfToken;
      const data = await request<DashboardData>('/api/dashboard');
      setLastUpdatedAt(Date.now());
      setDashboard(data);
      if (
        errorSource.current === 'load' ||
        (errorSource.current === 'setup' && data.repository?.installed)
      ) {
        errorSource.current = null;
        setError('');
      }
      if (initial) setUsername(data.leetcode?.username ?? '');
      if (
        data.github.connected &&
        data.leetcode?.connected &&
        data.repository &&
        !data.repository.installed &&
        !installationVerifyAttempted.current
      ) {
        installationVerifyAttempted.current = true;
        try {
          const verification = await request<{ installed: boolean }>(
            '/api/github/installation/verify',
            {
              method: 'POST',
              body: '{}',
            },
          );
          if (verification.installed) {
            const refreshed = await request<DashboardData>('/api/dashboard');
            setDashboard(refreshed);
          }
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
      dashboardLoadInProgress.current = false;
      setLoading(false);
      setRefreshing(false);
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
    const query = new URLSearchParams(window.location.search);
    const installation = query.get('github_install');
    const installationCode = query.get('code');
    if (installation === 'success') {
      setNotice('GitHub repository access is connected.');
    } else if (installation === 'error') {
      const messages: Record<string, string> = {
        installation_removed_wrong_selection:
          'LeetSync removed its installation because more than the solution repository was selected. Try again and select only leetcode-solutions.',
        remove_installation_from_github_settings:
          'The GitHub App was granted broader repository access and LeetSync could not automatically remove it. Remove the app in GitHub settings before trying again.',
        github_reauth_required:
          'Reconnect GitHub, then connect the solution repository again.',
        repository_write_unavailable:
          'The solution repository needs Contents write permission and must be public and active.',
      };
      errorSource.current = 'setup';
      setError(
        messages[installationCode ?? ''] ??
          'GitHub repository access setup did not complete. Please try again.',
      );
    }
    if (auth || installation) {
      window.history.replaceState({}, '', window.location.pathname);
    }
    void loadDashboard(true);
  }, [loadDashboard]);

  useEffect(() => {
    if (!hasDashboard) return;

    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void loadDashboard();
    };
    const timer = window.setInterval(
      refreshWhenVisible,
      DASHBOARD_POLL_INTERVAL_MS,
    );
    document.addEventListener('visibilitychange', refreshWhenVisible);
    window.addEventListener('focus', refreshWhenVisible);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      window.removeEventListener('focus', refreshWhenVisible);
    };
  }, [hasDashboard, loadDashboard]);

  useEffect(() => {
    if (!dashboard?.github.connected || !dashboard.leetcode) {
      pairingDone.current = false;
      return;
    }
    if (!dashboard.leetcode.connected || !dashboard.extension.paired) {
      pairingDone.current = false;
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
        const issuedToken = pairingToken.current
          ? pairingToken.current
          : (
              await request<{ token: string }>('/api/extension/handshake', {
                method: 'POST',
                body: JSON.stringify({ extensionVersion: hello.version }),
              })
            ).token;
        pairingToken.current = issuedToken;
        const linked = await extensionMessage({
          type: 'LEETSYNC_TOKEN',
          token: issuedToken,
          apiBase: API_BASE || window.location.origin,
        });
        if (!linked?.saved) {
          errorSource.current = 'pairing';
          setError(
            'The extension did not finish linking. Reload the dashboard to retry.',
          );
          return;
        }
        if (!linked.matched) return;
        await request('/api/extension/handshake/complete', {
          method: 'POST',
          body: JSON.stringify({ token: issuedToken }),
        });
        pairingToken.current = null;
        if (errorSource.current === 'pairing') {
          errorSource.current = null;
          setError('');
        }
        pairingDone.current = true;
        await loadDashboard();
      } catch (pairError) {
        if (
          pairError instanceof Error &&
          pairError.message === 'LEETCODE_ACCOUNT_NOT_DETECTED'
        )
          return;
        if (
          pairError instanceof Error &&
          pairError.message === 'EXTENSION_HANDSHAKE_EXPIRED'
        )
          pairingToken.current = null;
        errorSource.current = 'pairing';
        setError(friendlyError(pairError));
      } finally {
        pairingInProgress.current = false;
      }
    };
    void attemptPairing();
    const timer = window.setInterval(
      () => void attemptPairing(),
      EXTENSION_PAIRING_INTERVAL_MS,
    );
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [
    dashboard?.github.connected,
    dashboard?.leetcode?.connected,
    dashboard?.leetcode?.detectedUsername,
    dashboard?.extension.connected,
    dashboard?.extension.paired,
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

  const openConfirmation = (action: ConfirmationAction) => {
    setConfirmationText('');
    setConfirmationAction(action);
  };

  const confirmPendingAction = () => {
    const action = confirmationAction;
    if (!action) return;
    if (action === 'delete' && confirmationText !== 'DELETE') return;

    setConfirmationAction(null);
    setConfirmationText('');
    void run(async () => {
      if (action === 'github') {
        const result = await request<{
          providerRevoked: boolean;
          appInstallationRemoved?: boolean | null;
        }>('/api/auth/disconnect-github', { method: 'POST', body: '{}' });
        setNotice(
          result.providerRevoked || result.appInstallationRemoved === true
            ? 'GitHub disconnected.'
            : 'GitHub disconnected in LeetSync. If the app could not be reached, remove LeetSync from GitHub settings too.',
        );
        return;
      }

      if (action === 'leetcode') {
        await request('/api/leetcode/disconnect', {
          method: 'POST',
          body: '{}',
        });
        pairingDone.current = false;
        setNotice('LeetCode disconnected. Your saved history was kept.');
        return;
      }

      await request('/api/data/delete', { method: 'POST', body: '{}' });
      setDashboard(null);
      setNotice('Your LeetSync data was deleted.');
    });
  };

  const disconnectGithub = () => openConfirmation('github');
  const disconnectLeetcode = () => openConfirmation('leetcode');
  const deleteData = () => openConfirmation('delete');

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
        {notice && (
          <p className="notice landing-notice" role="status" aria-live="polite">
            {notice}
            <button onClick={() => setNotice('')} aria-label="Dismiss">
              ×
            </button>
          </p>
        )}
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
  const syncSummary = getSubmissionSyncSummary(
    dashboard.counts.total,
    dashboard.counts.jobs,
  );

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
          <div className="refresh-actions">
            <span className="refresh-timestamp">
              {lastUpdatedAt === null
                ? 'Status not checked yet'
                : `Updated ${formatDashboardRefreshTime(lastUpdatedAt)}`}
            </span>
            <button
              type="button"
              className="live-label refresh-button"
              onClick={() => void loadDashboard()}
              disabled={refreshing}
              aria-label="Refresh dashboard status"
            >
              <i className={refreshing ? 'refreshing' : ''} />
              {refreshing ? 'Refreshing' : 'Refresh status'}
              <span aria-hidden="true">↻</span>
            </button>
          </div>
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

        {!dashboard.extension.paired && (
          <section
            className="panel extension-onboarding"
            aria-labelledby="extension-onboarding-title"
          >
            <div className="extension-onboarding-heading">
              <div>
                <p className="eyebrow">REQUIRED FIRST-TIME SETUP</p>
                <h2 id="extension-onboarding-title">
                  Install the LeetSync extension
                </h2>
                <p>
                  Choose your browser to install LeetSync from its official
                  extension store. After you return and connect your LeetCode
                  account, this setup step will be marked complete.
                </p>
              </div>
              <span className="extension-store-badge">
                Official store install
              </span>
            </div>

            <div className="extension-store-actions">
              {CHROME_STORE_URL ? (
                <a
                  className="button button-primary"
                  href={CHROME_STORE_URL}
                  target="_blank"
                  rel="noreferrer"
                >
                  Install for Chrome <span aria-hidden="true">↗</span>
                </a>
              ) : (
                <span className="extension-store-pending">
                  Chrome listing link is added before public launch
                </span>
              )}
              {EDGE_ADDONS_URL ? (
                <a
                  className="button button-quiet"
                  href={EDGE_ADDONS_URL}
                  target="_blank"
                  rel="noreferrer"
                >
                  Install for Edge <span aria-hidden="true">↗</span>
                </a>
              ) : (
                <span className="extension-store-pending">
                  Edge listing link is added before public launch
                </span>
              )}
            </div>

            <div className="extension-onboarding-footer">
              <span>
                After installing, return here, sign in to LeetCode in this
                browser, and enter your LeetCode username below. LeetSync never
                asks for your LeetCode password.
              </span>
              <a href="https://leetcode.com/" target="_blank" rel="noreferrer">
                Open LeetCode ↗
              </a>
            </div>
          </section>
        )}

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
              <Status
                ok={Boolean(
                  dashboard.repository && dashboard.repository.installed,
                )}
              >
                Solution repository ready
              </Status>
              {dashboard.repository?.installed ? (
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
                      const setup = await request<{
                        installationRequired?: boolean;
                      }>('/api/github/repository/ensure', {
                        method: 'POST',
                        body: '{}',
                      });
                      if (setup.installationRequired) {
                        const install = await request<{ url: string }>(
                          '/api/github/installation/start',
                        );
                        window.location.assign(install.url);
                      }
                    })
                  }
                >
                  {dashboard.repository ? 'Connect repository' : 'Retry setup'}
                </button>
              ) : (
                <span>
                  {dashboard.repository
                    ? 'Connect GitHub and verify LeetCode to finish repository setup.'
                    : 'Connect GitHub and verify LeetCode to create your repository.'}
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
              <Status ok={syncSummary.state === 'synced'}>
                {syncSummary.label}
              </Status>
              <span>{syncSummary.detail}</span>
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
              <strong>No submissions are recorded here yet</strong>
              <p>
                LeetSync only shows Accepted results captured after the browser
                extension is connected. Open LeetCode in the profile with the
                extension installed, then refresh this dashboard after a new
                Accepted result.
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
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
          <a href="/support">Support</a>
        </footer>
      </div>
      <ConfirmationDialog
        action={confirmationAction}
        value={confirmationText}
        onValueChange={setConfirmationText}
        onCancel={() => {
          setConfirmationAction(null);
          setConfirmationText('');
        }}
        onConfirm={confirmPendingAction}
        busy={busy}
      />
    </main>
  );
}

export default App;
