# LeetSync Decisions

## Phase 1 — Foundation

### Prisma

Use Prisma for PostgreSQL access and versioned migrations because the project needs typed relational access and migration history.

### npm workspaces

Use npm workspaces for the initial `backend` and `shared` TypeScript packages. The repository keeps `frontend`, `extension`, and `tests` boundaries ready for subsequent phases without adding out-of-scope features.

### PostgreSQL-only queue

No Redis in v1. The specification explicitly selects a PostgreSQL `sync_jobs` queue with row locking.

### Separate API and worker processes

The API and worker live in the same backend package but have distinct entrypoints, matching the target architecture.

### Build shared package before backend

The backend imports `@leetsync/shared` through the package's built `dist` exports. Root scripts therefore build `shared` before backend type-check/test/build/dev commands so a clean clone works consistently.

### Root-level lint

Run ESLint from the repository root rather than relying on workspace-local PATH resolution. This avoids an npm 8 Windows workspace binary-resolution issue observed during Phase 1 validation.

## Phase 2 — GitHub authentication

### GitHub OAuth over email/password

GitHub OAuth is the sole login mechanism. The backend validates OAuth state, exchanges the authorization code server-side, and revalidates the authenticated GitHub identity through the `/user` API.

### Database-backed sessions

Sessions are stored as SHA-256 hashes of high-entropy random tokens. The raw token exists only in the HttpOnly session cookie. This supports explicit revocation and persistent login state without exposing session identifiers in the database.

### Token encryption

GitHub access and refresh tokens are encrypted with AES-256-GCM using a 32-byte key supplied through environment configuration. Plaintext tokens are never returned to the frontend.

### CSRF

OAuth uses the OAuth `state` parameter plus a SameSite cookie. Authenticated POST requests such as logout use a separate double-submit CSRF token.

### GitHub scope

The OAuth request uses `public_repo`, which is sufficient for the planned public LeetCode solutions repository. Private-repository support can justify broader scope later.
