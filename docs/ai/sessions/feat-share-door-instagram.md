## 2026-11-09 — share door gets an Instagram channel (one image or reel)

- Added `serverXR/src/share/instagram.js`: container → (poll reels) → media_publish → permalink via the Meta Graph API (graph.facebook.com v23.0, Bearer token); registered in `shareService.js`; settings `SHARE_INSTAGRAM_TOKEN` / `SHARE_INSTAGRAM_ACCOUNT` / optional `SHARE_INSTAGRAM_API` in `config.js`.
- 6 new tests in `share.test.js` (29 pass): publish, reel polling, missing settings, text-only/non-public media, caption > 2200, token redacted on API errors.
- Instagram fetches media itself, so only public https URLs work; space assets are not public yet.
- Undone: carousels (several images), and the token is not yet placed on the always-on machine (env only, never in the repo or database).
