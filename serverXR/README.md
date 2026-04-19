# dii Control Server

Minimal Express backend for the dii platform. It runs behind the cPanel Node.js App model, serves a small monitor UI, and owns the API contract for legacy spaces plus project-based editors.

Runtime baseline:

- package version: `0.2.0`
- Node baseline: `22.x`

## Current Role

`serverXR` is the backend for:

- V1 legacy spaces
- Studio project documents
- Beta project documents
- public live project delivery
- assets, SSE, presence, and edit enforcement

Keep this mental model simple:

- spaces are the public and management unit
- projects are the editable documents inside a space
- a space can point at one `publishedProjectId` for its live public route

## What It Serves

- `GET /`
  - lightweight monitor/dashboard
- `GET /api/health`
  - uptime, memory, Node version, and port
- `GET /api/events`
  - recent lifecycle events
- `GET /api/spaces`
  - list spaces
- `POST /api/spaces`
  - create a space
- `PATCH /api/spaces/:id`
  - rename or update permanence/edit access
- `DELETE /api/spaces/:id`
  - delete a space
- `POST /api/spaces/:id/touch`
  - refresh temporary space activity
- `GET /api/spaces/:id/scene`
  - read a legacy scene
- `PUT /api/spaces/:id/scene`
  - replace a legacy scene
- `GET /api/spaces/:id/ops`
  - read V1 scene-op history
- `POST /api/spaces/:id/ops`
  - append V1 scene ops
- `POST /api/spaces/:id/assets`
  - upload a space asset
- `GET /api/spaces/:id/assets/:assetId`
  - stream a space asset
- `GET /api/spaces/:spaceId/projects`
  - list project documents inside a space
- `POST /api/spaces/:spaceId/projects`
  - create a project
- `GET /api/projects/:projectId`
  - read project metadata
- `PATCH /api/projects/:projectId`
  - update project metadata
- `DELETE /api/projects/:projectId`
  - delete a project
- `GET /api/projects/:projectId/document`
  - read a normalized project document
- `PUT /api/projects/:projectId/document`
  - replace a project document
- `GET /api/projects/:projectId/ops`
  - fetch project op history after a version
- `POST /api/projects/:projectId/ops`
  - append durable project ops
- `POST /api/projects/:projectId/assets`
  - upload a project asset
- `GET /api/projects/:projectId/assets/:assetId`
  - stream a project asset
- `GET /api/projects/:projectId/events`
  - SSE stream for project document updates
- `WS <APP_BASE_PATH>/socket.io`
  - collaborator presence and cursors
- `GET <APP_BASE_PATH>/api/spaces/:id/events`
  - SSE stream for V1 scene updates

## Product Relationship

This server supports two editor families:

- `V1 Legacy`
  - spaces are the authoritative shared unit
- `Project Editors`
  - Studio and Beta both use project documents, project ops, SSE, and presence

Current repo direction:

- V1 stays as the fallback and compatibility lane
- Studio is the main authoring lane
- Beta remains available, but is secondary

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
| `AUTH_SESSION_TTL_MS` | Lifetime for browser edit sessions created through `/api/auth/session`. | `43200000` |
| `AUTH_SESSION_COOKIE_SECURE` | Mark edit-session cookies `Secure`. | `true` in production |
| `AUTH_SESSION_COOKIE_NAME` | Cookie name for edit sessions. | `dii_serverxr_session` |
| `CORS_ORIGINS` | Comma-separated allowlist of origins. | _none_ |
| `MAX_UPLOAD_MB` | Max asset upload size in MB. | `100` |
| `SHARED_ROOT` | Override for shared schema loading. Use this when staging and production keep separate shared folders outside the repo. | repo-local `shared/` fallback |

Security notes:

- in production, unauthenticated writes are rejected unless `REQUIRE_AUTH=false`
- browser editors should use the http-only session flow instead of a compiled `VITE_API_TOKEN`
- bearer-token auth remains available for automation and emergency compatibility
- if a space has `allowEdits=false`, scene, asset, and realtime mutations are rejected with `403`

## Runtime Contract

These values matter more than old deploy folklore:

- staging should use `DATA_ROOT=/home/distudio/serverXR-staging/data`
- staging should use `SHARED_ROOT=/home/distudio/shared-staging`
- production should use `DATA_ROOT=/home/distudio/serverXR/data`
- production should use `SHARED_ROOT=/home/distudio/shared`
- `API_TOKEN` stays server-only for normal builds; browser editors create an http-only auth session when a protected write needs it
- the Node app mount stays `/serverXR` in both environments

If `/serverXR/api/health` fails, check this order:

1. Passenger `.htaccess` inside the web-root `serverXR/` mount
2. backend `.env`
3. `DATA_ROOT`
4. `SHARED_ROOT`
5. then code

## Collaboration Contract

- Socket.IO provides presence and cursors
- durable changes flow through REST ops plus SSE catch-up
- V1 uses scene ops
- Studio and Beta use project ops
- project metadata preserves the route/source context so non-`main` spaces stay attached to the right space

One important product behavior:

- the backend is authoritative about whether a space exists
- clients may auto-provision a missing space before retrying project creation, but the backend still owns the final state

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

- GitHub publishes prebuilt `cpanel-*` branches
- cPanel `Git Version Control` tracks those branches
- `.cpanel.yml` runs `scripts/cpanel-apply-prebuilt-release.sh`
- `/serverXR` stays owned by the cPanel Node.js App

Fallbacks still exist, but they are not the default:

- PM2 only if the host does not expose `Setup Node.js App`
- Git-pull/self-host deploy only when GitHub Actions cannot push artifacts to the host

## Storage Notes

- scene and asset data lives under `serverXR/data/spaces/<spaceId>/`
- project data lives under `serverXR/data/spaces/<spaceId>/projects/<projectId>/`
- temporary spaces auto-prune after ~30 days of inactivity unless `SPACE_TTL_MS` overrides it
- uploaded assets stream directly from the API and preserve MIME type metadata
