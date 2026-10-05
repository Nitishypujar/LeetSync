# LeetSync Limitations

## Verified integration limitations

- **UNOFFICIAL:** LeetCode integration is based on observed browser traffic and is not an official public API integration.
- LeetCode can change its frontend/request formats, so the adapter must remain isolated.
- Browser-side real-time detection depends on the extension observing the LeetCode session.

## Phase 1 assumptions

- ASSUMPTION: Development and CI use Node.js 20+.
- ASSUMPTION: Docker Compose is available for the local stack.
- GitHub OAuth credentials are supplied later and are never committed.

## Out of scope for Phase 1

Authentication, OAuth, LeetCode verification, extension pairing, repository selection, synchronization jobs, dashboard UI, and deployment are later phases.
