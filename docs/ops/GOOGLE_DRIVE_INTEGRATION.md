# Google Drive asset import — setup

Two ways to pull assets into a space from Google Drive (Studio → Project Assets → **Google Drive**):

1. **Public share link** — paste an "Anyone with the link" file URL. Works with no
   server secrets. A shared *folder* also works, but folder listing needs
   `GOOGLE_API_KEY` (below).
2. **Connect your Drive** — per-user OAuth. Each signed-in user connects their own
   Google account, browses their own files, and imports the selected ones. Tokens
   are stored per user, encrypted at rest.

## Server env

All optional and baked into `.env.generated` via the `write-server-env.mjs`
allowlist (put them in `~/.config/dii/<env>.deploy.env`, like the GitHub-sync vars).

| Var | Needed for | Notes |
| --- | --- | --- |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Connect-your-Drive (and login) | Same OAuth client as Google login. |
| `OAUTH_CALLBACK_BASE_URL` | Connect-your-Drive | Public origin, e.g. `https://di-studio.xyz/serverXR`. |
| `GOOGLE_API_KEY` | Public *folder* import + richer metadata | Not required for single public files. |

If `GOOGLE_CLIENT_ID` is unset, the "Connect Google Drive" button hides and only
the public-link path shows.

## Google Cloud console (one time)

For **Connect your Drive**:
1. Enable the **Google Drive API** for the project.
2. OAuth consent screen → add scope `https://www.googleapis.com/auth/drive.readonly`.
3. Credentials → the OAuth client → Authorized redirect URIs → add:
   `${OAUTH_CALLBACK_BASE_URL}/api/integrations/google-drive/callback`
   (e.g. `https://di-studio.xyz/serverXR/api/integrations/google-drive/callback`).

For **public folder import**: Credentials → create an **API key**, restrict it to
the Drive API, set it as `GOOGLE_API_KEY`.

## How it works

- OAuth is incremental (separate from login): `access_type=offline` + `prompt=consent`
  to obtain a refresh token, so imports keep working after the access token expires.
- Tokens live in `user_drive_tokens` (one row per user), access/refresh encrypted
  with AES-256-GCM keyed off the server session secret (`driveTokenStore.js`).
- All Google HTTP calls use `node:https` — never global `fetch` (undici WASM-OOMs
  under cPanel/LVE; see known-fixes).
- Imported bytes are stored in the normal per-space asset store, identical to
  uploads, so nothing downstream needs to know the origin.

## Endpoints

- `GET  /api/integrations/google-drive/status` — `{ available, connected, email }`
- `GET  /api/integrations/google-drive/connect` — redirect to Google consent
- `GET  /api/integrations/google-drive/callback` — exchange code, store tokens
- `POST /api/integrations/google-drive/disconnect` — drop the caller's tokens
- `GET  /api/integrations/google-drive/files?q=&folderId=` — browse own Drive
- `POST /api/spaces/:id/assets/import-drive` — public link (file/folder)
- `POST /api/spaces/:id/assets/import-drive-account` — import own Drive by `fileIds`/`url`
