import { assertDatabaseTestTarget } from './local-db-guard.js';

try {
  assertDatabaseTestTarget();
} catch (error) {
  console.error(
    error instanceof Error ? error.message : 'Database safety check failed.',
  );
  process.exitCode = 1;
}
