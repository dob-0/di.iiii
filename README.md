# dii Platform

Web-based spatial editor platform built with React, Vite, Three.js, and a Node backend in `serverXR` for persistence, collaboration, assets, SSE, and presence.

Current development cycle:

- package version: `0.2.0`
- current release tag on `main`: `v0.1.0`
- runtime baseline: Node `22.x`

Latest project references:

- [Checkpoint 2026-04-09](/home/nnn/Desktop/dii_ii/docs/checkpoints/2026-04-09.md)
- [Checkpoint 2026-04-07](/home/nnn/Desktop/dii_ii/docs/checkpoints/2026-04-07.md)
- [Project Surfaces](/home/nnn/Desktop/dii_ii/docs/architecture/PROJECT_SURFACES.md)
- [V1 To Studio Parity](/home/nnn/Desktop/dii_ii/docs/roadmaps/V1_STUDIO_PARITY.md)

## Platform Status

This repo is one platform with four active surfaces:

- `V1 Legacy`: legacy editor fallback behind `/<space>` when no live project is published
- `Admin/Ops`: `/admin?space=<id>`
- `V2 Beta`: `/<space>/beta` with `/beta` as a `main`-space compatibility alias
- `Studio`: `/<space>/studio` with `/studio` as a `main`-space compatibility alias
- `serverXR`: backend under `/serverXR`

Current product direction:

- `Studio` is the main authoring surface for each space.
- `Beta` is the beta editor lane.
- `/<space>` is the public space route.
- Studio chooses which project is live for `/<space>`.
- `V1` stays as the legacy editor fallback and compatibility lane when a space has no live project yet.
- deploy and release truth should stay simpler than feature truth.

## Product Surfaces

### `V1 Legacy`

- routes like `/main` or `/my-space`
- legacy editor fallback
- still loads for a space when no live project is published yet
- supports objects, gizmos, local persistence, XR entry points, and server-backed collaboration

### `Public Space View`

- route: `/<space>`
- pure public viewer when that space has a live published project
- hides editor chrome and only shows presentation/XR entry controls
- reuses the published Studio project document for the live experience

### `Admin/Ops`

- route: `/admin?space=<id>`
- operator dashboard for links, scene signals, logs, preview, status, and debugging

### `V2 Beta`

- routes: `/<space>/beta` and `/beta` as a compatibility alias for `main`
- older project-based desktop editor
- beta editor lane
- kept available alongside Studio for experiments and alternate workflow validation

### `Studio`

- routes: `/<space>/studio` and `/studio` as a compatibility alias for `main`
- project-based main authoring workspace attached to a space
- cleaner long-term workspace direction
- uses the shared neutral project layer in `src/project/`
- can set or clear the live published project for its space

## Repo Map

- `src/App.jsx` - V1 legacy editor shell
- `src/RootApp.jsx` - top-level route switch
- `src/SpaceSurfaceApp.jsx` - decides whether `/<space>` should open the public viewer or legacy V1 fallback
- `src/components/` - shared desktop/mobile/admin UI
- `src/hooks/` - V1/editor orchestration and collaboration logic
- `src/project/` - canonical shared project model, sync, presence, import, and entity logic used by Beta and Studio
- `src/project/components/PublicProjectViewer.jsx` - minimal public-facing renderer for the live published project
- `src/beta/` - transitional Beta route/UI layer and compatibility wrappers
- `src/studio/` - Studio V3 route/UI layer
- `serverXR/` - backend app
- `shared/` - backend/runtime shared schemas
- `src/shared/` - frontend shared schemas
- `scripts/` - dev stack, deploy, smoke, checkpoint, and release tooling
- `docs/` - deployment, testing, architecture, checkpoints, and roadmap notes

## Requirements

- Node `22.x`
- npm `10.x`

Recommended local setup:

```bash
npm install
cd serverXR && npm install
```

Or use:

```bash
nvm use
```

This repo now includes [.nvmrc](/home/nnn/Desktop/dii_ii/.nvmrc) with the Node 22 baseline.

## Local Development

Run the full local stack from the repo root:

```bash
npm run dev
```

Useful local URLs:

- `http://localhost:5173/main` - public `main` space route, or legacy fallback when no live project is published
- `http://localhost:5173/admin?space=main` - admin/operator route
- `http://localhost:5173/main/beta` - main-space Beta hub
- `http://localhost:5173/beta` - compatibility alias for `main/beta`
- `http://localhost:5173/main/studio` - main-space Studio hub
- `http://localhost:5173/studio` - compatibility alias for `main/studio`
- `http://localhost:4000/serverXR/api/health` - backend health

Other useful scripts:

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

### V1

- `spaces` are the shared unit
- durable scene ops are authoritative
- SSE handles sync/catch-up
- Socket.IO handles presence only

### Project Editors

- `projects` are the editable unit inside a space
- durable project ops are authoritative
- SSE carries project document updates
- Socket.IO handles roster and cursors

Today that project model is used by:

- `Beta`
- `Studio`

Live publishing model:

- a space can point `publishedProjectId` at one Studio/Beta project
- `/<space>` opens the public viewer when that live project is set
- if no live project is set, `/<space>` falls back to the legacy V1 editor

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

More backend detail lives in [serverXR/README.md](/home/nnn/Desktop/dii_ii/serverXR/README.md).

## Deploy Truth

Canonical release model:

- `dev` = active work + staging source
- `main` = production source
- canonical publish workflow: [.github/workflows/publish-cpanel-prebuilt-v2.yml](/home/nnn/Desktop/dii_ii/.github/workflows/publish-cpanel-prebuilt-v2.yml)
- canonical server apply step: [scripts/cpanel-apply-prebuilt-release.sh](/home/nnn/Desktop/dii_ii/scripts/cpanel-apply-prebuilt-release.sh)
- canonical staged bundle: `.deploy/cpanel/`
- canonical deploy transport: GitHub + cPanel `Git Version Control`

Environment mapping:

- pushing `dev` publishes `cpanel-staging`
- pushing `main` publishes `cpanel-production`
- staging URL: `https://staging.di-studio.xyz`
- production URL: `https://di-studio.xyz`

Deploy notes:

- the canonical flow does not use SSH deploys
- GitHub Actions publishes the prebuilt `cpanel-*` branches
- cPanel `Git Version Control` should track those branches and run `.cpanel.yml`
- `.cpanel.yml` executes [scripts/cpanel-apply-prebuilt-release.sh](/home/nnn/Desktop/dii_ii/scripts/cpanel-apply-prebuilt-release.sh) on the host
- if a site looks stale after a push, check cPanel `Git Version Control` and run `Deploy HEAD Commit`
- `/serverXR` must stay owned by the cPanel Node.js App
- `public_html/` is frontend-only
- `shared/` and `SHARED_ROOT` are part of the runtime contract
- old SSH push docs still exist as legacy references, but they are not the primary path

Start here for deploy details:

- [docs/deploy/LIVE_DEPLOY.md](/home/nnn/Desktop/dii_ii/docs/deploy/LIVE_DEPLOY.md)
- [docs/deploy/CPANEL_PREBUILT_DEPLOY.md](/home/nnn/Desktop/dii_ii/docs/deploy/CPANEL_PREBUILT_DEPLOY.md)
- [docs/deploy/CPANEL_DEPLOYMENT.md](/home/nnn/Desktop/dii_ii/docs/deploy/CPANEL_DEPLOYMENT.md)

## Testing

Main checks:

```bash
npm run lint
npm run build
npm run test
```

Backend contract checks:

```bash
npm run test:server-contracts
```

Note:

- the backend contract tests bind to loopback ports, so they need an environment that allows local socket listen/bind
- if those tests fail with `listen EPERM 127.0.0.1`, treat that as an environment restriction first, not automatically as an app regression

## Current Roadmap

Now:

- keep docs, deploy truth, and runtime expectations aligned
- stabilize the shared project layer under `src/project/`
- keep Beta transitional
- keep V1 stable as the fallback/editor compatibility lane
- harden the new public viewer plus live-project publish flow

Next:

- reduce remaining Studio dependence on Beta-era naming and assumptions
- drive a real V1-to-Studio parity checklist
- keep releases and route ownership simpler than the feature set

Later:

- decide how much Beta should stay alive next to Studio
- keep V1 only as compatibility/import mode if still needed

## Known Focus Areas

- improve 2D / fixed-camera workflow
- unify settings management into a smarter operator/editor UI
- keep route naming, surface ownership, and deploy docs boring and clear

write me: `d0b@duck.com`
