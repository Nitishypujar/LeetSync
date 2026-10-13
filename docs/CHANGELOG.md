# Changelog

## Unreleased — 2026-10-11

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
