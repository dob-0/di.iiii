# dii Control Server

Minimal Express backend for the dii platform. It runs on the cPanel Node.js App model, serves a small monitor UI, and provides the API contract for legacy spaces plus project-based editors.

Runtime baseline:

- package version: `0.2.0`
- Node baseline: `22.x`

## What It Serves

- `GET /` - lightweight monitor/dashboard
- `GET /api/health` - uptime, memory, Node version, and port
- `GET /api/events` - recent lifecycle events
- `GET /api/spaces` - list spaces
- `POST /api/spaces` - create a space
- `PATCH /api/spaces/:id` - rename or update permanence/edit access
- `DELETE /api/spaces/:id` - delete a space
- `POST /api/spaces/:id/touch` - refresh temporary space activity
- `GET /api/spaces/:id/scene` - read a legacy scene
- `PUT /api/spaces/:id/scene` - replace a legacy scene
- `GET /api/spaces/:id/ops` - read V1 scene-op history
- `POST /api/spaces/:id/ops` - append V1 scene ops
- `POST /api/spaces/:id/assets` - upload a space asset
- `GET /api/spaces/:id/assets/:assetId` - stream a space asset
- `GET /api/spaces/:spaceId/projects` - list project documents inside a space
- `POST /api/spaces/:spaceId/projects` - create a project
- `GET /api/projects/:projectId` - read project metadata
- `PATCH /api/projects/:projectId` - update project metadata
- `DELETE /api/projects/:projectId` - delete a project
- `GET /api/projects/:projectId/document` - read a normalized project document
- `PUT /api/projects/:projectId/document` - replace a project document
- `GET /api/projects/:projectId/ops` - fetch project op history after a version
- `POST /api/projects/:projectId/ops` - append durable project ops
- `POST /api/projects/:projectId/assets` - upload a project asset
- `GET /api/projects/:projectId/assets/:assetId` - stream a project asset
- `GET /api/projects/:projectId/events` - SSE stream for project document updates
- `WS <APP_BASE_PATH>/socket.io` - collaborator presence and cursors
- `GET <APP_BASE_PATH>/api/spaces/:id/events` - SSE stream for V1 scene updates

## Product Relationship

This server supports two editor families:

- `V1 Legacy`
  - spaces are the authoritative shared unit
- `Project Editors`
  - Beta and Studio both use project documents, project ops, SSE, and presence

The server does not decide which editor is the long-term product target. The current repo direction is:

- V1 remains the stable compatibility lane
- Studio is the future main editor
- Beta is transitional

## Scripts

```bash
cd serverXR
npm install
npm run dev
npm run start
```

## Configuration

Environment variables:

| Variable | Description | Default |
| --- | --- | --- |
| `PORT` | HTTP port the Express app listens on. | `4000` |
| `APP_BASE_PATH` | Public mount path when reverse-proxied. | `/serverXR` |
| `DATA_ROOT` | Folder where scene/project data and uploads are persisted. | `./data` |
| `SPACES_DIR` | Optional override for the spaces directory. | `<DATA_ROOT>/spaces` |
| `UPLOADS_DIR` | Optional override for uploaded assets. | `<DATA_ROOT>/uploads` |
| `SPACE_TTL_MS` | Inactivity window before temporary spaces are pruned. | `2592000000` |
| `API_TOKEN` | Token required for write requests. | _none_ |
| `REQUIRE_AUTH` | Enforce `API_TOKEN` for writes. | `NODE_ENV`-aware |
| `CORS_ORIGINS` | Comma-separated allowlist of origins. | _none_ |
| `MAX_UPLOAD_MB` | Max asset upload size in MB. | `100` |
| `SHARED_ROOT` | Optional override for shared schema loading. Used when staging and production keep separate shared folders outside the repo. | repo-local `shared/` fallback |

Security note:

- in production, unauthenticated writes are rejected unless `REQUIRE_AUTH=false`
- if a space has `allowEdits=false`, scene, asset, and realtime mutations are rejected with `403`

## Collaboration Contract

- Socket.IO provides presence and cursors
- durable changes flow through REST ops plus SSE catch-up
- V1 uses scene ops
- Beta and Studio use project ops
- project metadata now preserves the requested source so Studio, Beta, and imports can be identified correctly

## Running On cPanel Node.js App

Recommended app settings:

- Node version: `22`
- application root: `serverXR` or `serverXR-staging`
- application URL: `/serverXR`
- startup file: `src/index.js`

Typical restart flow:

```bash
cd ~/serverXR
npm install --omit=dev
cloudlinux-selector restart --json --interpreter nodejs --user "$USER" --app-root serverXR
```

For staging, use `~/serverXR-staging` and `--app-root serverXR-staging`.

## Deploy Model

Canonical deploy path:

- publish from GitHub Actions with [publish-cpanel-prebuilt-v2.yml](/home/nnn/Desktop/dii_ii/.github/workflows/publish-cpanel-prebuilt-v2.yml)
- cPanel `Git Version Control` deploys the tracked `cpanel-*` branch and runs [scripts/cpanel-apply-prebuilt-release.sh](/home/nnn/Desktop/dii_ii/scripts/cpanel-apply-prebuilt-release.sh) through `.cpanel.yml`
- keep `/serverXR` owned by the cPanel Node.js App

Fallbacks:

- PM2 only if the host does not expose `Setup Node.js App`
- Git-pull/self-host deploy only when GitHub Actions cannot push artifacts to the host

## Golden Runtime Rules

- production should use `DATA_ROOT=/home/distudio/serverXR/data`
- production should use `SHARED_ROOT=/home/distudio/shared`
- staging should use `DATA_ROOT=/home/distudio/serverXR-staging/data`
- staging should use `SHARED_ROOT=/home/distudio/shared-staging`
- `API_TOKEN` and `VITE_API_TOKEN` should match inside each environment
- the Node app mount stays `/serverXR` in both environments
- if `/serverXR/api/health` fails, check the Passenger `.htaccess`, backend `.env`, `DATA_ROOT`, and `SHARED_ROOT` before changing code

## Storage Notes

- scene + asset data lives under `serverXR/data/spaces/<spaceId>/`
- project data lives under `serverXR/data/spaces/<spaceId>/projects/<projectId>/`
- temporary spaces auto-prune after ~30 days of inactivity unless `SPACE_TTL_MS` overrides it
- uploaded assets stream directly from the API and preserve MIME type metadata
