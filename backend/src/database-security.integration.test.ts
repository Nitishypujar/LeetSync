import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from './db.js';

const testSuite =
  process.env.RUN_DB_TESTS === 'true' ? describe : describe.skip;

testSuite('database security configuration', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('keeps the Prisma migration ledger row-level secured with no API policies', async () => {
    const rows = await prisma.$queryRaw<
      Array<{ row_security_enabled: boolean; policy_count: number }>
    >`
      SELECT
        table_info.relrowsecurity AS row_security_enabled,
        (
          SELECT count(*)::integer
          FROM pg_policies
          WHERE schemaname = 'public'
            AND tablename = '_prisma_migrations'
        ) AS policy_count
      FROM pg_class AS table_info
      JOIN pg_namespace AS schema_info
        ON schema_info.oid = table_info.relnamespace
      WHERE schema_info.nspname = 'public'
        AND table_info.relname = '_prisma_migrations'
    `;

    expect(rows).toHaveLength(1);
    const migrationLedger = rows[0];
    if (!migrationLedger) {
      throw new Error('Prisma migration ledger was not found');
    }

    expect(migrationLedger.row_security_enabled).toBe(true);
    expect(migrationLedger.policy_count).toBe(0);
  });
});
