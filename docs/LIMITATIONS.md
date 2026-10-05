# LeetSync Limitations

## Verified integration limitations

- **UNOFFICIAL:** LeetCode integration is based on observed browser traffic and is not an official public API integration.
- LeetCode can change its frontend/request formats, so the adapter must remain isolated.
- Browser-side real-time detection depends on the extension observing the LeetCode session.

## Phase 1 assumptions

- ASSUMPTION: Development and CI use Node.js 20+.
- ASSUMPTION: Docker Compose is available for the reproducible container stack and CI. The developer laptop used for local development is Windows 8.1 32-bit and cannot run the Docker/Prisma migration stack locally.
- GitHub OAuth credentials are supplied later and are never committed.

## Out of scope for Phase 1

Authentication, OAuth, LeetCode verification, extension pairing, repository selection, synchronization jobs, dashboard UI, and deployment are later phases.

## Phase 2 limitations

- Real GitHub OAuth verification requires the registered OAuth app credentials and an interactive browser login; CI uses placeholders and never performs a real provider login.
- The current OAuth scope is `public_repo`; private repository support is deliberately not enabled in Phase 2.
- Session persistence is database-backed, but the production cookie must be served over HTTPS so Secure cookies are always enabled.
