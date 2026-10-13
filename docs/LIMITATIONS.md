# Current limitations and verification gaps

## LeetCode integration

- LeetSync observes LeetCode's browser traffic because LeetCode does not provide a supported public API for this integration. The extension must be updated if those page requests change.
- The extension worker verifies the signed-in account and newest Accepted submission through LeetCode's current GraphQL endpoints, then fetches the source directly. The backend authenticates the extension token and validates the payload shape/account match, but LeetCode does not provide a server-verifiable signature for the browser result. A compromised browser, extension, or LeetCode account can therefore still submit forged data. LeetSync never receives or stores LeetCode cookies, passwords, or session tokens.
- The extension token is a bearer capability. If extracted from the browser profile, it can be used to send valid-shaped fake submissions that the worker may commit to the selected repo; the server cannot independently prove the LeetCode result. Revoke the browser pairing after losing access to a device.
- The extension detects the active username from LeetCode's page and waits for it to match the dashboard account before enabling sync.

## Browser and provider checks

- Unit and API tests cover GitHub OAuth state handling, repository provisioning, commit construction, and extension payload validation.
- GitHub OAuth, public repository provisioning, and a representative worker-to-GitHub commit were verified against the connected account. The commit used a clearly labeled synthetic fixture. A real LeetCode Accepted capture with the current extension version still needs a fresh check: the Edge browser is available, but its internal extension page could not be inspected during the latest verification, and no new Accepted submission was made.
- Historical submission backfill and pagination are not implemented.

## Database and deployment

- Database integration tests use a disposable PostgreSQL database and are skipped unless `RUN_DB_TESTS=true`. CI applies the Prisma migrations to a disposable PostgreSQL service before running them.
- The app uses an in-process rate limiter. A multi-instance deployment needs a shared limiter or equivalent edge protection.
- The supplied migration removes obsolete challenge and pairing-code tables. Apply migrations through the documented deployment process before starting a release against an existing database.
- Docker Compose keeps PostgreSQL data in its named volume. Do not remove that volume when updating the application.

## Dependency audit

- On 2026-10-12, `npm audit --audit-level=moderate` completed with zero known advisories. CI repeats this check. A root npm override pins Prisma CLI's `deepmerge-ts` dependency to the patched 8.x line; Prisma client generation, production builds, and migrations must be checked again whenever Prisma or the lockfile is updated. A clean audit describes known advisories at that date and is not a guarantee against future or undisclosed issues.

## Credential handling

Configured `.env` files are local-only and are not included in source control. Rotate any active database password, GitHub OAuth secret, session secret, and token encryption key before sharing an archive that may have contained those files.

## GitHub permission scope

- New GitHub OAuth authorizations request `public_repo`, which can read and write all public repositories available to the authorizing account but does not request private-repository access. Existing authorizations that were granted `repo` retain that broader permission until the user revokes and reconnects. Before a public multi-user release, migrate to a GitHub App with access limited to the selected repository and contents permission only.
