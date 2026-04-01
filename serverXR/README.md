# dii Control Server

Minimal Express server meant to run on the cPanel Node.js environment (Node 22.14.0). It ships with a visual status UI plus a lightweight API for syncing multi-user “spaces” with the front-end editor.

## Features

- `GET /` – lightweight dashboard that pings the API and lists the last 25 requests/errors.
- `GET /api/health` – JSON payload with uptime, memory, Node version, and current port.
- `GET /api/events` – last 25 lifecycle events (requests + server start + errors).
- `GET /api/spaces` – list saved spaces (`id`, `label`, timestamps, permanence).
- `POST /api/spaces` – create a new space (`{ label, slug, permanent }`).
- `PATCH /api/spaces/:id` – rename a space or toggle permanence/edit access.
- `DELETE /api/spaces/:id` – remove a space and its persisted data.
- `POST /api/spaces/:id/touch` – update `lastTouchedAt` to keep temporary spaces alive.
- `GET /api/spaces/:id/scene` – retrieve the saved scene payload.
- `PUT /api/spaces/:id/scene` – persist the latest scene JSON.
- `GET /api/spaces/:id/ops` – fetch scene-op history after a version for catch-up.
- `POST /api/spaces/:id/ops` – append durable scene ops with optimistic version checks.
- `POST /api/spaces/:id/assets` – upload an asset blob (multipart field `asset`), returns `{ assetId, mimeType, size, url }`.
- `GET /api/spaces/:id/assets/:assetId` – stream a stored asset file.
- `GET /api/spaces/:spaceId/projects` – list V2 projects inside a space.
- `POST /api/spaces/:spaceId/projects` – create a V2 project in a space.
- `GET /api/projects/:projectId` – load V2 project metadata.
- `PATCH /api/projects/:projectId` – rename/update V2 project metadata.
- `DELETE /api/projects/:projectId` – delete a V2 project.
- `GET /api/projects/:projectId/document` – read the normalized V2 project document.
- `PUT /api/projects/:projectId/document` – replace the V2 project document.
- `GET /api/projects/:projectId/ops` – fetch V2 project op history after a version.
- `POST /api/projects/:projectId/ops` – append durable V2 project ops with optimistic version checks.
- `POST /api/projects/:projectId/assets` – upload a V2 project asset blob.
- `GET /api/projects/:projectId/assets/:assetId` – stream a stored V2 project asset file.
- `GET /api/projects/:projectId/events` – SSE stream for durable V2 project op updates.
- `WS <APP_BASE_PATH>/socket.io` – collaborator presence.
- `GET <APP_BASE_PATH>/api/spaces/:id/events` – SSE stream for durable scene-op updates and catch-up.

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
| `API_TOKEN` | Token required for write requests (POST/PUT/PATCH/DELETE). | _none_ |
| `REQUIRE_AUTH` | Enforce `API_TOKEN` for write requests. When unset, it defaults to `true` in production and `false` otherwise. | `NODE_ENV`-aware |
| `CORS_ORIGINS` | Comma-separated allowlist of origins. Use `*` only for local dev. | _none_ |
| `MAX_UPLOAD_MB` | Max asset upload size in MB. | `100` |

> **Security note:** In production the server now defaults to rejecting unauthenticated writes unless you explicitly disable `REQUIRE_AUTH`. If a space has `allowEdits=false`, scene, asset, and realtime mutation requests are rejected with `403`.

## Current Collaboration Contract

- The stable baseline for this repo is `LIVE_SYNC_FEATURE_ENABLED=true`.
- Socket.IO provides collaborator presence under `<APP_BASE_PATH>/socket.io`.
- Durable collaborative scene edits flow through REST scene ops plus the SSE event stream.
- Hidden Beta V2 follows the same rule set with `projects`: project ops + SSE are authoritative, while sockets handle project roster/cursors only.
- Manual publish/reload remains available for full-scene overwrite flows and recovery.

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
- Beta V2 project data lives under `serverXR/data/spaces/<spaceId>/projects/<projectId>/`.
- Temporary spaces auto-prune after ~30 days of inactivity (`SPACE_TTL_MS` overrides this).
- Uploaded assets are streamed back from `/api/spaces/:id/assets/:assetId` and include the recorded MIME type.
