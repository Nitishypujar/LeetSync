# DRAFT – requires review by a qualified lawyer

**Not approved for publication.** This draft reflects the code and deployment information reviewed on 2026-10-22. Verify every statement against current provider settings, contracts, retention schedules, and the final production architecture.

## Operator and contact

LeetSync is operated by NITISH Y PUJAR, India. Support and privacy contact: [2006nitishypujar@gmail.com](mailto:2006nitishypujar@gmail.com). Counsel must confirm the operator's legal identity, business address, applicable privacy roles, and required disclosures before launch.

## Information processed

- GitHub account identifier and login, plus display name when available, for sign-in and commit attribution.
- GitHub authorization or installation credentials. OAuth tokens are encrypted in the database; installation credentials are short-lived and minted by the server. Verify the production credential lifecycle and key management before publication.
- LeetCode username and account-link status.
- Accepted submission source code and metadata captured by the browser extension: problem number/title/slug, language, runtime, memory, provider submission ID, submit time, and resulting GitHub commit/path/status.
- Website sessions and extension pairing credentials. Persistent session and extension token values are stored as hashes; transient browser cookies are used for session and OAuth state.
- Sync-job status and bounded diagnostic text. Application, hosting, database, and provider logs may contain operational metadata; their exact contents and retention periods require provider/account verification.

The extension reads the signed-in LeetCode username and submission page data in the user's browser. The service does not ask for or receive a LeetCode password or browser session cookie, based on the implementation reviewed. Re-verify this after material extension changes.

## Purposes and recipients

LeetSync uses this information to authenticate users, link accounts, verify accepted submissions, queue and retry syncs, write solution files to the user's chosen GitHub repository, show sync history, and protect and operate the service. Submission source code is sent to LeetSync's API and then to GitHub when synced. A public destination repository makes committed source and history visible to the public.

Current preview infrastructure is Render and Supabase. The reviewed deployment documentation identifies Singapore as the configured primary region; provider subprocessors, backups, support access, and cross-region processing may differ. GitHub, LeetCode, Render, Supabase, and any future providers process data under their own terms. Verify actual production vendors and locations before launch. No separate analytics or error-monitoring provider was identified in the reviewed configuration; recheck before publication.

## Retention and user choices

Account, connection, submission, and sync-history records are retained while the account exists. The dashboard offers separate GitHub and LeetCode disconnect actions and a Delete my data action. Disconnecting stops or revokes the corresponding connection but preserves existing LeetSync history; repository commits already made are not deleted. Account deletion removes active LeetSync database records through the account's cascade relations. GitHub app/token revocation is best effort; confirm and clearly disclose what happens if provider revocation fails. Provider security logs, backups, and already-created GitHub commits may remain under their respective retention and deletion processes.

The extension keeps a temporary local delivery queue. Uninstalling the extension may remove that browser-local queue; it does not delete server history or commits. LeetSync does not currently offer a data-export feature. Do not promise export, backup recovery, or a fixed provider-log deletion time unless implemented and verified.

## Security and international processing

The implementation uses HTTPS in production, encrypted GitHub OAuth tokens, hashed session/extension tokens, request-origin checks, and authenticated APIs. These measures reduce risk but cannot guarantee absolute security. The service's jurisdiction, cross-border transfer basis, incident process, and user rights must be reviewed by counsel for the intended launch locations.

## Changes and contact

Material policy changes should be dated and communicated as required by applicable law. Contact [2006nitishypujar@gmail.com](mailto:2006nitishypujar@gmail.com) for questions or deletion requests.

## Open verification items

Before publication, counsel/operator must confirm: legal business identity/address; countries served; legal basis and rights workflow; provider data-processing terms/subprocessors and transfer disclosures; production log and backup retention; account-deletion behavior when GitHub revocation fails; incident contact/process; age restrictions; and whether LeetCode's terms permit the extension's page/API interaction.
