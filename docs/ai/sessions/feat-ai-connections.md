## 2026-08-08 — per-user "connect your AI key", v1

- First slice of a bigger goal (multi-account collaboration, pluggable AI/Telegram tool
  connections): a signed-in user can now store their own Claude API key against their
  account, from the existing account-menu popover (`AccountButton.jsx`). Modeled on the
  Google Drive per-user OAuth pattern (`integrationRoutes.js`/`driveTokenStore.js`) — new
  `user_ai_connections` table, `aiConnectionStore.js` (AES-256-GCM at rest, own key
  domain), new `routes/aiConnectionRoutes.js` (status/connect/disconnect, `claude`
  provider only for now). The raw key never returns to the client — status is
  `{connected, last4}` only.
- Verified live in a real browser (headless): connect → encrypted row confirmed in
  SQLite (not plaintext) → full page reload → still connected → disconnect → row gone.
  lint/build/1798 tests green, server contracts green.
- Wiki entry added (`ai-connection`) under Spaces & access.
- Deliberately stopped here: no Telegram-linking (di-bo is currently hardcoded to one
  owner Telegram ID — generalizing it to "any linked di.iiii user" is real, separate
  work), no other AI providers, no shared/free-credit pool (needs per-user metering
  before it's safe to offer), and nothing inside di.iiii yet reads the stored key to do
  anything — this is the storage/account layer only, for future work to build on.
