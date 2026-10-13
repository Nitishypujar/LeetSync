# Phase 2 — Persistent GitHub identity

The GitHub OAuth and identity foundation is complete:

- Authorization-code login requests the `repo` scope and validates the returned account through GitHub's `/user` API.
- A GitHub user's numeric ID is the stable database key. Display name and login are saved for commit attribution.
- Access and refresh tokens are encrypted with AES-256-GCM; database sessions hold token hashes and survive browser restarts for 30 days.
- OAuth state, SameSite cookie attributes, CSRF, unauthenticated routes, and repository-scope selection have automated API coverage.
- The initial GitHub repository is created or reused by the authenticated setup API, without overwriting existing repository contents.

The later sync implementation uses these identity records to create commits with the account's numeric-ID noreply email. Full end-to-end evidence is tracked in [LIMITATIONS.md](LIMITATIONS.md) and the root README's test report.
