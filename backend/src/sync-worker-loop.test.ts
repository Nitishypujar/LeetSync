import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runSyncWorkerLoop } from './sync-worker-loop.js';

const { processOneSyncJob } = vi.hoisted(() => ({
  processOneSyncJob: vi.fn<() => Promise<boolean>>(),
}));

vi.mock('./sync-worker.js', () => ({ processOneSyncJob }));

describe('sync worker loop', () => {
  beforeEach(() => {
    processOneSyncJob.mockReset();
  });

  it('stops cleanly when aborted during a poll', async () => {
    const controller = new AbortController();
    processOneSyncJob.mockImplementation(async () => {
      controller.abort();
      return false;
    });

    await expect(runSyncWorkerLoop(controller.signal, 0)).resolves.toBe(
      undefined,
    );
    expect(processOneSyncJob).toHaveBeenCalledTimes(1);
  });

  it('keeps polling after a transient worker error', async () => {
    const controller = new AbortController();
    processOneSyncJob
      .mockRejectedValueOnce(new Error('temporary database error'))
      .mockImplementationOnce(async () => {
        controller.abort();
        return false;
      });

    await expect(runSyncWorkerLoop(controller.signal, 0)).resolves.toBe(
      undefined,
    );
    expect(processOneSyncJob).toHaveBeenCalledTimes(2);
  });
});
