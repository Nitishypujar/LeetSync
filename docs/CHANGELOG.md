## Verification handoff — 2026-10-16

- Reviewed the supplied source ZIP without changing the original archive; it contains no Git metadata, so its source branch/working-tree state cannot be reconstructed from the ZIP alone.
- Passed the 24 extension/frontend configuration regression tests, JavaScript syntax checks, JSON parsing, and YAML parsing.
- Recorded the full-CI/dependency-audit blocker (`EAI_AGAIN` resolving `registry.npmjs.org`), isolated database-test blocker, remote-branch/source divergence, current canonical solution repository layout, GitHub App setup values, and outstanding user approvals in `VERIFICATION_HANDOFF_2026-10-16.md`.
- No source push, Render resource creation/deployment, hosted database operation, GitHub App registration, or live submission/commit was performed.
- Flagged two `DROP TABLE IF EXISTS` statements in the 2026-10-12 migration; the proposed removal is documented but not applied pending approval and confirmation that the migration has not already been applied.

## Continuation — 2026-10-19

- Preserved the legacy pairing-code and verification-challenge tables by removing the two unnecessary `DROP TABLE` statements from the local migration. Confirm the target migration history and recovery plan before applying it anywhere.
- Added a regression check that GitHub App mode does not request classic OAuth's broad `public_repo` scope. Updated the deployment runbook with the narrower `Repository creation: write` permission and corrected it to keep migrations separate from service startup.
- Full local CI passed lint, type checks, 46 backend tests, 24 frontend/extension tests, production builds, and formatting. All 6 database integration tests passed against a disposable PostgreSQL container. The backend and frontend Docker images built successfully, and the CI workflow now supplies its required production API URL. A fresh dependency audit completed with zero reported vulnerabilities.
- Render client-IP handling is now explicitly configured: trust the validated Cloudflare `CF-Connecting-IP` header only on Render, ignore malformed values, and bound the per-process rate-limit map. New regression tests cover the trusted header and bucket cap; the current single-instance limit remains documented.
- The Privacy Policy and Terms drafts now use the user-provided operator name, support email, and India jurisdiction; they remain visibly marked as drafts pending retention/provider details and legal review.
- Full CI passes with 50 backend tests and 24 frontend/extension tests. The local Docker dashboard/API/worker stack is running and the API health endpoint responds successfully.

# Changelog

## Review branch update — 2026-10-19

- The Render Blueprint now generates the session secret itself, removing one
  manually supplied secret while keeping it private in Render.
- Published the tested source and release documentation to
  `codex/release-readiness-2026-10-19`; no merge or deployment was performed.
- GitHub Actions run 39272475499 passed, including disposable PostgreSQL tests
  and production container builds.
- The local Docker engine could not be reached in this pass. Local `npm run ci`
  passed all 50 backend and 24 frontend/extension tests, lint, type checks,
  production builds, and format checks.

## Unreleased — 2026-10-11

- Bumped the extension to 0.1.5 for the Render same-origin deployment and popup routing fix.
- Restrict extension dashboard messages and API requests to origins declared by its manifest; add regression tests for rejected API origins and first-install dashboard routing.
- Provision exactly one canonical solution repository only after both GitHub and LeetCode are connected; stop on name conflicts instead of making suffixed repositories.
- Keep each problem under `solutions/<number>-<slug>/` with its code and one concise README; stop generating a root README index on every sync.
- Removed the public-profile verification and manual extension-code setup paths.
- Added browser-only detection of the signed-in LeetCode username and capture of Accepted submission data.
- Added silent dashboard-to-extension token handshake, heartbeat, mismatch reporting, and offline retry buffer.
- Added automatic public solution-repository creation/reuse, default-branch Git commits with submission timestamps and GitHub noreply attribution, plus one concise README beside each problem's solution.
- Persisted LeetCode username and browser timezone; added submission runtime, memory, and topic tags to the database.
- Added automatic setup migration, dashboard loading state, live counts/history, retry controls, disconnect/delete actions, and responsive layout.
- Added scope, CORS, extension payload, timestamp, authentication boundary, and database idempotency checks.
- Hardened submission capture so page-world signals contain only a candidate ID and the extension worker independently verifies the signed-in account, newest Accepted result, source, and question metadata.
- Prevented delayed retries from overwriting a newer solution, serialized extension queue changes to avoid dropping captured work, retained buffered submissions on account mismatch, and added confirmed queue discard in the extension popup.
- Validate that the canonical repository is public and writable before reporting setup success, and scope authenticated route throttles per account behind shared reverse proxies.
- Added adversarial extension-input tests, dependency auditing in CI, and minimal generated-client setup for clean checkouts.
- Updated setup and security documentation to match the current extension trust boundary and dependency audit results.
- Accept capture signals while LeetCode remains on the ordinary problem page, and require an exact ID match when a submission-detail URL is open.
