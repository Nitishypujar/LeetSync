-- Prisma's migration ledger is internal server metadata, not application data.
-- LeetSync connects with the database owner, so Prisma can continue to read and
-- update this table while API roles receive no rows without an explicit policy.
ALTER TABLE public."_prisma_migrations" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public."_prisma_migrations" FROM PUBLIC;

DO $migration$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE public."_prisma_migrations" FROM anon';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON TABLE public."_prisma_migrations" FROM authenticated';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'REVOKE ALL ON TABLE public."_prisma_migrations" FROM service_role';
  END IF;
END
$migration$;
