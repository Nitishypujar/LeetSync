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
