# dii Control Server

Minimal Express server meant to run on the cPanel Node.js environment (Node 22.14.0). It ships with a visual status UI plus a lightweight API for syncing multi-user “spaces” with the front-end editor.

## Features

- `GET /` – lightweight dashboard that pings the API and lists the last 25 requests/errors.
- `GET /api/health` – JSON payload with uptime, memory, Node version, and current port.
- `GET /api/events` – last 25 lifecycle events (requests + server start + errors).
- `GET /api/spaces` – list saved spaces (`id`, `label`, timestamps, permanence).
- `POST /api/spaces` – create a new space (`{ label, slug, permanent }`).
- `PATCH /api/spaces/:id` – rename or toggle permanence.
- `DELETE /api/spaces/:id` – remove a space and its persisted data.
- `POST /api/spaces/:id/touch` – update `lastTouchedAt` to keep temporary spaces alive.
- `GET /api/spaces/:id/scene` – retrieve the saved scene payload.
- `PUT /api/spaces/:id/scene` – persist the latest scene JSON.
- `POST /api/spaces/:id/assets` – upload an asset blob (multipart field `asset`), returns `{ assetId, mimeType, size, url }`.
- `GET /api/spaces/:id/assets/:assetId` – stream a stored asset file.

## Scripts

```bash
cd serverXR
npm install      # install once
# copy .env.example to .env and tweak the values for your server
npm run dev      # local watch mode
npm run start    # production start
```

## Configuration

Environment variables live in a `.env` file inside `serverXR/` (see `.env.example`). Key values:

| Variable | Description | Default |
| --- | --- | --- |
| `PORT` | HTTP port the Express app listens on. | `4000` |
| `APP_BASE_PATH` | Public path when reverse-proxied (e.g. `/serverXR`). Leave blank for root. | `/serverXR` |
| `DATA_ROOT` | Folder where scene data + uploads are persisted. | `./data` |
| `SPACES_DIR` | Optional override for the spaces directory. | `<DATA_ROOT>/spaces` |
| `UPLOADS_DIR` | Optional override for uploaded assets. | `<DATA_ROOT>/uploads` |
| `SPACE_TTL_MS` | Milliseconds of inactivity before temporary spaces are pruned. | `2592000000` (30 days) |

## Running via PM2 (recommended)

Keeping the Node process alive via PM2 prevents accidental shutdowns when a shell disconnects. From the `serverXR/` directory:

```bash
npm install --production      # or npm install if you haven’t already
pm2 start ecosystem.config.js # boots the API
pm2 logs dii-control-server   # tail stdout/stderr
pm2 restart dii-control-server
pm2 save                      # optional: auto-start on boot (depends on host)
```

## Deploying on cPanel

1. Upload the `serverXR/` folder to `/home/distudio/serverXR` (or whatever root you configure).
2. Duplicate `.env.example` into `.env` and update the values for your environment (port, base path, storage locations).
3. In **Setup Node.js App** choose Node **22.14.0**, set the application root to that directory, and leave the app URL at `/serverXR`.
4. If Passenger does not inject a port automatically, set `PORT=<free port>` in the cPanel UI (same value as your `.env` file).
5. Optional: set `APP_BASE_PATH=/serverXR` if the app is reverse-proxied (default still falls back to `/serverXR`).
6. Click **Run NPM Install** once, then either:
   - **Start App** in Passenger (simple deployment), or
   - SSH in and run the PM2 commands above for a long-lived process (recommended for stability).
7. Visit `https://di-studio.xyz/serverXR/` to see the status page, or hit `https://di-studio.xyz/serverXR/api/health` directly.

> **Tip:** avoid using the “Run JS Script” button for `npm start`; let Passenger manage the daemon so you can stop/restart it from the UI.

### Storage notes

- Scene + asset data lives under `serverXR/data/spaces/<spaceId>/`.
- Temporary spaces auto-prune after ~30 days of inactivity (`SPACE_TTL_MS` overrides this).
- Uploaded assets are streamed back from `/api/spaces/:id/assets/:assetId` and include the recorded MIME type.
