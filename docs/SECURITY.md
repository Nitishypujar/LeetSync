# Security posture

LeetSync handles GitHub authorization tokens and accepted solution source code, so its security relies on several independent layers. No web service or browser extension can be guaranteed unbreachable; this document records the controls in place and the remaining release gates.

## Implemented controls

- GitHub OAuth uses browser-bound, one-time state. Dashboard state changes require a CSRF token and an allowed browser origin.
- Session and extension credentials are stored as hashes. GitHub OAuth credentials are encrypted at rest.
- API responses are marked `no-store`; request bodies are size-limited and sensitive routes are rate-limited.
- Production startup rejects HTTP or localhost dashboard/OAuth callback URLs and common sample placeholders for session, encryption, and GitHub credentials. Local development URLs remain valid outside production.
- The dashboard image generates its Content Security Policy from the configured API origin. Standalone/public builds reject localhost API targets by default; local Compose opts in explicitly.
- The dashboard sets a restrictive Content Security Policy and browser security headers. The API uses Helmet security headers.
- The extension requests only `storage` and `alarms`, restricts its API and dashboard hosts, and validates LeetCode account identity before submission ingestion. It captures from a problem page after Accepted; when on a submission-detail route, the route ID must match the candidate.
- The API and worker run as a non-root user with a read-only container filesystem, dropped Linux capabilities, and `no-new-privileges`. The runtime image omits development dependencies and the Prisma command-line tool.
- `npm audit` currently reports no known advisories. CI checks the dependency tree on each run. A root npm override pins Prisma CLI's `deepmerge-ts` dependency to the patched 8.x line until Prisma updates its exact pin; validate Prisma generation and migrations when refreshing Prisma.
- Local Compose ports bind to loopback, so the dashboard, API, and database are not exposed to the LAN by default.
- Disconnecting LeetCode removes its link and revokes the browser extension token. Disconnecting GitHub revokes the OAuth authorization. Both dashboard actions show a confirmation and preserve existing history and GitHub commits.
- The page-world hook relays only a candidate submission ID. The isolated extension worker independently checks the signed-in account, confirms that the ID belongs to that account's Accepted-submission list, and fetches code and metadata directly from LeetCode. It never accepts source code, status, or account identity from page messages. Candidate checks are rate-limited; a result-detail URL must match the candidate ID, while signals from a normal problem page are independently verified against LeetCode's newest Accepted submission.
- The extension heartbeat can report a detected LeetCode username and can deactivate a link on mismatch, but it cannot activate a pending link. Activation requires a matching heartbeat followed by completion of the dashboard-initiated pairing with its one-time token, authenticated session, and CSRF token. This prevents possession of an extension bearer token alone from activating a pending account link.

## Trust boundary in submission capture

The page-world capture hook and `window.postMessage` bridge are not trusted to authenticate a submission. A script running on the LeetCode page can forge a candidate ID, but it cannot supply the source code or Accepted status used by LeetSync. The extension worker independently calls LeetCode with the browser's existing session, confirms that the active account is signed in and that the candidate is the newest entry in that account's recent Accepted-submission list, then fetches the source and question metadata itself. Candidates that do not pass those checks are not sent to the API. Capture signals may originate from a LeetCode problem page; if the user is on a submission-detail route, its ID must match. This relies on LeetCode's current GraphQL endpoints and intentionally prevents page messages from triggering imports of older accepted solutions; endpoint changes require updating the verifier. This architecture prevents page-message forgery from inventing code or marking an arbitrary user's submission as Accepted, but it cannot defend against a compromised browser, extension worker, LeetCode account, or LeetCode service.

The extension bearer token is a capability for the linked account: someone who extracts it can call the API with a valid-shaped fake Accepted payload, because LeetCode does not provide a server-verifiable receipt. A valid token is also allowed to enqueue work that can write to the selected repository. The browser stores this token in extension-local storage, the API stores only its hash, and users can revoke it by disconnecting the browser or LeetCode account. GitHub App mode limits sync tokens to the selected repository, reducing the impact of credential compromise, but does not make the submission itself independently verifiable. The App mode still needs live registration and installation verification before production use.

## Required before a public multi-user release

- Configure and live-test GitHub App mode before release. App mode omits the classic `public_repo` OAuth scope and requests `Repository creation: write` plus `Metadata: read-only` for user authorization. Its installation grants `Contents: write` only to the canonical repository. Default local OAuth mode still requests `public_repo`; revoke any existing broader OAuth grants after App verification.
- Put the public service behind HTTPS with HSTS at the TLS termination point, set production-only origins and cookies, and use managed secret storage. The included Compose stack is a local-development setup, not a public deployment configuration.
- Review the dependency audit and maintain automated dependency and container-image updates. Development/build dependencies are not installed in the API and worker runtime images.
- The rate limiter uses `CF-Connecting-IP` only when `TRUST_CF_CONNECTING_IP=true`; the Render Blueprint sets this because Render says its Cloudflare edge overwrites that header. It ignores malformed values, defaults to the socket address elsewhere, and bounds per-process buckets. Keep one API instance until limits use shared storage. Do not trust caller-controlled `X-Forwarded-For` for client identity.
- Use a shared rate-limit store and operational monitoring before horizontally scaling beyond a single API process.

Security testing reduces risk but cannot prove the site or extension is immune to every vulnerability.
