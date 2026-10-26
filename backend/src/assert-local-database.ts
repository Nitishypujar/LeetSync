import { assertLocalDatabaseTarget } from './local-db-guard.js';

try {
  assertLocalDatabaseTarget();
  console.log('Database safety check passed: target is local.');
} catch (error) {
  console.error(
    error instanceof Error ? error.message : 'Database safety check failed.',
  );
  process.exitCode = 1;
}
