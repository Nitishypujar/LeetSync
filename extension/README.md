# LeetSync browser extension

This Manifest V3 extension detects the signed-in LeetCode account and syncs verified Accepted submissions to the LeetSync API.

## Install in Chrome or Edge

1. Start the LeetSync dashboard and API using the root README instructions.
2. Visit `chrome://extensions` in Chrome or `edge://extensions` in Edge.
3. Turn on **Developer mode**.
4. Select **Load unpacked** and choose this `extension` folder.
5. Return to the signed-in dashboard, then open or refresh a LeetCode page in the same browser profile.

The dashboard and extension exchange a short-lived setup token through the browser's external messaging API; no code is typed or copied. The popup shows the detected account, connection status, local retry queue, and most recent delivery time.

## Permissions and data

The extension requests `storage` and `alarms`, plus host access to `leetcode.com`, `leetcode.cn`, and the supported local or production LeetSync API. It buffers up to 40 submissions / 4 MB when the API is unavailable. The page-world hook relays only a candidate submission ID. The extension worker independently checks the signed-in account, confirms the ID is the newest entry in that account's Accepted-submission list, and fetches the Accepted status and code directly from LeetCode before syncing. Page-supplied code, status, and username are never trusted. LeetCode passwords, cookies, and session tokens are never sent to LeetSync; the browser attaches its LeetCode session only to the worker's direct LeetCode requests. Older submissions are intentionally not auto-imported from a forged page signal.

The dashboard's external messaging origin and API host access are pinned in `manifest.json` and the environment configuration. The service worker validates messages against those declared origins. The prepared Render preview origin is included; if the provider assigns a different host, update both manifest entries, the API CORS origin, and `GITHUB_CALLBACK_URL`, then reload or repackage the extension.
