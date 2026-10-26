export function formatDashboardRefreshTime(timestamp, locale, timeZone) {
  if (!Number.isFinite(timestamp)) return 'Waiting for an update';

  return new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
    ...(timeZone ? { timeZone } : {}),
  }).format(timestamp);
}

export function getSubmissionSyncSummary(total, jobs = {}) {
  const accepted = Number.isFinite(total) ? Math.max(0, Math.floor(total)) : 0;
  const synced = Number.isFinite(jobs.synced)
    ? Math.max(0, Math.floor(jobs.synced))
    : 0;
  const pending = Number.isFinite(jobs.pending)
    ? Math.max(0, Math.floor(jobs.pending))
    : 0;
  const running = Number.isFinite(jobs.running)
    ? Math.max(0, Math.floor(jobs.running))
    : 0;
  const failed = Number.isFinite(jobs.failed)
    ? Math.max(0, Math.floor(jobs.failed))
    : 0;
  const queued = pending + running;

  if (accepted === 0) {
    return {
      state: 'empty',
      label: 'Waiting for first submission',
      detail:
        'No submissions are recorded in LeetSync yet. An Accepted result captured by the extension will appear here.',
    };
  }

  if (failed > 0) {
    return {
      state: 'attention',
      label: 'Sync needs attention',
      detail: `${synced} of ${accepted} recorded submissions are synced; ${failed} need a retry.`,
    };
  }

  if (queued > 0) {
    return {
      state: 'queued',
      label: 'Sync in progress',
      detail: `${synced} of ${accepted} recorded submissions are synced; ${queued} are waiting for GitHub.`,
    };
  }

  if (synced >= accepted) {
    return {
      state: 'synced',
      label: 'All submissions synced',
      detail: `${accepted} recorded submission${accepted === 1 ? '' : 's'} committed to your repository.`,
    };
  }

  return {
    state: 'incomplete',
    label: 'Sync status incomplete',
    detail: `${synced} of ${accepted} recorded submissions show a completed sync. Refresh or retry any failed item below.`,
  };
}
