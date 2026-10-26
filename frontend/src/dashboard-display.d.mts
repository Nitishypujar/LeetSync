export type SubmissionSyncState =
  'empty' | 'attention' | 'queued' | 'synced' | 'incomplete';

export type SubmissionSyncSummary = {
  state: SubmissionSyncState;
  label: string;
  detail: string;
};

export function formatDashboardRefreshTime(
  timestamp: number | null,
  locale?: string,
  timeZone?: string,
): string;

export function getSubmissionSyncSummary(
  total: number,
  jobs?: Record<string, number | undefined>,
): SubmissionSyncSummary;
