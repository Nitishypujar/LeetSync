# Production deployment runbook

This runbook prepares a public deployment without tying LeetSync to a hosting
vendor. The local Docker Compose stack is for development only. Do not publish
until the release gates in [RELEASE_STATUS.md](RELEASE_STATUS.md) are closed.

## Recommended free preview hosting

For a no-cost preview, use Render for the public dashboard and API, and keep the
already-configured Supabase project as PostgreSQL. This is a preview choice,
not a reliable public launch plan: Render's free web service sleeps after 15
minutes without traffic and can take about a minute to wake; free Render does
not offer a background-worker service, and its free PostgreSQL expires after
30 days. Supabase may pause a free project after a week of low database use.
LeetSync can co-host its queue worker with the free API by setting
`RUN_SYNC_WORKER=true`; the Render API still sleeps when idle, so queued
submissions can wait until the service wakes.
For a dependable public release, budget for an always-on worker and a database
plan with backups and a tested restore path.

For a free preview, reuse the existing Supabase project only after its password
is rotated and the new connection string is saved in the hosting secret
manager. Confirm the free-plan pause and backup limitations in the provider
dashboards before putting real users on it. For a public production launch,
use a dedicated production database with backups and a tested restore path; do
not share the local/test database with production.

## Required services

- A managed PostgreSQL database with backups and a tested restore path.
- An API service running `backend/dist/server.js`.
- One durable worker running `backend/dist/worker.js`.
- A dashboard served from the API process over HTTPS, or a separately hosted static site.
- A TLS endpoint that redirects HTTP to HTTPS and sends HSTS.
- A single API instance unless rate limiting has first been moved to a shared
  store. The current limiter is process-local.

The repository includes a [Render Blueprint](../render.yaml) for a free preview.
It uses a single Singapore Node web service for the API, dashboard,
and worker (`RUN_SYNC_WORKER=true`). Same-origin hosting keeps session cookies
first-party and avoids a separate dashboard/API CORS boundary. The separate
durable worker service remains the recommended paid production configuration.
The Blueprint's expected public host is
`https://leetsync-nitishypujar.onrender.com`; if Render assigns a different
host, update `FRONTEND_ORIGIN` and the GitHub App callback before enabling
sign-in. Keep automatic deploys disabled until a GitHub Actions test gate is
connected.

Render supports pre-deploy commands only on paid compute plans. The prepared
free preview intentionally does not run migrations during startup. Run them as
a separately reviewed operation after verifying migration history and a
recoverable backup; never let each service restart apply schema changes.

Use separate origins such as `https://app.example.com` and
`https://api.example.com`. These are examples, not configured production
addresses. The extension manifest must list the exact API host under
`host_permissions` and the dashboard origin under
`externally_connectable.matches`. The worker validates pairing messages against
these manifest entries. The prepared Render preview origin is included; if
Render assigns a different hostname, update the manifest, `FRONTEND_ORIGIN`,
and `GITHUB_CALLBACK_URL`, then reload or repackage the extension.

## Secrets and backend configuration

Set these in the hosting provider's secret manager. Use the same backend
settings for the API, worker, and one-off migration job unless noted.

| Variable                 | Production value                                                       |
| ------------------------ | ---------------------------------------------------------------------- |
| `NODE_ENV`               | `production`                                                           |
| `PORT`                   | The port required by the hosting platform                              |
| `RUN_SYNC_WORKER`        | `true` only when co-hosting the queue worker in the API process        |
| `TRUST_CF_CONNECTING_IP` | `true` on Render; otherwise leave `false`                              |
| `DATABASE_URL`           | The production PostgreSQL URL, with TLS certificate validation enabled |
| `SESSION_SECRET`         | Newly generated random value of at least 32 characters                 |
| `TOKEN_ENCRYPTION_KEY`   | Newly generated 64-character hexadecimal key                           |
| `GITHUB_CLIENT_ID`       | Production GitHub App client ID                                        |
| `GITHUB_CLIENT_SECRET`   | GitHub App client secret                                               |
| `GITHUB_AUTH_MODE`       | `github_app` after registering and testing the GitHub App              |
| `GITHUB_APP_ID`          | Numeric GitHub App ID                                                  |
| `GITHUB_APP_SLUG`        | GitHub App URL slug                                                    |
| `GITHUB_APP_PRIVATE_KEY` | GitHub App private key, stored as a secret file or multiline secret    |
| `GITHUB_CALLBACK_URL`    | `https://api.example.com/api/auth/github/callback`                     |
| `FRONTEND_ORIGIN`        | Exact dashboard origin, with no path or query string                   |
| `EXTENSION_ID`           | ID from the signed extension package                                   |

The Render Blueprint generates `SESSION_SECRET` automatically as a random
256-bit value. Provide the database and GitHub App credentials only through
Render's secret fields; never commit them to this repository.

The backend rejects insecure or localhost public URLs and common example
placeholders in production mode. Never place secret values in frontend build
arguments, source control, logs, or this document. Rotating the token
encryption key requires the safe rotation sequence below; do not replace the
key without first deploying the previous-key compatibility setting and running
the migration.

Render passes public traffic through Cloudflare. Its guidance says
`CF-Connecting-IP` is overwritten at the edge, while `X-Forwarded-For` can
contain a caller-supplied address. The Render Blueprint explicitly enables
`TRUST_CF_CONNECTING_IP` so anonymous route limits use validated client IPs.
The backend defaults this setting to false; only enable it behind the trusted
Render edge. See [Render's client IP guidance](https://render.com/articles/how-render-handles-ddos-attacks).
The limiter is still per-process, so keep one API instance until limits move to
shared storage.

## Rotate exposed credentials safely

Do these steps in provider dashboards and the hosting secret manager. Do not
send passwords, generated keys, or token values in chat.

1. **Rotate the existing GitHub OAuth secret.** Open GitHub → profile picture →
   Settings → Developer settings → OAuth Apps → LeetSync Local → Generate a
   new client secret. Put the new value in the hosting secret manager and
   redeploy the backend. Then register the new fine-grained GitHub App as a
   separate app; do not delete the old OAuth app until migration is verified.
2. **Rotate the Supabase database password.** In Supabase, open the existing
   project → Project Settings → Database → reset the database password. Update
   `DATABASE_URL` in the hosting secret manager and the local ignored
   `backend/.env` file. Restart the API, worker, and migration service. If the
   shared pooler briefly rejects the new password, wait a few minutes and
   retry; Supabase documents short-lived credential caching after rotation.
3. **Rotate the token-encryption key without disconnecting users.** Generate a
   new random 32-byte key (64 hexadecimal characters). Set it as
   `TOKEN_ENCRYPTION_KEY` and set the old value temporarily as
   `TOKEN_ENCRYPTION_KEY_PREVIOUS` in the backend secret manager. Deploy this
   version to the API and worker, then run the one-off command
   `npm run rotate:encryption-key -w backend` against the production database.
   It prints only token-row counts. If it reports rows changed during rotation,
   rerun it until that count is zero. Then remove
   `TOKEN_ENCRYPTION_KEY_PREVIOUS` and redeploy. The command can be rerun if
   interrupted; it skips rows already encrypted with the new key.
4. **Rotate the session secret.** Generate a new random value of at least 32
   characters, replace `SESSION_SECRET`, and redeploy. This intentionally ends
   current website sessions; users sign in again. It does not delete their
   account data or invalidate database-encrypted GitHub tokens.
5. **Verify.** Sign in, check GitHub status, submit no test problem, and confirm
   the API can read the encrypted token and the worker can process a queued
   job. Never test by writing an unsolicited commit to a user's repository.

For local development, use the same rotation script from the backend folder
with `npm run rotate:encryption-key:local`; it reads that folder's ignored
`.env` file. Do not point this command at a production database from a local
shell unless you intentionally mean to run the migration there.

## Build configuration

Build the dashboard with:

- `VITE_API_BASE_URL=https://api.example.com`
- `VITE_EXTENSION_ID` set to the distributed extension ID
- `LEETSYNC_ALLOW_LOCAL_API_URL=false`

The image generates its CSP `connect-src` from the API origin and rejects a
localhost API target by default. The Compose development stack explicitly opts
into localhost.

Keep only the chosen production dashboard origin and API host in the extension
allowlists, plus the required LeetCode hosts. Keep the stable manifest key for
an existing installation; changing it changes the extension ID and invalidates
dashboard messaging configuration.

## Release sequence

1. Rotate exposed provider credentials. Update GitHub, database, and hosting
   secret settings. Do not reuse values from the supplied archive or local
   `.env` files.
2. Complete GitHub App setup. The local flow supports GitHub App user
   authorization plus a repository-limited installation token. Register the
   App after the production service URL is known. Set its user authorization
   callback to `/api/auth/github/callback` and its post-install setup URL to
   `/api/github/installation/callback`. For user authorization, request
   `Repository creation: write` (to create the one canonical public repository)
   and `Metadata: read-only`. Do not grant `Administration` or use the classic
   OAuth `public_repo` scope in App mode. For the installation, grant
   `Contents: read and write` and select only `leetcode-solutions`; installation
   write tokens are further scoped to that repository. If an installation is
   accidentally granted broader access, LeetSync attempts to uninstall it only
   after GitHub confirms it belongs to the signed-in user's own account.
   Exercise sign-in,
   repository creation/reuse, callback state validation, sync, token refresh,
   disconnect, and app removal before switching production to
   `GITHUB_AUTH_MODE=github_app`.
3. For a free preview, use the existing Supabase project as described above.
   The Render service intentionally starts without running migrations. Apply
   migrations as a separate, reviewed operation only after the isolated
   database suite passes, migration history is checked, and a recovery plan is
   ready. For public production, create a dedicated production database and
   run migrations once through a one-off job before rolling out the API and
   worker. Never repoint the local test suite at either live database.
   **Existing Supabase migration history requires special handling:** its
   tables are present and `supabase_migrations.schema_migrations` records only
   `20261005180000` and `20261005220000`; `_prisma_migrations` is absent. Do
   not run `prisma migrate deploy` directly against it, because Prisma would
   attempt to replay the initial table-creation migrations. First obtain a
   recoverable backup and verify the live schema. Then, as a separately
   approved one-time metadata operation, baseline exactly those two existing
   Prisma migration IDs with `prisma migrate resolve --applied`. Apply the
   remaining four migrations only after the baseline is verified against a
   disposable clone and the schema/data recovery plan is ready. No hosted
   migration has been run.
4. Build and deploy the API, worker, and dashboard with the production
   configuration. Verify the dashboard origin in API CORS and the callback URL
   in GitHub exactly match the deployed origins.
5. Confirm HTTPS redirect, HSTS, secure cookies, CSP, health checks, alerting,
   and a successful database restore test. The free preview has limited backup
   guarantees, so it does not satisfy the public-production backup gate.
6. Install the rebuilt extension in a test browser profile. Verify account
   pairing, a real Accepted submission, duplicate capture, mismatch handling,
   queue retry, the final GitHub commit, and both disconnect actions.
7. Complete and review the Privacy Policy and Terms with the actual operator,
   contact, service providers, data-retention rules, and governing jurisdiction
   before enabling public signups.

## Release validation

The current local suite runs with `npm run ci`. Database integration tests run
in CI against its disposable PostgreSQL service. For a separate local run,
create and migrate an isolated test database first, then follow the database
test instructions in the root README. Never use the production database for
tests that create or delete fixture records.
