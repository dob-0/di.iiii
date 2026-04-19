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
- [Live Deploy Runbook](docs/deploy/LIVE_DEPLOY.md)
- [cPanel Prebuilt Deploy](docs/deploy/CPANEL_PREBUILT_DEPLOY.md)
- [Project Surfaces](docs/architecture/PROJECT_SURFACES.md)
- [Recursive Node Core](docs/architecture/RECURSIVE_NODE_CORE.md)
- [Private Dev And Public Showcase Workflow](docs/ops/PRIVATE_DEV_PUBLIC_SHOWCASE.md)

## Current Health

Verified on `2026-04-17`:

- `npm run lint` passed
- `npm run build` passed
- `npm run test` passed
- `npm run test:server-contracts` passed

Operational truth:

- normal work starts on `dev`
- `npm run deploy:staging` is the laptop command for staging promotion on the current host
- `npm run deploy:production` is the laptop command for production promotion after staging is approved
- GitHub publishes the `cpanel-*` branches and cPanel cron applies them automatically on the current shared host

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
- `/serverXR` stays owned by the cPanel Node.js App in both staging and production

## Platform Surfaces

This platform currently has six active surfaces:

- `Local Blank Workspace`
    - route: `/`
    - opens the blank white recursive node workspace
    - local/bootstrap authoring surface before choosing a saved space project

- `Public Space View`
    - route: `/<space>`
    - shows the live published project for a space
    - opens the blank recursive node workspace when no live project is published
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
    - compatibility/history editor code path
    - kept for migration and old scene support, not the default no-published-space route

Current direction:

- `/` is now the clean node-first starting surface
- `/<space>` without a published project now starts from the same node-first workspace
- Studio is the stable main product lane
- Beta is the active experimental/v2 lane and the current home of the recursive node editor
- V1 remains the compatibility and migration lane
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

## Recursive Node Core

This is the long-term concept that new work should follow.

Canonical rule:

- everything is a node
- the desk is a node
- floating UI is also nodes, just mounted in `view`
- world settings are nodes like `world.color`, `world.light`, `world.grid`, and `world.camera`
- authored panels are nodes like `view.panel`, `view.inspector`, `view.assets`, `view.browser`
- content and runtime are nodes like `geom.cube`, `app.browser`, `script.js`, `script.py`, `asset.image`, `asset.video`, and `asset.model`

The canonical project document now aims at:

- `rootNodeId`
- `nodes[]`
- `edges[]`
- `assets[]`
- `templates[]`
- `workspaceState`

The root graph always begins with two root surfaces:

- `world.root`
- `view.root`

Default blank start:

- white world
- white view layer
- no authored panels
- no geometry
- authoring begins by double-clicking and creating nodes

Primary authoring gesture:

- double-click in the 3D world -> create a world node
- double-click in the 2D view -> create a view node

Important implementation note for future work:

- `src/shared/projectSchema.js` is the source of truth for the recursive node document shape
- legacy `worldState` and `windowLayout` still exist only as compatibility mirrors for older surfaces
- new behavior should prefer node definitions and node ops over adding more permanent logic to the V1 object/window model

Current implementation status:

- `/` opens the blank local node workspace
- Beta contains the first real recursive node editor surface
- `/<space>` opens a published project when one exists, otherwise it starts a blank node workspace for that space
- Studio and V1 are not fully node-native yet, so bridge code is still present on purpose

## Repo Map

- `src/RootApp.jsx`
    - top-level route switch
- `src/SpaceSurfaceApp.jsx`
    - chooses blank node workspace, public viewer, or legacy preferences shell
- `src/components/`
    - shared desktop/mobile/admin UI
- `src/hooks/`
    - app orchestration, spaces UI, V1 logic
- `src/project/`
    - shared project model used by Studio and Beta
- `src/project/nodeRegistry.js`
    - node definitions for the recursive editor
- `src/project/components/PublicProjectViewer.jsx`
    - live public viewer
- `src/studio/`
    - Studio route/UI layer
- `src/beta/`
    - Beta route/UI layer and current recursive node workspace
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

Typical start-of-session commands:

```bash
git switch dev
git pull --ff-only origin dev
npm run dev
```

Useful local URLs:

- `http://localhost:5173/`
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
- otherwise `/<space>` opens the blank recursive node workspace for that space

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

Simple model:

- write code on `dev`
- promote preview-ready code to `staging`
- promote staging-verified code to `main`
- GitHub builds deploy artifacts
- cPanel applies those artifacts to the host

### One-command deploy shortcuts

Normal commands from the repo root on the current host:

```bash
npm run deploy:status
npm run deploy:staging
npm run deploy:production
npm run deploy -- smoke staging
npm run deploy -- smoke production
```

Host-only recovery commands:

```bash
npm run deploy -- host staging
npm run deploy -- host production
```

Important rules:

- `dev` is integration only and does not deploy to hosting directly
- run `deploy:dev` and `deploy:staging` from a clean `dev` branch
- `deploy:production` fast-forwards `main` to `origin/staging` when possible, or creates a merge commit on top of `main` that prefers `staging` on conflicting hunks when the branches have both moved
- `deploy:host:*` is for the matching cPanel clone or host shell, not your laptop
- `deploy:remote:*` exists only for future SSH-capable hosts and is not part of the current shared-host flow
- use `npm run deploy -- smoke staging` or `npm run deploy -- smoke production` to verify quickly

Current hosting flow:

```bash
npm run deploy:staging
# wait about 1-2 minutes for GitHub publish + cPanel cron apply
curl -s https://staging.di-studio.xyz/serverXR/api/health

npm run deploy:production
# wait about 1-2 minutes for GitHub publish + cPanel cron apply
curl -s https://di-studio.xyz/serverXR/api/health
```

### Auto deploy on this host

This host does not allow SSH, so true laptop-to-server push deploy is not available.

The closest automatic flow is:

1. push `staging` or `main` from your laptop
2. GitHub publishes `cpanel-staging` or `cpanel-production`
3. cPanel auto-applies that branch by cron

Host-side poll/apply command:

```bash
cd /home/distudio/repositories/di.iiii-staging
bash scripts/cpanel-poll-deploy.sh staging
```

```bash
cd /home/distudio/repositories/di.iiii-production
bash scripts/cpanel-poll-deploy.sh production
```

Recommended cPanel Cron Jobs:

```cron
*/2 * * * * cd /home/distudio/repositories/di.iiii-staging && bash scripts/cpanel-poll-deploy.sh staging >> /home/distudio/logs/staging-auto-deploy.log 2>&1
*/2 * * * * cd /home/distudio/repositories/di.iiii-production && bash scripts/cpanel-poll-deploy.sh production >> /home/distudio/logs/production-auto-deploy.log 2>&1
```

That gives you near-automatic deploys from git without logging into cPanel every time.

Use cPanel `Terminal` only for:

- first-time bootstrap
- cron setup
- recovery when a cPanel clone diverges
- manual host apply if cron is paused

Branch mapping:

- `staging` source branch publishes `cpanel-staging`
- `main` source branch publishes `cpanel-production`
- `dev` does not deploy directly

### Fast path

Use this when you are on `dev`, the change is committed, and you want the simplest real deploy path:

1. Ship the current `dev` commit to staging:

```bash
npm run deploy:staging
```

2. Wait about 1-2 minutes, then verify staging:

```bash
curl -s https://staging.di-studio.xyz/serverXR/api/health
npm run smoke:cpanel -- --base-url https://staging.di-studio.xyz
```

3. After staging passes, ship production:

```bash
npm run deploy:production
```

4. Wait about 1-2 minutes, then verify production:

```bash
curl -s https://di-studio.xyz/serverXR/api/health
npm run smoke:cpanel -- --base-url https://di-studio.xyz
```

Current automation note:

- pushing `staging` already auto-builds the deploy artifact
- the live cPanel apply step is still manual unless cPanel auto-deploy/webhook or a GitHub
  Actions SSH deploy secret is configured
- the safest current workflow is automatic build plus the short server apply command above

### Full workflow circle

Use this when you make a fix, test it, put it on staging, verify it, then ship it to production.

Start clean and sync `dev`:

```bash
git status --short --branch
git fetch origin
git switch dev
git pull --ff-only origin dev
```

Make your code change, then test locally:

```bash
npm run lint
npm run build
npm run test
npm run test:server-contracts
```

Commit and push the fix to `dev`:

```bash
git status --short
git add <changed-files>
git commit -m "fix: short clear description"
git push origin dev
```

Promote the exact tested `dev` commit to staging:

```bash
git switch staging
git pull --ff-only origin staging
git merge --ff-only dev
git push origin staging
```

Wait for GitHub Actions to publish `cpanel-staging`, then confirm the cPanel artifact exists:

```bash
git fetch origin cpanel-staging
git log -1 --oneline origin/cpanel-staging
git show origin/cpanel-staging:.deploy/cpanel/release.json
```

Apply staging in cPanel:

```text
cPanel -> Git Version Control -> /home/distudio/repositories/di.iiii-staging
Click Update from Remote
Confirm branch is cpanel-staging
Click Deploy HEAD Commit
```

If the cPanel button does not apply the release, use SSH:

```bash
cd /home/distudio/repositories/di.iiii-staging
git pull --ff-only origin cpanel-staging
bash scripts/cpanel-apply-prebuilt-release.sh staging
```

Verify staging:

```bash
curl -s https://staging.di-studio.xyz/serverXR/api/health
npm run smoke:cpanel -- --base-url https://staging.di-studio.xyz
```

The staging health response must show:

```json
{
    "release": {
        "deployEnv": "staging",
        "sourceRef": "staging",
        "gitCommit": "<the staging source commit>"
    }
}
```

Only after staging is verified, promote the staging branch to production:

```bash
npm run deploy:production
```

Wait for GitHub Actions to publish `cpanel-production`, then confirm the production artifact exists:

```bash
git fetch origin cpanel-production
git log -1 --oneline origin/cpanel-production
git show origin/cpanel-production:.deploy/cpanel/release.json
```

Apply production in cPanel:

```text
cPanel -> Git Version Control -> production cPanel repo tracking cpanel-production
Click Update from Remote
Confirm branch is cpanel-production
Click Deploy HEAD Commit
```

If the production cPanel button does not apply the release, use SSH and adjust the repo path if cPanel shows a different production clone path:

```bash
cd /home/distudio/repositories/di.iiii-production
git pull --ff-only origin cpanel-production
bash scripts/cpanel-apply-prebuilt-release.sh production
```

Verify production:

```bash
curl -s https://di-studio.xyz/serverXR/api/health
npm run smoke:cpanel -- --base-url https://di-studio.xyz
```

Stop rules:

- if `git status --short` shows unexpected changes, stop and inspect before switching branches
- if any `git pull --ff-only` or `git merge --ff-only` fails, stop and decide whether to rebase or cherry-pick
- if staging verification fails, do not promote to `main`
- if cPanel says branches diverged, use the recovery steps below before deploying

### Easy staging deploy

Use this when you want to update `https://staging.di-studio.xyz`.

1. Promote the approved source code:

```bash
git switch staging
git pull --ff-only origin staging
git merge --ff-only dev
git push origin staging
```

2. Wait for GitHub Actions to publish `cpanel-staging`.

3. In cPanel `Git Version Control`, open the staging repo:

```text
/home/distudio/repositories/di.iiii-staging
```

4. Click `Update from Remote`.

5. Confirm the checked-out branch is `cpanel-staging` and the HEAD commit changed to the latest published cPanel commit.

6. Click `Deploy HEAD Commit`.

7. Verify the deployed backend reports the same source commit as `origin/staging`:

```bash
curl -s https://staging.di-studio.xyz/serverXR/api/health
npm run smoke:cpanel -- --base-url https://staging.di-studio.xyz
```

The health JSON should include:

```json
{
    "release": {
        "deployEnv": "staging",
        "sourceRef": "staging",
        "gitCommit": "<current staging source commit>"
    }
}
```

### Easy production deploy

Use this only after staging is verified.

```bash
npm run deploy:production
```

Then in cPanel `Git Version Control`, open the production repo tracking `cpanel-production`, click `Update from Remote`, then `Deploy HEAD Commit`.

Verify:

```bash
curl -s https://di-studio.xyz/serverXR/api/health
npm run smoke:cpanel -- --base-url https://di-studio.xyz
```

### If cPanel says branches diverged

This is a recovery path for a cPanel clone that is stuck on an older artifact commit. Do not click `Deploy HEAD Commit` while cPanel is still on the old commit.

For staging, run this in cPanel Terminal or SSH:

```bash
cd /home/distudio/repositories/di.iiii-staging
git status --short
git branch backup-cpanel-staging-before-reset-$(date +%Y%m%d-%H%M%S)
git fetch origin cpanel-staging
git reset --hard origin/cpanel-staging
git status --short
git log -1 --oneline
```

Then refresh cPanel `Git Version Control` and click `Deploy HEAD Commit`.

For production, use the production cPanel clone and replace `cpanel-staging` with `cpanel-production`.

### Deploy pieces

- workflow: `.github/workflows/publish-cpanel-prebuilt-v2.yml`
- staged bundle: `.deploy/cpanel/`
- host apply script: `scripts/cpanel-apply-prebuilt-release.sh`

`deploy:production` will refuse to roll `main` back if `staging` is behind. If the helper cannot merge `staging` into `main` even with staging-preferred conflict resolution, stop and resolve the drift before shipping.

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
