## Share door, phase 1 — 2026-10-21

- New `serverXR/src/share/`: `postStore` (SQLite `share_posts`: draft → approved → sent | failed, results per channel),
  channel contract + shared checks (`channels.js`), adapters `telegram.js` · `bluesky.js` · `mastodon.js`, `shareService.js`
  (validate, resolve media, send with retry that never double-posts), `preview.js` (the page).
- `serverXR/src/routes/shareRoutes.js`, mounted in `index.js` behind `requireAdminAlways`: `/api/share/channels`, `/api/share/posts[/:id[/send]]`,
  `/share/posts/:id/preview`. Tokens only from env: `config.share` (`SHARE_TELEGRAM_*`, `SHARE_BLUESKY_*`, `SHARE_MASTODON_*`).
- CLI: `di post draft|show|send|channels` (`scripts/di/post.mjs`, wired in `cli.mjs`, flags in `args.mjs`, help line in `ui.mjs`).
- Words added to `docs/ai/vocabulary.md`: post, share channel, share door. Docs: `docs/ai/publishing.md`, decision `2026-10-21-share-door.md`.
- Tests: `share/share.test.js` (fake HTTP server: each adapter, store, retry, missing token / API 4xx / media too big),
  `routes/shareRoutes.test.js`, `scripts/di/post.test.js`.
- Not tested: a real send to any channel (no token on this machine).
