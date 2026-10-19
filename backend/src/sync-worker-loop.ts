import { processOneSyncJob } from './sync-worker.js';

export async function runSyncWorkerLoop(
  signal: AbortSignal,
  idleDelayMs = 500,
): Promise<void> {
  while (!signal.aborted) {
    const worked = await processOneSyncJob();
    if (!worked && !signal.aborted) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          signal.removeEventListener('abort', abort);
          resolve();
        }, idleDelayMs);
        const abort = () => {
          clearTimeout(timer);
          resolve();
        };
        signal.addEventListener('abort', abort, { once: true });
      });
    }
  }
}
