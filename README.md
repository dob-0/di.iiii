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
- [Live Deploy Runbook](docs/deploy/LIVE_DEPLOY.md)
- [cPanel Prebuilt Deploy](docs/deploy/CPANEL_PREBUILT_DEPLOY.md)
- [Project Surfaces](docs/architecture/PROJECT_SURFACES.md)

## Current Truth

This repo is easiest to understand as three branches:

- `dev` = active development and integration
- `staging` = stable preview and showcase lane
- `main` = production and public lane

Normal promotion path:

- `dev -> staging -> main`

Emergency hotfix path:

- `main -> staging + dev`

That model matters more than any old deploy note or spare workflow file.

Also keep these boundaries in mind:

- code is promoted between environments
- scene data and uploaded assets are not automatically shared between environments
- `/serverXR` stays owned by the cPanel Node.js App in both staging and production

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
  - dev stack, deploy, smoke, checkpoint, and release tooling
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
npm run smoke:cpanel -- --base-url https://staging.di-studio.xyz
npm run checkpoint -- --environment staging --note "checkpoint note"
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

## Deploy Workflow

Canonical deploy model:

- `staging` publishes `cpanel-staging`
- `main` publishes `cpanel-production`
- `dev` is the integration branch and does not auto-deploy
- GitHub Actions builds and publishes the prebuilt branch
- cPanel `Git Version Control` applies that branch on the host
- `.cpanel.yml` runs `scripts/cpanel-apply-prebuilt-release.sh`

Canonical pieces:

- workflow: `.github/workflows/publish-cpanel-prebuilt-v2.yml`
- staged bundle: `.deploy/cpanel/`
- host apply script: `scripts/cpanel-apply-prebuilt-release.sh`

What is automatic:

- pushing `staging` publishes `cpanel-staging`
- pushing `main` publishes `cpanel-production`

What may still be manual:

- cPanel host apply
- if the host does not auto-apply, open cPanel `Git Version Control` and run `Deploy HEAD Commit`

Golden future path:

1. work locally on `dev`
2. push `dev` while integrating normally
3. promote approved work from `dev` to `staging`
4. push `staging` and verify staging
5. promote the verified staging commit to `main`
6. push `main` and verify production

Preferred promotion commands:

```bash
git switch staging
git merge --ff-only dev
git push origin staging

git switch main
git merge --ff-only staging
git push origin main
```

If `--ff-only` fails because the branches diverged, stop and either rebase or cherry-pick the exact approved commit instead of forcing a merge you do not trust.

Important runtime rules:

- do not delete the web-root `serverXR/` mount directory
- do not replace Passenger with PM2 unless there is a host emergency
- `SHARED_ROOT` is part of the runtime contract
- staging and production content stay separate unless you intentionally sync them

Emergency-only fallback material is archived under `docs/deploy/legacy/` and `legacy/`.

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

- keep deploy truth boring and stable
- keep per-space routes and management flows predictable
- keep Studio/Beta/public routes aligned
- keep runtime path assumptions explicit with `DATA_ROOT` and `SHARED_ROOT`

Next:

- improve management UX around spaces and projects
- reduce remaining Beta-era assumptions in Studio
- keep V1 compatibility without letting it define the whole product

## Contact

write me: `d0b@duck.com`
