# LeetSync dashboard

React and TypeScript dashboard for GitHub sign-in, LeetCode username setup, extension status, queue counts, and sync history. API origin is `VITE_API_BASE_URL`; the browser extension ID is `VITE_EXTENSION_ID`.

The dashboard loads persisted user state from `/api/dashboard` on mount and polls for heartbeat and queue updates. It uses the server's HttpOnly session cookie and a CSRF token; GitHub and extension tokens are not stored in dashboard storage.

For local development, configure `frontend/.env.local` from `.env.example`, then run `npm run dev:web` alongside the API and worker. See the root README for the OAuth callback and Compose setup.
