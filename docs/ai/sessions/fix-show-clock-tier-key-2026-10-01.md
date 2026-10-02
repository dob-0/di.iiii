## 2026-10-01 — show-clock sends each server its own key

Found while restarting moxir-hall-minimal's show clock on dev after `tier-sync` pushed the project: `--token-file
serverXR/.env.local` gave dev the LOCAL key (401). `tokenKeysFor(api)` now picks by host (dev LIVE_API_TOKEN, prod
PROD_API_TOKEN, local ADMIN/API), the same mapping as tier-sync's TIERS; a file without the right key stops with its
name. Guard `show-clock.test.js` (4). Seen: `--check` against dev with that same file reads the running show.
