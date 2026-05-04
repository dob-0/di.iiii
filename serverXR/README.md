# dii Control Server

`serverXR` is the Node/Express backend for `di.i`. It runs behind the cPanel Node.js App model, serves the monitor UI, persists space and project data, and is authoritative for edit enforcement, publish state, assets, SSE, and collaborator presence.

Runtime baseline:

- package version: `0.2.0`
- Node baseline: `22.x`

## Start Here

- backend authority: spaces, projects, assets, ops, SSE, presence, and writes
- editor families supported: `V1`, `Studio`, and `Beta`
- public unit: `space`
- editable document inside a space: `project`
- live public project pointer: `publishedProjectId`
- public mount path: `/serverXR`

## Mental Model

- `space`
  - the public and management unit
  - owns labels, edit settings, permanence, and published project selection
- `project`
  - the editable document inside a space
  - used by `Studio` and `Beta`
- `publishedProjectId`
  - the project shown on the space's public route

Simple product split:

- `V1` uses scene state and scene ops
- `Studio` and `Beta` use project documents and project ops
- the backend decides whether a space exists and whether writes are allowed

## Code Map

| Path | Role |
| --- | --- |
| `src/index.js` | app bootstrap, auth session routes, uploads, SSE wiring, and server setup |
| `src/routes/spaceRoutes.js` | space CRUD, publish state, scene endpoints, space assets |
| `src/routes/projectRoutes.js` | project CRUD, project documents, project ops, project assets |
| `src/routes/statusRoutes.js` | monitor, health, status, and release endpoints |
| `src/config.js` | env loading, directory config, auth identity config, CORS setup |
| `src/authAccess.js` | auth roles, labels, and space-scope checks |
| `src/authSession.js` | signed browser session cookies |
| `src/spaceStore.js` | space persistence and V1 scene storage |
| `src/projectStore.js` | project persistence and project-doc storage |
| `src/socketHandlers.js` | Socket.IO presence and cursor behavior |
| `src/jsonStore.js` | filesystem JSON helpers |

## Quick Start

```bash
cd serverXR
npm install
npm run dev
```

Production start:

```bash
cd serverXR
npm run start
```

## API Surface

Monitor and status:

- `GET /`
- `GET /api/health`
- `GET /api/events`

Browser auth session:

- `GET /api/auth/session`
- `POST /api/auth/session`
- `DELETE /api/auth/session`

Space lifecycle:

- `GET /api/spaces`
- `POST /api/spaces`
- `PATCH /api/spaces/:id`
- `DELETE /api/spaces/:id`
- `POST /api/spaces/:id/touch`

Legacy V1 scene flow:

- `GET /api/spaces/:id/scene`
- `PUT /api/spaces/:id/scene`
- `GET /api/spaces/:id/ops`
- `POST /api/spaces/:id/ops`
- `GET /api/spaces/:id/events`

Space assets:

- `POST /api/spaces/:id/assets`
- `GET /api/spaces/:id/assets/:assetId`

Project flow:

- `GET /api/spaces/:spaceId/projects`
- `POST /api/spaces/:spaceId/projects`
- `GET /api/projects/:projectId`
- `PATCH /api/projects/:projectId`
- `DELETE /api/projects/:projectId`
- `GET /api/projects/:projectId/document`
- `PUT /api/projects/:projectId/document`
- `GET /api/projects/:projectId/ops`
- `POST /api/projects/:projectId/ops`
- `GET /api/projects/:projectId/events`

Project assets:

- `POST /api/projects/:projectId/assets`
- `GET /api/projects/:projectId/assets/:assetId`

Realtime presence:

- `WS <APP_BASE_PATH>/socket.io`

## Auth And Security

The short version:

- production should reject unauthenticated writes unless `REQUIRE_AUTH=false`
- browser editors should log in through `POST /api/auth/session`
- normal browser editing should use the http-only session cookie, not a compiled `VITE_API_TOKEN`
- bearer tokens still exist for automation and backward compatibility

Auth knobs:

- `API_TOKEN`
  - legacy admin token
- `ADMIN_API_TOKEN`
  - dedicated admin token when you want to keep legacy behavior separate
- `EDITOR_API_TOKEN`
  - editor-only writes without admin powers
- `VIEWER_API_TOKEN`
  - low-privilege token for future read-only/session use
- `AUTH_IDENTITIES`
  - structured role entries with optional scope and labels

Behavior rules:

- `editor` can do scene/project authoring work
- `admin` is required for space creation, publishing, settings changes, and destructive admin actions
- tokens and sessions can be limited to specific spaces
- if a space has `allowEdits=false`, mutation routes reject writes with `403`

## Environment Variables

| Variable | Description | Default |
| --- | --- | --- |
| `PORT` | HTTP port the Express app listens on. | `4000` |
| `APP_BASE_PATH` | Public mount path when reverse-proxied. | `/serverXR` |
| `DATA_ROOT` | Folder where scene/project data and uploads are persisted. | `./data` |
| `SPACES_DIR` | Optional override for the spaces directory. | `<DATA_ROOT>/spaces` |
| `UPLOADS_DIR` | Optional override for uploaded assets. | `<DATA_ROOT>/uploads` |
| `SPACE_TTL_MS` | Inactivity window before temporary spaces are pruned. | `2592000000` |
| `API_TOKEN` | Legacy admin token for automation and backward-compatible write access. | _none_ |
| `ADMIN_API_TOKEN` | Optional dedicated admin token when `API_TOKEN` should stay legacy-only. | _none_ |
| `EDITOR_API_TOKEN` | Optional editor token for project/scene writes without space-management powers. | _none_ |
| `EDITOR_ALLOWED_SPACES` | Optional comma-separated editor space scope. Leave unset for all spaces. | all spaces |
| `VIEWER_API_TOKEN` | Optional low-privilege token for future read-only/session use. | _none_ |
| `AUTH_IDENTITIES` | Optional JSON array of `{ token, role, subject?, label? }` identities. | _none_ |
| `AUTH_SESSION_SECRET` | Secret used to sign browser auth sessions. Falls back to an auth token when omitted. | first configured token |
| `REQUIRE_AUTH` | Enforce token/session auth for writes. | `NODE_ENV`-aware |
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
- signed browser sessions now carry `role`, `subject`, and `label`
- `editor` access covers scene/project authoring, while `admin` is required for space creation, project deletion, space settings, publishing, and space deletion
- tokens and sessions can optionally be limited to specific spaces, and scoped credentials are rejected before they can mutate other spaces or projects
- if a space has `allowEdits=false`, scene, asset, and realtime mutations are rejected with `403`

## Runtime Contract

These values matter more than older deploy folklore:

- staging should use `DATA_ROOT=/home/distudio/serverXR-staging/data`
- staging should use `SHARED_ROOT=/home/distudio/shared-staging`
- production should use `DATA_ROOT=/home/distudio/serverXR/data`
- production should use `SHARED_ROOT=/home/distudio/shared`
- `API_TOKEN` stays server-only for normal builds; browser editors create an http-only auth session when a protected write needs it
- prefer a dedicated `EDITOR_API_TOKEN` for day-to-day authoring and reserve admin tokens for space/publish management
- use `EDITOR_ALLOWED_SPACES` or scoped `AUTH_IDENTITIES` entries when an editor should only operate inside named spaces
- the Node app mount stays `/serverXR` in both environments
- reserve admin tokens for publish and space-management work

If `/serverXR/api/health` fails, check in this order:

1. Passenger `.htaccess` inside the web-root `serverXR/` mount
2. backend `.env`
3. `DATA_ROOT`
4. `SHARED_ROOT`
5. then code

## Deploy Notes

Recommended cPanel Node.js App settings:

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

Canonical deploy path:

- GitHub publishes prebuilt `cpanel-*` branches
- cPanel `Git Version Control` tracks those branches
- `.cpanel.yml` runs `scripts/cpanel-apply-prebuilt-release.sh`
- `/serverXR` stays owned by the cPanel Node.js App

Fallbacks still exist for disaster recovery, but they are not the default path.

## For Humans And AI Agents

Use these defaults:

- edit `src/routes/` when the HTTP contract changes
- edit `src/config.js`, `src/authAccess.js`, or `src/authSession.js` when auth behavior changes
- edit `src/spaceStore.js` or `src/projectStore.js` when persistence shape changes
- edit `src/socketHandlers.js` when presence or cursor behavior changes
- update this README when auth, runtime, or deploy truth changes

Avoid these mistakes:

- do not move the public mount away from `/serverXR` without an intentional deploy migration
- do not reintroduce browser-shipped tokens as the normal auth path
- do not treat V1 scene routes as the main future-facing editor contract
- do not describe the backend as optional; it is authoritative for published state and write enforcement

## Storage Notes

- scene and asset data lives under `serverXR/data/spaces/<spaceId>/`
- project data lives under `serverXR/data/spaces/<spaceId>/projects/<projectId>/`
- temporary spaces auto-prune after about 30 days unless `SPACE_TTL_MS` overrides it
- uploaded assets stream directly from the API and preserve MIME type metadata
