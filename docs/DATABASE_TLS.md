# PostgreSQL TLS

The backend uses strict TLS verification for Supabase database hosts. It trusts
the bundled Supabase Root 2021 CA and still checks the server hostname. The
certificate is public; its SHA-256 fingerprint is
`807025AD50D4ED219D2C9C7D299C004F824EB00CF7F65AFEF607D07B72E6CAFA`.

## Verification performed

The Root 2021 certificate fingerprint matched the root in the live server
certificate chain. A no-credential TLS handshake completed with TLS 1.3. Using
the configured URL from the supplied archive without printing it, the `pg`
client and Prisma PostgreSQL adapter each passed `SELECT 1`. A Prisma
`user.upsert` also passed inside a transaction that was explicitly rolled back.
The rollback wrote no lasting user row. These checks used Node 24.20.0 x64 and
do not verify the historical Windows 8.1 32-bit runtime or a GitHub OAuth flow.

For another PostgreSQL host using a private CA, set `DATABASE_SSL_ROOT_CERT` to
the CA file path. Relative paths are resolved from the backend process's
working directory. Do not disable certificate verification.

Prisma's command-line migration engine reads `DATABASE_URL` directly rather
than using the application's driver adapter. When running Prisma migrations
against Supabase, set `sslmode=verify-full` and
`sslrootcert=../certs/supabase-prod-ca-2021.crt` in that URL. The relative
certificate path is resolved from `backend/prisma`. Keep the root URL used for
local Docker PostgreSQL unchanged.

The hosted database migration was not applied. Review the target database and
run `npm run db:deploy` only when you intend to apply the repository migrations.
