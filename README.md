# LeetSync

Foundation for a persistent LeetCode → GitHub synchronization product.

## Phase 1

This phase establishes the monorepo, TypeScript toolchain, PostgreSQL database, Prisma migration, API and worker entrypoints, shared Zod package, Docker Compose stack, lint/format/test tooling, and CI.

### Start the stack

```bash
cp .env.example .env
npm install

docker compose up --build
```

API health: `http://localhost:3000/health`

Expected response:

```json
{ "status": "ok", "service": "leetsync-api", "version": "0.1.0" }
```

### Run checks (from the repository root)

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run format:check
```

Phase 0 evidence is documented in `docs/SPIKE_FINDINGS.md`. Architecture choices are in `docs/DECISIONS.md`; assumptions and limitations are in `docs/LIMITATIONS.md`.
