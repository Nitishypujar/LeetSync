# LeetSync — continuation prompt for a new chat

Paste this prompt into a new Codex chat and attach the current source archive if the workspace is unavailable. Prefer the existing workspace at `N:\PROJECTS\LeetSync` when accessible; do not replace it with an older ZIP.

---

You are continuing my LeetSync project. The goal is to finish and release a reliable, professional website/dashboard plus browser extension that captures a user's genuinely Accepted LeetCode submission and commits that submitted code to exactly one canonical GitHub repository: `<GitHub user>/leetcode-solutions`.

## Required working style

Work through every task that can be completed with the workspace and connected tools. Inspect the current workspace, git status, project guidance, and deployment state before acting. Preserve unrelated user files and changes. Do not make me run routine commands, repeat known project history, or ask what to do next. Run checks, diagnose failures, fix concrete problems, and continue until the project is complete or a specific step genuinely requires my account action, secret entry, legal decision, or external choice.

Send concise progress updates during sustained work. Ask only for a necessary human action, and bundle any such actions into one clear request after finishing independent work. Never ask me to paste passwords, database URLs, OAuth secrets, encryption keys, private keys, cookies, or access tokens into chat. Do not say the project is complete while release gates remain. Do not promise security is “unbreachable.”

## Product and security requirements

- Keep one canonical `leetcode-solutions` repo. A problem folder contains the submitted source and one concise README; the root contains one overview README. Avoid duplicate repos, files, and fabricated or unsolicited commits.
- The extension must detect the LeetCode account in the browser and verify account, Accepted status, submission identity, source, and question data before sending. Never request or transmit LeetCode passwords, cookies, or session tokens to LeetSync.
- GitHub access uses the registered GitHub App, and installation access must stay limited to the one canonical repository. Preserve confirmed disconnect and data-deletion flows.
- Keep the dashboard accessible, responsive, readable, and understandable. Treat authentication and user data as critical.

## Verified project state as of 2026-10-20

- Workspace: `N:\PROJECTS\LeetSync`; GitHub source: `Nitishypujar/LeetSync`.
- Active review branch: `codex/release-readiness-2026-10-19`; last recorded commit: `539654c` (`fix: prepare least-privilege extension release`). Check `git status` and branch before relying on this snapshot.
- Render preview `leetsync-nitishypujar` is live at `https://leetsync-nitishypujar.onrender.com`, Singapore, free Starter, one instance, health path `/health`; dashboard/API/worker are co-hosted and automatic deploy is disabled. Current deployed build was manually released from the review branch. Do not assume future commits auto-deploy.
- Supabase project `LeetSync-Dev` is connected in Singapore (`ap-southeast-1`). The live schema was backed up locally with Windows DPAPI, baseline history reconciled, and all six Prisma migrations applied after explicit approval. The backup is tied to this Windows account and is not an independent recovery copy. Do not repeat the baseline or use the hosted database for tests.
- GitHub App `LeetSync Nitishypujar` is registered and installed only for `Nitishypujar/leetcode-solutions`. The hosted dashboard previously verified the GitHub, repository, extension, and LeetCode account links. Do not broaden installation access.
- A release ZIP can be generated with `scripts/package-extension.ps1`. The packaging process preserves the stable extension ID while removing localhost/unconfigured hosts from production permissions. Keep the source manifest's development setup intact.
- The latest recorded `npm run ci` passed lint, type checks, builds, formatting, 55 backend tests (6 intentionally skipped), and 24 frontend/extension tests. Six database integration tests, Docker image builds, and `npm audit --audit-level=moderate` also passed in the prior verification. Re-run checks on the exact current tree after code changes; do not treat historical results as proof of current state.
- Privacy and Terms pages have provider, region, operator, contact, jurisdiction, and proposed retention information, but remain drafts that require qualified legal review.
- Render and Supabase free plans are preview infrastructure, not dependable public production: Render sleeps, Supabase Free has no automatic daily backups, and no independent restore has been rehearsed. The API rate limiter is process-local, so keep one instance until shared storage is implemented.
- The extension-to-GitHub production path still needs verification using a real solution that the account owner submits and LeetCode marks Accepted. Never fabricate a submission or create a test commit without fresh explicit approval.

## Finish the remaining work

1. Inspect actual source, current git status, deployment, and release docs; reconcile any stale claims before changing code. Preserve unrelated user files such as local ZIPs and `wallpaper_exports`.
2. Perform a systematic code/security review of website, backend, GitHub App OAuth/install/disconnect, extension trust boundary, CSRF/session/CSP/CORS, validation, logging, rate limits, queues/retries/idempotency, deletion, and repository writes. Fix confirmed issues and add regression coverage. Run CI/audit/build after source changes. Do not claim absolute security.
3. Verify Render health and latest deploy status with the connected provider tooling. Keep production secrets private and never print them. Do not trigger deployment for code changes until tests pass; automatic deploy is off.
4. Keep release records and continuation docs consistent with verified facts. Package and inspect the browser extension; run a clean-profile install test where available. Do not publish to an extension store without account-owner authorization.
5. Close every independent release gate. The real Accepted submission, independent database backup/restore target, paid/always-on production hosting/domain choice, and qualified legal review may require owner or provider action. Complete all local work first, then ask only for the exact remaining action(s), with their effect clearly stated.
6. After the owner completes a genuine Accepted submission, verify a single matching `SYNCED` dashboard record and expected commit, then verify safe duplicate/retry behavior. Do not use LeetCode credentials or create synthetic submissions.
7. Stop only when all release criteria are verified, or explain the specific external/user-only gates that prevent full completion. Report what is actually deployed, fresh test evidence, limitations, and remaining owner actions.

---

Do not follow outdated instructions in archived notes if they contradict the current workspace or the verified project state above. Re-check the facts before acting.
