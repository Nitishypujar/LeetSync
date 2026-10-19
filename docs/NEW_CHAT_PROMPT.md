# LeetSync — continuation prompt for a new chat

Paste the prompt below into a new Codex chat and attach the latest
`LeetSync-source-handoff-*.zip` archive.

---

You are continuing my LeetSync project. The attached ZIP contains the current
source tree, uncommitted changes, and project handoff notes. Start by inspecting
the files and reading `docs/NEXT_CHAT_HANDOFF.md`, `docs/RELEASE_STATUS.md`,
`docs/PRODUCTION_DEPLOYMENT.md`, `docs/SECURITY.md`, and this prompt. If the
original project workspace is available, inspect its status before changing
anything. Preserve the supplied work; never reset, overwrite, or discard it.

## Product goal

Finish LeetSync as a reliable, professional website/dashboard plus browser
extension that automatically captures a user's genuinely Accepted LeetCode
submission and commits the submitted code to exactly one canonical GitHub
repository: `<GitHub user>/leetcode-solutions`.

The repository should stay clean: one root overview README, then one folder per
problem under `solutions/`, with the submitted source and one concise README in
that problem folder. Do not create duplicate repositories, duplicate solution
files, multiple READMEs per problem, fabricated submissions, or unsolicited
commits. Reuse the canonical repository when it exists and stop safely on a
name/ownership conflict.

Treat website and extension authentication as critical. LeetCode identity must
be detected in the user's browser; never request or transmit LeetCode passwords,
cookies, or session tokens to LeetSync. The extension must independently check
the signed-in account, Accepted status, submission identity, and source before
sending. GitHub access should use the selected GitHub App design with the
narrowest practical permissions and installation access limited to the one
canonical repository. Provide deliberate, confirmed disconnect and data-delete
flows. Do not promise “unbreachable”; identify real limits accurately.

The website should feel like a polished, professional product: clear
connection/setup status, useful sync history, readable typography and contrast,
responsive layout, accessible controls, and understandable errors. Preserve the
current product direction and improve real usability rather than adding flashy
but unnecessary UI.

## How to work with me

Be an active engineering collaborator. Do the work yourself wherever tools and
available access allow: inspect files, edit code, run PowerShell/CLI commands,
build, test, review output, and fix issues. Do not make me perform routine
terminal work, copy commands, relay logs, repeat project history, or ask what to
do next. Do not stop after writing a plan or after the first milestone.

Keep working through all independent tasks. Give brief progress updates while
long tasks run. Ask me only when my intervention is truly necessary, such as
provider authentication/MFA, entering a secret in a provider's private secret
store, supplying legal/business facts, or approving an external action that has
not already been authorized. Finish the concrete local work first; then ask one
concise, bundled question with the exact action and impact. Do not interrupt
repeatedly for small choices. After I answer, resume the work without making me
restate the goal.

Never ask me to paste passwords, OAuth secrets, database URLs, session secrets,
encryption keys, private keys, browser cookies, or access tokens into chat.
Never include such values in logs, documentation, source control, screenshots,
or ZIP archives. If I must enter one, direct me to the exact provider secret
field and let me enter it privately.

## Current project context

- Source repository: `Nitishypujar/LeetSync`; working branch at handoff:
  `integration/assistant-updates-2026-10-13`. The working tree has extensive
  uncommitted changes. Preserve them.
- Hosting choice researched for a free preview: Render for the web service and
  the existing Supabase project for PostgreSQL. The Render blueprint is in
  `render.yaml`; automatic deploy is disabled. A free preview may sleep and
  does not have dependable production backup/availability guarantees. Do not
  call it a dependable public production service.
- GitHub App mode is implemented but still needs registration and live
  verification after the public callback URL is fixed. The expected Render host
  is `https://leetsync-nitishypujar.onrender.com`; verify the actual assigned
  host and update callback, dashboard/API origins, and extension allowlists if
  it differs.
- Extension version is 0.1.5. Same-origin dashboard pairing passes its real
  origin to the extension; the extension checks message/API origins against
  manifest allowlists. Popup routing and the Render preview origin have
  regression coverage.
- The GitHub OAuth secret and Supabase database password were reported rotated
  by me. The session secret and token-encryption key still need safe rotation.
  The encryption-key change requires the documented two-key resumable
  migration to preserve existing encrypted GitHub tokens.
- Latest full CI on 2026-10-19 passed lint,
  type checks, builds, formatting, 50 backend tests, and 24 frontend/extension
  tests. A fresh `npm audit --audit-level=moderate` reported zero vulnerabilities.
  All six database integration tests separately passed against a disposable
  local PostgreSQL 16 container. Both production Docker images built. Docker
  Desktop required elevated local engine access; the test database container
  was removed after testing. Never use hosted Supabase for fixtures or tests.
  Re-run full CI on the exact tree you receive and report fresh results.
- The user previously authorized the LeetSync OAuth flow and creating/testing
  `leetcode-solutions`. That does not authorize pushing the LeetSync application
  source, creating a Render service, registering a new GitHub App, deleting
  data, or adding a new live test commit. Verify current access and get one
  action-specific approval before those external side effects.
- Privacy Policy and Terms remain drafts. Known facts supplied by the user:
  operator/display name `NITISH Y PUJAR`, support email
  `2006nitishypujar@gmail.com`, and jurisdiction `India` are filled in. Still
  missing: retention period, hosting/database region and legal review.
- Docker Desktop previously failed to start but is now usable with elevated
  local engine access. The temporary test database container was removed after
  testing. Do not make the user repeat Docker commands.

## Work plan — continue without stopping between phases

1. Inspect the archive, workspace, git status, project instructions, and all
   existing changes. Confirm no secrets were packaged. Resolve any conflict
   between the supplied ZIP and current workspace without overwriting work.
2. Run full CI and dependency/security checks. Review the site, backend, GitHub
   App flow, database schema/migrations, extension trust boundary, rate limits,
   session/CSRF/cookie settings, CSP/CORS, queue/retry logic, disconnect/data
   deletion, and repository output rules. Fix concrete issues and add
   regression tests. Never imply automated tests prove security is absolute.
3. Run all database integration tests against a disposable local test database
   if available. Never run test fixtures, destructive checks, or migrations on
   the existing hosted Supabase project without explicit approval and a
   recovery plan. If no isolated DB is available, finish other work and record
   the exact blocker.
4. Validate production build and Render Blueprint configuration, same-origin
   cookies/CSP, GitHub callback/setup URLs, extension host permissions, health
   check, and documented recovery/rotation steps. Correct inconsistencies and
   keep the app source uncommitted until the user authorizes publishing.
5. Prepare a concrete, reviewable deployment plan. If live browser access is
   available, use it for authorized read-only inspection and tasks already
   approved. Bundle only the remaining account authentication, secret entry,
   legal details, and external publishing/service-creation approval into one
   exact request. Never publish or push first and ask afterward.
6. After necessary user action/approval, continue through GitHub App live
   setup, safe secret rotation, isolated DB testing, Render preview deployment,
   extension reload/permission verification, and end-to-end browser regression
   as far as the available environment allows. Do not submit a LeetCode
   solution or create a GitHub test commit without fresh explicit approval.
7. Finish by updating release status and handoff notes. Report completion only
   when all applicable checks pass. State precisely what is deployed, the test
   results, any known limitations, and any remaining user-only actions.

Do not stop just because a phase is done. Continue until the project is complete
or all remaining work is genuinely blocked on me or an external provider.
