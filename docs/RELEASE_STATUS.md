# Release readiness

## Current release-readiness pass — 2026-10-26

**State: PR #7 and #8 are merged to `main`; not ready for public launch.** PR #5
was merged as `9d1e30c`, PR #6 as `911aaec`, PR #7 as `2e72a70`, and PR #8 as
`de873c3`. The latest local `npm run ci` on the PR #7 head passed lint, type
checks, 71 backend tests, 27 frontend/extension tests, both production builds,
and formatting. Seven database integration tests were skipped locally because
no disposable PostgreSQL database was configured; GitHub Actions passed its
database-backed validation and container-image checks for PRs #7 and #8. The
optional Supabase Preview check was skipped because no preview branch is
configured.

The ignored `backend/.env` resolves to a non-local database target. This pass
adds a local-target guard to development API/worker startup, local encryption
key rotation, Prisma migration, and database-test commands. The guard accepts
only localhost, loopback, or the Docker Compose `postgres` host, reads values
without printing them, and has regression coverage for local, remote, malformed,
and missing targets. With the local environment, both `npm run db:deploy` and
`npm run test:db` were verified to stop before connecting. The ignored env file
was not changed.

The first PR #6 Actions run passed but reported that its workflow actions still
targeted Node 20. PR #6 updates `actions/checkout`, `actions/setup-node`, and
`docker/setup-buildx-action` to Node 24-compatible releases. The updated
workflow passed its validation and container-image jobs for both push and pull
request events. The optional Supabase Preview check was skipped because this
branch has no linked Supabase preview branch. GitHub also reported a
non-blocking `ubuntu-latest` migration notice.

Read-only Render status on 2026-10-26 confirms the service is still on the free
plan in Singapore, with one instance, branch
`codex/release-readiness-2026-10-19`, and auto-deploy disabled. Its live deploy
is commit `13c1686f843ffaf315db57430164b3715c3ee5ee` (`dep-dbf584gae00c73eqst10`),
which does not include the current `main` changes. The live `/health` endpoint
returned `{"status":"ok","service":"leetsync-api","version":"0.1.0"}` after
the free instance woke. No deployment was triggered. The preview previously
passed `/support`, `/privacy`, and `/terms`; the unknown extensionless route
was verified after PR #2. The policy pages remain drafts requiring lawyer
review.

**Live-history finding (read-only, 2026-10-26):** the currently deployed
dashboard was authenticated as `@Nitishypujar` and showed 0 accepted, queued,
synced, or failed submissions; it said the extension was last seen on Oct 20.
This conflicts with the owner-provided 2026-10-15 dashboard capture showing
five accepted, synced submissions. The cause and any recoverable source remain
unverified. No data was repaired, created, or deleted. Resolve this discrepancy
before public release; any data repair requires explicit owner approval.

**Live-route finding:** the first post-merge deploy returned `Cannot GET` for an
unknown page. PR #2 corrected the SPA fallback to serve extensionless frontend
routes while excluding API, health, and dotted/static paths. Its regression
assertions passed in CI; the fix is now deployed and verified at an unknown URL.

The post-deploy dashboard API request ran in the owner's existing browser
session, so it was authenticated; it is not evidence of anonymous access.
Private-route authentication and no-store behavior are covered by CI tests.
The last recorded Supabase project overview flagged
`public._prisma_migrations` for disabled RLS and showed no scheduled backups.
No hosted database query, schema change, or data mutation was made in this
pass. No GitHub App permission change or secret access was performed.

**RLS remediation merged:** PR #4 (`7ddf9b3`) adds a Prisma migration that
enables RLS on the internal `_prisma_migrations` ledger, revokes `PUBLIC`
access, and conditionally revokes Supabase API-role grants. It intentionally
creates no policies, so API roles have no ledger access; the database-owner
role used by Prisma remains able to migrate. Its database assertion and all
four required GitHub Actions checks passed against disposable PostgreSQL and
container builds. The change does not alter the hosted database; the Supabase
advisor warning remains until the migration is applied after a verified
recovery backup and deployment review. Render auto-deploy is off, so the
preview is still running its earlier commit. PR #5 merged the RLS change into
`main`; the hosted migration remains unapplied.

## Previous release-readiness pass — 2026-10-25

**State: not ready for public launch.** Local work is being prepared on
`codex/investigate-missing-submissions-2026-10-20`. No Render deploy, hosted
Supabase query/migration, GitHub App change, or live-account mutation was made
in this pass. The earlier hosted preview remains a preview; changes in this
branch are local until separately reviewed and approved for deployment.

**Current Render read-only check (2026-10-25):** The service
`leetsync-nitishypujar` is on the free plan in Singapore, one instance, with
auto-deploy disabled. Render reports its active deployment as `b0407ed`
(`dep-dbblo2m7bikc739045mg`) from branch
`codex/release-readiness-2026-10-19`. The branch updates after `20ebcb3` are
not deployed. This confirms deployment status only;
no live health request or account data query was made in this check.

| Area                                              | Status                                                                  | Evidence / remaining gate                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Missing submission investigation               | **Investigated; live cause unverified**                                 | [Investigation report](INVESTIGATION_MISSING_SUBMISSIONS.md). The server history query filters by the authenticated user and has no date/status filter. Prior preflight reported zero users/submissions; current live database identity/counts and whether account deletion happened are unknown. Do not repair or fabricate rows. Owner must authorize/read the correct production project and decide any data repair.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 2. Application correctness and privacy boundaries | **Isolated CI database suite passes; live database remains unverified** | Private API routes require authentication; ownership is applied in dashboard/job paths. Local CI passed 60 backend tests with 6 database tests skipped because no disposable local DB was configured. GitHub Actions run 43 created an isolated PostgreSQL database, applied all six migrations, and passed all 66 backend tests including the database integration tests. Frontend/extension tests passed. No live Supabase query was made; never point local tests at Supabase.                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 3. Security review                                | **Bounded checks; hosted configuration partly unverified**              | Gitleaks 8.30.1 scanned all local Git refs (41 commits) and the extracted release archive with redacted output. Five history findings were classified as deterministic placeholder keys in test/config fixtures plus the intentionally public extension manifest key; the archive scan found that same public manifest key. No actual credential was identified in these scans. PR CI surfaced newly published high-severity advisories in `body-parser` 2.3.0 and Zod 3.25.76; they were patched to `body-parser` 2.4.0 and Zod 4.6.7, and the current `npm audit --audit-level=moderate` reports zero vulnerabilities. PR #4 adds a reviewed RLS migration for `public._prisma_migrations`, verified against disposable PostgreSQL; the hosted migration has not been applied, so the advisor warning is still unresolved live. Prior bounded hosted probes and headers are historical and not a third-party penetration test. |
| 4. Build, packaging, operations, and recovery     | **CI builds pass; production recovery remains unverified**              | The extension package script accepts exact HTTPS API/dashboard origins from environment; both a safe custom origin and rejection of an unsafe origin were verified. MV3 requires concrete host patterns, so changing origin still requires rebuilding/reviewing the package; broad wildcard permissions are not a safe shortcut. GitHub Actions run 43 built the API/worker and dashboard container images. Docker Desktop's Linux engine remains unavailable locally, so runtime restart and mid-queue recovery rehearsal are not verified. Render is a free preview with cold starts, one instance, and no dependable production backup/availability gate.                                                                                                                                                                                                                                                                     |
| 5. Public onboarding, legal, and store release    | **Not ready**                                                           | `/support` and a not-found screen are added locally. Draft legal and store review documents are under `docs/legal/`; they explicitly require qualified counsel/store review. Chrome/Edge store accounts, submissions, approvals, final listing URLs, custom production domain, and clean-profile store install tests are still required.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

### Security and release boundaries

- Current observed migration sources are additive; no live RLS changes were made. The `_prisma_migrations` warning is a real unresolved configuration review item, not evidence that user tables are publicly readable. Confirm the exposed schema, grants, RLS policies, and API roles with a read-only provider check before launch.
- The earlier Gitleaks scan examined only the local refs and ZIP available in this workspace. It is not proof about remote branches, provider settings, other archives, or an independent secret audit. The scanned manifest key is intentionally public and used for a stable extension ID.
- The production URL shown in the browser is treated as out of scope for testing beyond earlier recorded, bounded checks. Render service/deploy metadata was read without triggering a deploy; no live health request, database/account query, intrusive attack traffic, account traversal, password guessing, destructive request, or test submission was sent in this pass.
- Docker/WSL repairs are not part of the code change. The missing Docker Linux-engine pipe prevented a local container-based restart/recovery rehearsal; do not attempt system-level WSL repair as part of release code work.
- Public release decisions still needed: dependable hosting/database/backups and tested restore, stable domain and exact extension origins, monitoring/alerting provider, legal review, store publication, Supabase RLS/read-only audit, and a real owner-submitted Accepted sync check. Keep auto-deploy disabled until reviewed CI/release gates are configured.

### Local changes and checks in this pass

- `formatError()` only persists known safe diagnostics and coarse GitHub status codes; arbitrary exception messages, payloads, credentials, source, and stacks become a generic error. Regression tests cover these cases.
- Frontend shell routing now serves only `/`, `/privacy`, `/terms`, and `/support`; unknown paths render a not-found page rather than the dashboard. A support page describes account disconnect, data deletion, and the effect of uninstalling on a browser-local queue.
- Extension packaging can be configured with `LEETSYNC_API_ORIGIN` and `LEETSYNC_DASHBOARD_ORIGIN`. Both must be bare HTTPS origins; package permissions remain exact and include only the configured app origin and the two required LeetCode domains.
- Local `npm run ci` passed lint/typecheck, 60 backend tests (with six database tests skipped locally), 27 frontend/extension tests, production build, and Prettier. GitHub Actions run 43 then passed the audit with zero vulnerabilities, applied all six migrations to its isolated PostgreSQL service, passed all 66 backend tests including the six database integration tests, passed 27 frontend/extension tests, and built both container images. This did not touch Supabase.
- The package script passed with a safe alternate pair of HTTPS origins and rejected an unsafe origin. This produced only an ignored local check archive; the existing release ZIP was preserved.
- **Dependency audit follow-up (2026-10-25):** GitHub Actions surfaced two newly published high-severity advisories that were not present in the earlier local audit snapshot: `body-parser` 2.3.0 and Zod 3.25.76. Upgraded the compatible `body-parser` transitive dependency to 2.4.0 and moved the shared/backend Zod dependency to patched 4.6.7. Type checks and the complete CI suite passed; a fresh `npm audit --audit-level=moderate` reports zero vulnerabilities. The first local Vitest run hit a Windows sandbox temporary-file rename restriction; rerunning outside that sandbox passed.
- Gitleaks scanned the packaged files after extracting the test archive. It flagged only `manifest.json`'s intentionally public stable extension identifier (the expected manifest-key match); no authentication credential was identified. The redacted scan report is ignored under `.tmp/security-tools/gitleaks/`.
- A fresh redacted history scan covered all 41 local commits. Its five findings map to deterministic test-key placeholders in `backend/.env.example`, `.github/workflows/ci.yml`, and `.env.example`, plus the intentionally public `extension/manifest.json` stable extension identifier. These are classified findings, not active credentials; values were not printed.
- Package script check for the configured preview origin completed in an ignored temporary archive (SHA-256 `976D43858D22839BB8391418369C98A13949616FCD64C2DB9D539E76EF45AA79`). This is a local validation artifact, not a store submission or deployment. The pre-existing `dist/LeetSync-0.1.5.zip` was preserved.
- The six database integration tests were skipped in the local sandbox run but passed against the isolated PostgreSQL service in GitHub Actions run 43. Neither test run used the hosted Supabase database.

### Human-only gates (do not perform automatically)

1. **Live database read:** authorize a read-only identity/project verification and counts for the correct Supabase environment; resolve missing submissions only after evidence and explicit data-repair approval.
2. **Production changes:** choose and approve domain, hosting/database tier, backup/restore plan, and monitoring. Then separately approve the exact Render deployment and any Supabase schema/policy change.
3. **Secrets and GitHub App:** user/operator manages credentials privately. Do not paste secrets into chat or source control. Any secret discovered in Git history or a built archive must be reported with its file and commit and left untouched pending approval.
4. **Legal and stores:** qualified lawyer reviews final Privacy/Terms and LeetCode integration; owner submits and obtains Chrome/Edge store approval, then supplies final listing URLs.
5. **End-to-end acceptance:** verify an existing owner-submitted Accepted item against exactly one repository commit and dashboard event. A user-shared dashboard capture from 2026-10-15 showed five accepted and synced entries, but the live account history was not queried during this 2026-10-25 pass. Request a new real submission only if the existing evidence cannot be reproduced. Never synthesize an account's solution or write an unsolicited commit.

> **Historical handoff verification (2026-10-20):** At that time, local CI had passed lint, type checks, 56 backend tests (with 6 intentionally skipped), 27 frontend/extension tests, production builds, and Prettier. Six database integration tests passed on disposable databases and `npm audit --audit-level=moderate` found no vulnerabilities. Backend and frontend production Docker images built successfully. The Render preview at [`leetsync-nitishypujar.onrender.com`](https://leetsync-nitishypujar.onrender.com) was live at commit `2e56e83` (deploy `dep-dbblhsu7bikc738vhg60`); its health check was `/health`, free plan, Singapore region, one instance, and automatic deploys were disabled. GitHub App user authorization and the selected-repository installation were verified in the hosted dashboard; the installation is limited to `Nitishypujar/leetcode-solutions`. The existing LeetSync-Dev Supabase schema was backed up locally with Windows DPAPI, baselined, and advanced through all six Prisma migrations after approval. The backup is account-bound and not an off-site recovery copy. The hosted dashboard then showed no accepted submissions, so a real new Accepted submission had not yet verified the complete hosted extension-to-GitHub flow. See [the detailed verification handoff](VERIFICATION_HANDOFF_2026-10-16.md) for historical branch comparison and repository details.

> **Migration safety:** the `20261012000000_automatic_linking_and_full_submissions` migration has been changed locally to preserve the legacy `extension_pairing_codes` and `verification_challenges` tables and their rows. It applied successfully on a clean disposable PostgreSQL database. Before using it against a shared database, verify that the old migration has not already been applied there; rewriting an applied Prisma migration can cause a checksum mismatch.

> **Historical approval follow-up (2026-10-16):** User approved a new review branch, Render preview setup with auto-deploy off, GitHub App registration, a conditional non-destructive migration fix, and hosted migrations only after all gates pass. At that time, the connected GitHub integration could not create the branch, Render was not connected, and Supabase inspection found existing tables but no Prisma history. The hosted schema was not modified then. The local disposable rehearsal proved that the baseline and six-migration sequence worked. Current hosted state is recorded below.

LeetSync's release code is merged to `main`, while the last verified Render preview still runs the earlier commit because auto-deploy is disabled. It is not ready for a public multi-user launch. Remaining gates are the unresolved missing-submission history, a real hosted Accepted-submission sync, applying the reviewed RLS migration only after an independently stored recovery backup and restore rehearsal, qualified legal review of the Privacy/Terms drafts, extension store review/publication, clean-profile store installation tests, and production hosting, domain, monitoring, and backup decisions. A reproducible extension ZIP is generated locally with a stable manifest ID and production-only host permissions. Render's free instance can sleep and is suitable for preview, not dependable production availability. The current rate limiter is process-local, so production must remain at one API instance until shared storage is added.

## Historical continuation — 2026-10-20

- **Queue-worker recovery fix (2026-10-20):** A transient database/network error could previously terminate the queue polling loop while leaving the web service online. The worker now retries with capped exponential backoff and still exits promptly on shutdown. Regression test added; full CI passes with 57 backend tests (6 skipped) and 27 frontend/extension tests. The currently deployed preview predates this local fix; because Render auto-deploy is off, it must be deployed explicitly after the change is published.
- **Extension archive:** Built `dist/LeetSync-0.1.5.zip` locally. SHA-256: `BC753AD149A01DF439A01C07FFFD7A566DC8A68C1FA31B38C9164D451B4D41A8`. The package uses the current Render preview URL; regenerate after approved store URLs or the final production domain are available.
- The deployed Render service is `leetsync-nitishypujar`, on `codex/release-readiness-2026-10-19`. Commit `2e56e83` is live; automatic deploy remains disabled, so future reviewed code changes need an explicit deploy.
- The public extension onboarding panel is deployed at `c86c7cc`; the health endpoint and dashboard return HTTP 200, and the live bundle contains both browser store calls to action. Store URLs remain unset pending official listing approvals.
- Render is on the free Starter plan in Singapore with one instance. Health path is `/health`. It co-hosts the dashboard, API, and worker; expected free-tier sleep and cold starts remain.
- Hosted dashboard confirms GitHub `Nitishypujar`, the canonical `leetcode-solutions` repository, GitHub App installation, extension connection, and LeetCode username `nitishypujar_leetcode`. The installed App has access to only the selected canonical repository.
- At that time, no accepted submission appeared in the hosted dashboard. A user-shared 2026-10-15 dashboard capture showed five accepted and synced entries. The 2026-10-25 release check did not query live submission history; verify the current state read-only before concluding that a new submission is needed. Do not fabricate a test submission or write a test commit.
- Handoff ZIPs and ignored `.env` files are excluded from source control. Docker Desktop was unavailable earlier; the current hosted deployment was verified through Render's deployment status instead.

## Changes and verification in this pass

- **Public extension onboarding (2026-10-20):** Added a first-run dashboard panel linking to the official Chrome Web Store and Microsoft Edge Add-ons listings. It appears until the extension pairs and is hidden afterward. Listing URLs are configurable through build-time environment values and validated against the exact official HTTPS host; missing listings are presented as pending rather than linked to a placeholder. This does not publish the extension. Store submissions, review approval, real listing URLs, and the clean-profile install test remain release gates.
- **Organized security review (2026-10-20):** A bounded live check found publicly downloadable source maps containing 14 original frontend source files, a weaker CSP on the API-served dashboard than on the separate Nginx site, and SPA fallback responses that returned dashboard HTML with HTTP 200 for missing file paths (including `/.env`). Fixed all three in `c86c7cc` and verified the deployment: map, `/.env`, package, and backend-source paths now return 404; no source-map reference remains in the JS; the page sends `frame-ancestors 'none'`, `style-src 'self'`, `X-Frame-Options: DENY`, HSTS, and Permissions Policy. Live unauthenticated checks returned 401 for dashboard data, 204 without CORS permission for attacker-origin preflight, and 403 for attacker-origin state changes and extension writes. This was a bounded, non-destructive pass, not a denial-of-service, password-guessing, or independent third-party penetration test.
- **Follow-up route probing (2026-10-20):** Additional live checks found `/.git/config` and `/.git/HEAD` returned the dashboard shell because the SPA fallback excluded dots only in the final path segment. No Git metadata was served. The fallback now rejects any dotted path segment, with regression coverage for Git metadata and nested file-like paths. Commit `2e56e83` is live (deploy `dep-dbblhsu7bikc738vhg60`); follow-up live probes confirmed 404 for both Git metadata paths, `/.env`, the old source-map URL, and backend source paths. Full CI passes (56 backend tests, 6 skipped; 27 frontend/extension tests), and `npm audit --audit-level=moderate` reports no vulnerabilities.
- Removed the two incorrectly synced `Pow(x, n)` files from `Nitishypujar/leetcode-solutions`. The repository README now lists only the valid Two Sum and Median of Two Sorted Arrays entries.
- Cleaned the public repository layout: the root now contains only its overview README and `solutions/`; each accepted problem folder contains exactly one problem README and the submitted source. Removed the stale duplicate root-level Median README after moving its accepted source under `solutions/`.
- Hardened LeetCode pairing. An extension heartbeat can report the detected username and deactivate a mismatched link, but only a dashboard-authenticated, CSRF-protected completion of the one-time pairing token can activate the link.
- Added production configuration checks that reject insecure/local public URLs and common sample placeholders for production secrets, with regression coverage that preserves local development settings.
- Made the dashboard image generate `connect-src` from its configured API URL; standalone builds now reject localhost API targets unless a local-only build override is explicitly enabled.
- Updated dashboard pairing retries and extension status handling so a matching account waits for dashboard confirmation and buffered submissions remain queued until then.
- Added a database-backed regression scenario for heartbeat, authenticated pairing completion, and mismatch deactivation, plus an extension test for buffered delivery while confirmation is pending.
- Preserved the dashboard favicon, draft Privacy and Terms pages, and footer links from the earlier completion pass.
- Added resumable, compare-and-swap encryption-key rotation for saved GitHub tokens, with support for temporarily accepting the previous key. The owner reports rotating provider values; whether the encryption-key migration was run successfully is not confirmed.
- Added a GitHub App connection flow that validates browser-bound install state, verifies that exactly the canonical solution repository was selected, and mints installation tokens scoped to that repository and Contents write permission. The worker now uses those scoped tokens. If an install is granted extra repository access, LeetSync attempts to uninstall it only after verifying that it belongs to the signed-in user's personal account; disconnect removes that user's app installation and always removes the local write link.
- Added same-origin production mode that serves the dashboard from the API process, simplifying cookie security and the free preview deployment.
- Fixed same-origin production extension pairing to pass the dashboard/API origin to the browser extension. The extension validates dashboard messages and API targets against its manifest allowlists; the expected Render preview origin has regression coverage.
- The owner reported rotating provider secrets and updating Render fields. The hosted dashboard subsequently confirmed GitHub authentication and access to the canonical repository. Secret values were not read back or recorded. Future token-key rotations must still use the documented dual-key migration.
- **Historical local result (2026-10-20):** `npm run ci` passed with 56 backend tests (6 skipped) and 27 frontend/extension tests. The 6 database integration tests also passed separately against the disposable local database. `npm audit --audit-level=moderate` found zero vulnerabilities at that time. Never run the DB tests against hosted Supabase.
- **Rate-limit hardening:** Render’s service config opts into the validated `CF-Connecting-IP` header for anonymous limits; other environments keep proxy headers untrusted. Buckets are capped at 4,096 entries. The limiter remains per-process, so multi-instance production requires shared storage.
- **Legal drafts:** the Privacy Policy and Terms contain operator name (`NITISH Y PUJAR`), support email, India jurisdiction, Render and Supabase provider names, Singapore hosting regions, and a clear retention rule (account data is retained until the owner deletes it). Supabase's [region list](https://supabase.com/docs/guides/platform/regions) maps `ap-southeast-1` to Singapore; its [backup guide](https://supabase.com/docs/guides/platform/backups) says Free projects should maintain their own off-site exports. The policy states there is no routine off-site backup or deleted-data recovery promise. Pages remain clearly marked as drafts pending qualified legal review.
- **Extension release package:** `scripts/package-extension.ps1` validates and builds the versioned ZIP while removing localhost and unconfigured API hosts from the packaged permission allowlists. The development manifest remains unchanged. The archive is verified locally; a clean-profile test and store review are still needed.
- **Local preview:** Docker Compose was rebuilt and started on 2026-10-19. Its API returned HTTP 200 from `/health`, the frontend returned the dashboard HTML, and its database is the local `postgres` Compose service. No hosted Supabase or external GitHub writes were used.
- **Historical dependency audit:** `npm audit --audit-level=moderate` completed on 2026-10-20 with zero reported vulnerabilities at that time.
- **Hosted schema migration (2026-10-19):** Created `.tmp/supabase-leetsync-20261019.dpapi` from the LeetSync-Dev PostgreSQL 17.11 database using PostgreSQL 18.6 tools. The backup is ignored by Git, encrypted chunk-by-chunk with Windows DPAPI for the current Windows account, and verified by decrypting every chunk in memory and parsing the archive with `pg_restore --list`; no plaintext dump was written to disk. Read-only preflight confirmed the two initial SQL migrations match the live schema, zero users/submissions, and zero duplicate pairing/verification hashes. After approval, those two IDs were baselined in Prisma and the remaining four migrations were applied. Post-migration `prisma migrate status` reports all six applied, zero unfinished migrations, all expected columns present, and `ConnectionStatus.PENDING` present. The encrypted backup is machine/account-bound and is not an off-site recovery copy.
- **GitHub App / Render (2026-10-20):** The GitHub App is registered and installed with only `leetcode-solutions` selected. The Render free preview is deployed and live with auto-deploy off; the hosted dashboard verified the owner, repository, extension, and LeetCode account connections. App credentials are provider-managed and intentionally absent from this repository. A new real Accepted submission must still prove end-to-end sync on the hosted service.

## Required before public release

1. **Keep local and hosted database targets separate.** The ignored
   `backend/.env` resolves to a non-local database. Standard local development,
   worker, local key-rotation, migration, and database-test scripts now refuse
   targets outside `localhost`, `127.0.0.1`, `::1`, and Docker Compose's
   `postgres` host. Keep using a dedicated disposable database for integration
   tests. Do not bypass this guard to access hosted Supabase; any hosted
   migration remains separately gated by an independently stored backup,
   restore rehearsal, and deployment review.
2. **Create a production recovery plan and apply the pending RLS migration.** The existing Supabase Dev project had its first six Prisma migrations applied; PR #7 adds a seventh migration protecting `public._prisma_migrations`, which has not been applied to the hosted database. Its verified DPAPI backup is local and Windows-account-bound, not an independent recovery copy. Before a hosted migration, establish provider backups or encrypted off-site exports, rehearse a restore into an isolated database, review the migration, and obtain explicit approval. Then confirm the advisor warning clears and the Prisma owner can still deploy migrations.
3. **Resolve live history and finish end-to-end verification.** The authenticated dashboard showed 0 submissions on 2026-10-26, conflicting with the owner's 2026-10-15 capture of five synced entries. Determine the intended account/data source read-only first. Do not repair or recreate records without explicit owner approval. Then verify one genuine Accepted submission has exactly one `SYNCED` row and expected commit, and check retry/disconnect behavior non-destructively.
4. **Complete an independent security review.** Recheck the production threat model, OAuth/App permissions, extension permissions, rate limits, logging and data deletion paths before opening signups. Automated tests and a clean dependency audit do not establish that the service is unbreachable.
5. **Choose dependable production hosting.** The current Render free preview is deployed. For public launch, select an always-on plan, reliable worker arrangement, database backups/restore, alerting, and a custom domain; keep one API instance until rate limiting uses a shared store.
6. **Finish launch materials and extension distribution.** The dashboard now has a first-run official-store setup panel; the Chrome and Edge listing URLs remain unset until their listings are approved. Obtain qualified legal review, establish and document a recoverable backup/restore policy, configure the production domain, submit the packaged extension for store review, add the approved listing URLs to the frontend build, and test the store install plus full flow in a clean profile on that domain.

## Remaining known limits

- A stolen extension token can still submit a fake, valid-shaped Accepted payload for an already-active link because LeetCode provides no server-verifiable receipt. Disconnecting the browser or LeetCode link revokes the token. A repository-limited GitHub App reduces the potential write scope.
- Automated tests cannot prove the service is unbreachable. The database-backed pairing regression passed against an isolated disposable PostgreSQL database; it still needs end-to-end validation through the deployed service and real extension.
- Historical backfill, Chrome Web Store publishing, and broader browser automation can follow after the release gates above.
