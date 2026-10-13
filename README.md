# LeetSync

LeetSync watches Accepted submissions in the LeetCode page, then commits the source and problem details to a GitHub repository. Setup is GitHub sign-in, a LeetCode username, and loading the unpacked browser extension once.

The extension reads LeetCode responses in the browser. It never sends a LeetCode password, cookie, or session token to LeetSync. GitHub OAuth tokens are encrypted at rest with AES-256-GCM; session and extension tokens are stored as hashes.

## Start the application

Install Docker Desktop and Node.js 20 or later. For a first run, copy the sample environment file and fill in a GitHub OAuth App client ID and secret:

```powershell
Copy-Item .env.example .env
```

In GitHub, open **Settings → Developer settings → OAuth Apps → New OAuth App** and use:

- Homepage URL: `http://localhost:5173`
- Authorization callback URL: `http://localhost:3000/api/auth/github/callback`
- OAuth scope: `public_repo` (allows the app to create and write the public destination repository without requesting private-repository access)

Set `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` in `.env`. Replace `SESSION_SECRET` with at least 32 random characters and `TOKEN_ENCRYPTION_KEY` with 64 hexadecimal characters. Keep `.env` private.

Start PostgreSQL, the API, the durable sync worker, and the dashboard:

```powershell
docker compose up --build -d
```

The API applies Prisma migrations automatically before starting. Open `http://localhost:5173`; API health is at `http://localhost:3000/health`. The Compose PostgreSQL volume survives container restarts and `docker compose down`. `docker compose down -v` removes that database volume and all stored LeetSync data.

## Connect your accounts

1. Select **Sign in with GitHub**. This alone does not create a repository.
2. Enter your LeetCode username on the dashboard.
3. In Chrome or Edge, open `chrome://extensions` or `edge://extensions`, enable **Developer mode**, and choose **Load unpacked**. Select this repository's `extension` folder.
4. Open LeetCode in that browser. When the extension verifies the matching LeetCode username, LeetSync creates or reuses exactly one public `leetcode-solutions` repository. If that exact name is unavailable, setup stops instead of creating a second repository.

The extension uses `storage` and `alarms`, and has host access only to LeetCode and the configured LeetSync API. The stable unpacked extension ID is `nadlcboffmafknogdcgohdcledaomppo`; the dashboard origin is separately listed for external messaging. If you change the extension manifest key or dashboard origin, update `EXTENSION_ID`, `VITE_EXTENSION_ID`, the extension's `externally_connectable.matches`, and the API CORS allowlist together.

## What happens after Accepted

The page-world hook relays only a candidate submission ID after LeetCode displays Accepted. The isolated extension worker independently checks the signed-in LeetCode account, confirms that the candidate is the newest Accepted result for that account, and fetches its source and problem metadata directly from LeetCode. Only after those checks pass does the extension send the submission to the LeetSync API over HTTPS (HTTP on localhost). Page messages cannot provide trusted source code, status, or account identity. If verification or account matching fails, nothing is queued. If the API is unreachable, up to 40 verified submissions / 4 MB are buffered in extension storage and retried automatically. This uses LeetCode's current undocumented GraphQL endpoints and needs maintenance if their response shapes change.

The database deduplicates by the LeetCode submission ID. The worker commits to the repository's current default branch with the GitHub account's numeric ID-based noreply email, and the submission time formatted in the browser's saved timezone. Each commit writes only the source file and one concise README for that problem:

```text
solutions/<problem-number>-<title-slug>/solution.<ext>
solutions/<problem-number>-<title-slug>/README.md
```

Repeated accepted submissions for the same problem update those stable paths; they do not create extra repository names or duplicate README files. The dashboard refreshes state and connection heartbeats automatically and shows accepted, queued, synced, and failed counts, retry actions, and commit links.

## Run without Compose

Copy the backend and frontend examples, set the backend `DATABASE_URL` to a reachable PostgreSQL database, and configure the same OAuth, session, encryption, callback, dashboard-origin, and extension-ID values:

```powershell
Copy-Item backend/.env.example backend/.env
Copy-Item frontend/.env.example frontend/.env.local
npm ci
npm run db:generate
npm run db:deploy
npm run dev:api
npm run dev:worker
npm run dev:web
```

Run the API, worker, and web commands in separate terminals. The API and worker load `backend/.env`; Vite loads `frontend/.env.local`.

## Checks

Run the normal automated suite and production builds:

```powershell
npm run ci
```

Database integration tests must use a disposable database. Create `leetsync_test` in the local Compose PostgreSQL instance, point `DATABASE_URL` at that database, deploy migrations, then run the integration tests:

```powershell
docker compose exec -T postgres createdb -U leetsync leetsync_test
$env:DATABASE_URL = 'postgresql://leetsync:leetsync@localhost:5432/leetsync_test?schema=public'
$env:RUN_DB_TESTS = 'true'
npm run db:deploy
npm run test:db
```

Do not point these tests at a hosted or user database; they create and delete test records.

## Troubleshooting

- **GitHub repository setup fails:** Reconnect and approve the OAuth app's `repo` scope. The callback URL must exactly match the value above.
- **Extension is not detected:** Keep the dashboard and LeetCode open in the same browser profile, reload the dashboard once, and refresh a LeetCode problem page.
- **Username mismatch:** Sign in to the LeetCode account matching the saved username, or save the correct username on the dashboard.
- **A submission needs attention:** Reconnect GitHub if requested, then select **Retry** in the sync history.
- **No contribution appears:** The commit uses the user's GitHub noreply email and the LeetCode submission timestamp. Confirm the commit is on the default branch and allow GitHub time to refresh the contribution view.
- **Database/TLS:** Compose uses local PostgreSQL. For Supabase, see [DATABASE_TLS.md](docs/DATABASE_TLS.md) and keep certificate and hostname validation enabled.

## Known limits

LeetCode does not provide a supported public API for this integration. Detection relies on the current LeetCode page, its account-status query, and its submission response shapes, which can change. The extension reports only the logged-in username and Accepted submission data; it does not read or transmit LeetCode cookies or credentials. There is no Chrome Web Store listing yet; use the unpacked extension instructions above.

The rate limiter is process-local, so a multi-instance deployment needs a shared limiter. Historical submission backfill is not included.
