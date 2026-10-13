# Security posture

LeetSync handles GitHub authorization tokens and accepted solution source code, so its security relies on several independent layers. No web service or browser extension can be guaranteed unbreachable; this document records the controls in place and the remaining release gates.

## Implemented controls

- GitHub OAuth uses browser-bound, one-time state. Dashboard state changes require a CSRF token and an allowed browser origin.
- Session and extension credentials are stored as hashes. GitHub OAuth credentials are encrypted at rest.
- API responses are marked `no-store`; request bodies are size-limited and sensitive routes are rate-limited.
- The dashboard sets a restrictive Content Security Policy and browser security headers. The API uses Helmet security headers.
- The extension requests only `storage` and `alarms`, restricts its API and dashboard hosts, and validates LeetCode account identity before submission ingestion. It captures from a problem page after Accepted; when on a submission-detail route, the route ID must match the candidate.
- The API and worker run as a non-root user with a read-only container filesystem, dropped Linux capabilities, and `no-new-privileges`. The runtime image omits development dependencies and the Prisma command-line tool.
- `npm audit` currently reports no known advisories. CI checks the dependency tree on each run. A root npm override pins Prisma CLI's `deepmerge-ts` dependency to the patched 8.x line until Prisma updates its exact pin; validate Prisma generation and migrations when refreshing Prisma.
- Local Compose ports bind to loopback, so the dashboard, API, and database are not exposed to the LAN by default.
- Disconnecting LeetCode removes its link and revokes the browser extension token. Disconnecting GitHub revokes the OAuth authorization. Both dashboard actions show a confirmation and preserve existing history and GitHub commits.
- The page-world hook relays only a candidate submission ID. The isolated extension worker independently checks the signed-in account, confirms that the ID belongs to that account's Accepted-submission list, and fetches code and metadata directly from LeetCode. It never accepts source code, status, or account identity from page messages. Candidate checks are rate-limited; a result-detail URL must match the candidate ID, while signals from a normal problem page are independently verified against LeetCode's newest Accepted submission.

## Trust boundary in submission capture

The page-world capture hook and `window.postMessage` bridge are not trusted to authenticate a submission. A script running on the LeetCode page can forge a candidate ID, but it cannot supply the source code or Accepted status used by LeetSync. The extension worker independently calls LeetCode with the browser's existing session, confirms that the active account is signed in and that the candidate is the newest entry in that account's recent Accepted-submission list, then fetches the source and question metadata itself. Candidates that do not pass those checks are not sent to the API. Capture signals may originate from a LeetCode problem page; if the user is on a submission-detail route, its ID must match. This relies on LeetCode's current GraphQL endpoints and intentionally prevents page messages from triggering imports of older accepted solutions; endpoint changes require updating the verifier. This architecture prevents page-message forgery from inventing code or marking an arbitrary user's submission as Accepted, but it cannot defend against a compromised browser, extension worker, LeetCode account, or LeetCode service.

The extension bearer token is a capability for the linked account: someone who extracts it can call the API with a valid-shaped fake Accepted payload, because LeetCode does not provide a server-verifiable receipt. A valid token is also allowed to enqueue work that can write to the selected repository. The browser stores this token in extension-local storage, the API stores only its hash, and users can revoke it by disconnecting the browser or LeetCode account. A GitHub App limited to the selected repository would reduce the impact of credential compromise but would not make the submission itself independently verifiable.

## Required before a public multi-user release

- Replace classic GitHub OAuth with a GitHub App installation limited to the selected repository and Contents permission. New OAuth authorizations request only `public_repo`, but an existing authorization granted the older `repo` scope remains broad until it is revoked and reauthorized; OAuth still grants access across all public repositories, rather than only the selected repository.
- Put the public service behind HTTPS with HSTS at the TLS termination point, set production-only origins and cookies, and use managed secret storage. The included Compose stack is a local-development setup, not a public deployment configuration.
- Review the dependency audit and maintain automated dependency and container-image updates. Development/build dependencies are not installed in the API and worker runtime images.
- Use a shared rate-limit store and operational monitoring before horizontally scaling beyond a single API process.

Security testing reduces risk but cannot prove the site or extension is immune to every vulnerability.
