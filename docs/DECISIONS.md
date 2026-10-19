# LeetSync decisions

## Application structure

- PostgreSQL and Prisma store users, sessions, linked accounts, submissions, jobs, and job events. The API and worker run separately and share the database-backed queue.
- The React dashboard reads the authenticated workspace from the API on mount and polls it for status updates. Browser state is not the source of truth.
- The extension is Manifest V3 with a main-world LeetCode response hook and an isolated content-script bridge.

## Account linking and security

- GitHub OAuth is the only sign-in method. OAuth state is browser-bound, sessions are 30-day HttpOnly SameSite cookies, and state-changing cookie requests require CSRF validation.
- Local development defaults to classic GitHub OAuth with `public_repo`; production is intended to use GitHub App user authorization plus a repository-scoped installation token. Provider tokens are encrypted at rest with AES-256-GCM and never returned to the dashboard.
- The isolated extension worker reads the LeetCode account using the browser's existing session. The page-world hook relays only a candidate submission ID; after independently verifying the account and newest Accepted result, the worker fetches and sends the source. LeetCode passwords, cookies, and session tokens are never sent to the API.
- The extension token is random, per user, stored as a hash, and revocable. Dashboard-to-extension token delivery uses external messaging restricted to configured origins and a short-lived dashboard-authenticated handshake.
- API CORS is allowlisted to the dashboard origin and the one configured extension ID. Cookie-authenticated writes use CSRF protection; extension writes require a bearer token. Inputs are schema-validated and rate-limited.

## Automatic setup and commit behavior

- After both GitHub and verified LeetCode connections exist, setup creates or reuses exactly one public `leetcode-solutions` repository. A name conflict stops setup rather than creating a suffixed second repository.
- The page hook reports only a candidate ID. The extension worker checks the signed-in account and newest Accepted result and fetches solution details from LeetCode; the server authenticates the extension and validates the payload but cannot independently verify it with LeetCode.
- The queue deduplicates by submission ID and survives restarts in PostgreSQL. The worker retries with exponential backoff and writes one Git commit to the repository's default branch.
- Commit author and committer use the GitHub display name (or login) and `<numeric-id>+<login>@users.noreply.github.com`. The timestamp is the submission instant formatted with the user's saved browser timezone.
- Each accepted submission updates its stable `solutions/<number>-<slug>/solution.<ext>` and single concise per-problem README paths. Sync does not generate or rewrite a root README index.

## Operations

- Docker Compose runs PostgreSQL, API, worker, and dashboard. API and worker apply Prisma migrations before starting.
- The in-process rate limiter is adequate for the single API service. Multiple instances need a shared limiter.
