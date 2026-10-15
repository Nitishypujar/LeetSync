# Release status and completion pass

This note records the completion pass for LeetSync, what it changed, what was verified, and what still requires your accounts, a decision, or a real-world test. It does not claim that the project is ready for public release.

## Changed in this pass

- Dashboard favicon (`frontend/public/favicon.svg`) linked from `frontend/index.html`.
- Draft Privacy Policy and Terms of Service pages at `/privacy` and `/terms` (`frontend/src/LegalPages.tsx`, routed in `frontend/src/main.tsx`). Both are marked DRAFT and contain bracketed placeholders for the contact address, hosting providers, region, governing law, and retention periods. They must be reviewed and completed before publishing.
- Footer links to Privacy and Terms in the dashboard (`frontend/src/App.tsx`).
- Styles for the legal pages (`frontend/src/styles.css`).
- This document.

No backend, database schema, extension, or worker behavior was changed in this pass. Nothing in the existing pairing, sync, or GitHub flow was altered, so the previously passing CI baseline should still apply.

## Verified in the completion sandbox

- TypeScript typecheck passes for `shared`, `backend`, and `frontend`.
- Extension tests pass (17 of 17): `node --test extension/tests/*.mjs`.
- ESLint and Prettier pass on the changed TypeScript files.

## Not verified in the sandbox (run these on your machine)

The sandbox has no network access and `node_modules` was installed on Windows, so these could not run here:

- Prisma client generation and engine download (`npm run db:generate`).
- The backend Vitest suite (`npm run test -w backend`).
- Database integration tests (`npm run test:db`) and migrations.
- The Vite production build (`npm run build -w frontend`) and the Docker image builds.

Run `npm run ci` on your machine to cover all of these.

## Required before any public release

These items need your accounts, a decision, or a real-world test. None can be completed by code alone.

1. **Rotate credentials now.** The uploaded archive contained live-looking secrets in `.env` and `backend/.env`: the GitHub OAuth client secret, session secret, token encryption key and database password. Rotate all of them. If you change `TOKEN_ENCRYPTION_KEY`, existing encrypted GitHub tokens become unreadable and each user must reconnect GitHub. Never commit `.env` files.
2. **Database target.** `backend/.env` points at a Supabase pooler, while the root `.env` used by Docker Compose points at the local `postgres` container. `npm run dev:api`, `npm run db:deploy` and `npm run test:db` read `backend/.env`, so they act on the Supabase database. Use Docker Compose for local work, and never run test or migration commands against a database holding real data.
3. **LeetCode ownership design (decision needed).** The heartbeat marks a connection `ACTIVE` when the username string reported by the extension token matches the saved username. A stolen extension token can therefore activate a connection by itself. Two options:
   - *Option A, no page change (recommended given your preference against profile challenges):* Activation happens only through the dashboard-initiated pairing (`handshake/complete`, which requires a session and CSRF token), and the heartbeat may only deactivate a connection, never activate it. A stolen extension token then cannot activate a pending link alone. Residual risk: a stolen token can still submit payloads for an already-active link, as documented in `SECURITY.md`.
   - *Option B, profile challenge:* Stronger proof of account control, but you have said you dislike this approach.
   Choose one, then add the regression tests listed in `docs/SECURITY.md`.
4. **GitHub App.** Replace the broad `public_repo` OAuth scope with a GitHub App installation limited to the selected repository and Contents permission. This needs an app registered in your GitHub account.
5. **Real LeetCode capture test.** Submit a real Accepted solution with the current extension and confirm the commit, the dashboard link, and the duplicate/retry behaviour. This is the single most important unverified item.
6. **Production deployment.** Choose hosting, configure HTTPS and HSTS at the TLS terminator, production origins and secure cookies, managed secrets, backups with a restore test, monitoring, and a shared rate-limit store before running more than one API instance.
7. **Launch items.** Connect the custom domain, confirm the favicon on the deployed domain, have the legal pages reviewed and completed, and test the full journey on the live domain.

## Optional, after release

- Historical backfill of earlier accepted submissions.
- Chrome Web Store listing and update process.
- Broader browser end-to-end automation.
