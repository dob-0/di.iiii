# dii Platform

Web-based spatial editor platform built with React, Vite, Three.js, and a Node backend in `serverXR` for persistence, assets, SSE, presence, and deploy-time runtime wiring.

Current baseline:

- package version: `0.2.0`
- runtime baseline: Node `22.x`
- integration branch: `dev`
- stable preview branch: `staging`
- production branch: `main`

Start here:

- [Checkpoint 2026-04-09](docs/checkpoints/2026-04-09.md)
- [Project Audit And Growth Plan 2026-04-17](docs/architecture/PROJECT_AUDIT_2026-04-17.md)
- [Project Surfaces](docs/architecture/PROJECT_SURFACES.md)

## Current Health

Verified on `2026-04-17`:

- `npm run lint` passed
- `npm run build` passed
- `npm run test` passed
- `npm run test:server-contracts` passed

Operational truth:

- normal work starts on `dev`

## Current Truth

This repo is easiest to understand as three branches:

- `dev` = active development and integration, and the normal place to start work
- `staging` = stable preview and promotion lane
- `main` = production and public lane, and promotion-only except for urgent hotfixes

Normal promotion path:

- `dev -> staging -> main`

Emergency hotfix path:

- `main -> staging + dev`

That model matters more than any old deploy note or spare workflow file.

Simple rule:

- start normal work on `dev`
- promote into `staging` only after local checks pass
- promote into `main` only after staging is verified
- start on `main` only when production needs an emergency hotfix

Also keep these boundaries in mind:

- code is promoted between environments
- scene data and uploaded assets are not automatically shared between environments
- `/serverXR` stays owned by the Node.js App in both staging and production

## Platform Surfaces

This platform currently has five active surfaces:

- `Public Space View`
    - route: `/<space>`
    - shows the live published project for a space
    - falls back to V1 when no live project is published
- `Studio`
    - route: `/<space>/studio`
    - compatibility alias: `/studio` for `main`
    - stable main authoring surface
- `Beta`
    - route: `/<space>/beta`
    - compatibility alias: `/beta` for `main`
    - active experimental/v2 lane kept alongside Studio
- `Admin/Ops`
    - route: `/admin?space=<space>`
    - operator/debugging surface
- `V1 Legacy`
    - route: `/<space>` when no live project is published
    - fallback/history editor and compatibility lane

Current direction:

- Studio is the stable main product lane
- Beta is the active experimental/v2 lane
- V1 remains the compatibility and fallback lane
- public routes should stay simple even if the editor model grows

## Space Model

Spaces are first-class now.

Each space can have:

- a public route: `/<space>`
- a Studio route: `/<space>/studio`
- a Beta route: `/<space>/beta`
- an Admin route: `/admin?space=<space>`

Management capabilities now available in the work lane:

- create spaces
- open newly created spaces directly in `Public`, `Studio`, `Beta`, or `Admin`
- rename space labels without changing the space ID/URL
- delete spaces
- create and delete projects inside a space
- publish or clear a live project for a space

Important nuance:

- the space ID controls the URL
- the label is safe to rename
- Studio/Beta now treat the route space as authoritative
- if a project request hits a missing space, the client can auto-provision that space and retry

## Repo Map

- `src/RootApp.jsx`
    - top-level route switch
- `src/SpaceSurfaceApp.jsx`
    - chooses public viewer vs V1 fallback for `/<space>`
- `src/components/`
    - shared desktop/mobile/admin UI
- `src/hooks/`
    - app orchestration, spaces UI, V1 logic
- `src/project/`
    - shared project model used by Studio and Beta
- `src/project/components/PublicProjectViewer.jsx`
    - live public viewer
- `src/studio/`
    - Studio route/UI layer
- `src/beta/`
    - Beta route/UI layer
- `serverXR/`
    - backend app
- `shared/`
    - backend/shared schemas used by runtime
- `src/shared/`
    - frontend/shared schemas
- `scripts/`
    - dev stack tooling
- `docs/`
    - checkpoints, deploy notes, testing, and architecture docs

## Requirements

- Node `22.x`
- npm `10.x`

Recommended setup:

```bash
nvm use
npm install
cd serverXR && npm install
```

This repo includes `.nvmrc` with the Node 22 baseline.

## Local Development

Run the full stack from the repo root:

```bash
npm run dev
```

Typical start-of-session commands:

```bash
git switch dev
git pull --ff-only origin dev
npm run dev
```

Useful local URLs:

- `http://localhost:5173/main`
- `http://localhost:5173/main/studio`
- `http://localhost:5173/main/beta`
- `http://localhost:5173/admin?space=main`
- `http://localhost:4000/serverXR/api/health`

Useful scripts:

```bash
npm run dev:client
npm run dev:server
npm run build
npm run lint
npm run test
npm run test:server-contracts
```

## Collaboration Model

There are two collaboration models in the repo.

### V1

- `spaces` are the authoritative shared unit
- durable scene ops are authoritative
- SSE handles sync and catch-up
- Socket.IO handles presence only

### Studio/Beta Project Model

- `projects` are the editable unit inside a space
- durable project ops are authoritative
- SSE carries project document updates
- Socket.IO handles roster and cursors
- a space can point `publishedProjectId` at one live project
- `/<space>` opens the public viewer when a live project exists
- otherwise `/<space>` falls back to V1

## ServerXR

`serverXR` handles:

- spaces
- scenes
- project documents
- assets
- ops history
- SSE streams
- Socket.IO presence/cursors
- auth and edit locks

Important environment variables:

- `PORT`
- `APP_BASE_PATH`
- `DATA_ROOT`
- `SHARED_ROOT`
- `API_TOKEN`
- `REQUIRE_AUTH`
- `CORS_ORIGINS`
- `MAX_UPLOAD_MB`

More detail lives in [serverXR/README.md](serverXR/README.md).

## Deploy Infrastructure

Deploy infrastructure (cPanel scripts, workflows, and runbooks) has moved to a separate private repository.

## Testing

Main checks:

```bash
npm run lint
npm run build
npm run test
npm run test:server-contracts
```

Note:

- backend contract tests bind to loopback ports
- if they fail with `listen EPERM 127.0.0.1`, treat that as an environment restriction first

## Current Development Focus

Now:

- keep per-space routes and management flows predictable
- keep Studio/Beta/public routes aligned
- keep runtime path assumptions explicit with `DATA_ROOT` and `SHARED_ROOT`

Next:

- improve management UX around spaces and projects
- reduce remaining Beta-era assumptions in Studio
- keep V1 compatibility without letting it define the whole product

## Contact

write me: `d0b@duck.com`
