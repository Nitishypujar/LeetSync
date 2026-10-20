import { processOneSyncJob } from './sync-worker.js';

export async function runSyncWorkerLoop(
  signal: AbortSignal,
  idleDelayMs = 500,
): Promise<void> {
  let consecutiveErrors = 0;
  while (!signal.aborted) {
    let worked = false;
    try {
      worked = await processOneSyncJob();
      consecutiveErrors = 0;
    } catch {
      // Queue polling may fail transiently (for example, during a brief
      // database/network interruption). Keep the worker alive and back off
      // instead of silently losing queue processing until the service restarts.
      consecutiveErrors += 1;
    }

    if ((!worked || consecutiveErrors > 0) && !signal.aborted) {
      const delayMs =
        consecutiveErrors === 0
          ? idleDelayMs
          : Math.min(
              idleDelayMs * 2 ** Math.min(consecutiveErrors - 1, 6),
              30_000,
            );
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          signal.removeEventListener('abort', abort);
          resolve();
        }, delayMs);
        const abort = () => {
          clearTimeout(timer);
          resolve();
        };
        if (signal.aborted) {
          clearTimeout(timer);
          resolve();
          return;
        }
        signal.addEventListener('abort', abort, { once: true });
      });
    }
  }
}
