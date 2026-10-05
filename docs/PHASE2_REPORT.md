# Phase 2 Report — GitHub Authentication and Identity

## Built

- GitHub OAuth web-application flow with random `state` validation through a short-lived HttpOnly SameSite cookie.
- Server-side authorization-code exchange and authenticated-user revalidation through GitHub's `/user` API.
- Database-backed sessions with SHA-256 hashed session tokens, revocation, and 30-day expiry.
- HttpOnly + SameSite session cookie; `Secure` is enabled automatically in production.
- CSRF cookie + `X-CSRF-Token` validation for authenticated state-changing requests such as logout.
- AES-256-GCM encryption for GitHub access and refresh tokens at rest.
- `/api/me` reads identity only from the authenticated session; no client-supplied `user_id` is accepted.
- GitHub identity is keyed by GitHub's numeric `id` and protected by the existing database `UNIQUE` constraint.
- Access-token refresh helper for expiring GitHub OAuth tokens, including refresh-token rotation when GitHub returns a replacement token.
- Automated database integration test proving the same GitHub identity cannot be inserted into two users.

## Manual verification required

A real interactive GitHub login/logout test must be performed with the registered OAuth application's credentials. Secrets stay only in local/hosted secret stores.

## Exit status

PENDING real GitHub browser verification and the CI run for this phase.
