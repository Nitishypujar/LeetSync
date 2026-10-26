import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatDashboardRefreshTime,
  getSubmissionSyncSummary,
} from '../src/dashboard-display.mjs';

test('refresh label handles an unavailable timestamp', () => {
  assert.equal(formatDashboardRefreshTime(null), 'Waiting for an update');
  assert.equal(formatDashboardRefreshTime(Number.NaN), 'Waiting for an update');
});

test('refresh label formats the last successful refresh time', () => {
  assert.equal(
    formatDashboardRefreshTime(
      Date.parse('2026-10-26T12:34:00Z'),
      'en-US',
      'UTC',
    ),
    '12:34 PM',
  );
});

test('empty history does not imply that the user never solved an accepted problem', () => {
  assert.deepEqual(getSubmissionSyncSummary(0, {}), {
    state: 'empty',
    label: 'Waiting for first submission',
    detail:
      'No submissions are recorded in LeetSync yet. An Accepted result captured by the extension will appear here.',
  });
});

test('failed submissions are highlighted even when other submissions synced', () => {
  const summary = getSubmissionSyncSummary(4, {
    synced: 3,
    failed: 1,
  });

  assert.equal(summary.state, 'attention');
  assert.equal(summary.label, 'Sync needs attention');
  assert.match(summary.detail, /3 of 4/);
  assert.match(summary.detail, /1 need a retry/);
});

test('queued work is distinguished from a completed sync', () => {
  const summary = getSubmissionSyncSummary(3, {
    synced: 1,
    pending: 1,
    running: 1,
  });

  assert.equal(summary.state, 'queued');
  assert.match(summary.detail, /2 are waiting for GitHub/);
});

test('missing job records are reported as incomplete instead of synced', () => {
  const summary = getSubmissionSyncSummary(2, { synced: 1 });

  assert.equal(summary.state, 'incomplete');
  assert.match(summary.detail, /1 of 2/);
});

test('fully synced submissions have a completed state', () => {
  const summary = getSubmissionSyncSummary(2, { synced: 2 });

  assert.equal(summary.state, 'synced');
  assert.equal(
    summary.detail,
    '2 recorded submissions committed to your repository.',
  );
});
