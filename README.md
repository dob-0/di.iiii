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

Simple model:

- write code on `dev`
- promote preview-ready code to `staging`
- promote staging-verified code to `main`
- GitHub builds deploy artifacts
- cPanel applies those artifacts to the host

### One-command deploy shortcuts

From the repo root:

```bash
npm run deploy:status
npm run deploy:dev
npm run deploy:staging
npm run deploy:production
npm run deploy:host:staging
npm run deploy:host:production
npm run deploy:remote:staging
npm run deploy:remote:production
```

Or use the single helper directly:

```bash
npm run deploy -- status
npm run deploy -- staging
npm run deploy -- production
npm run deploy -- host staging
npm run deploy -- host production
npm run deploy -- remote staging
npm run deploy -- remote production
```

Important rules:

- `dev` is integration only and does not deploy to hosting directly
- run `deploy:dev` and `deploy:staging` from a clean `dev` branch
- `deploy:production` promotes the exact current `origin/staging` commit into `main`
- `deploy:host:*` is for the matching cPanel clone or host shell, not your laptop
- `deploy:remote:*` is the laptop command and SSHes into the cPanel host for you
- use `npm run deploy -- smoke staging` or `npm run deploy -- smoke production` to verify quickly

Laptop remote defaults:

- SSH target: `distudio@di-studio.xyz`
- staging repo: `/home/distudio/repositories/di.iiii-staging`
- production repo: `/home/distudio/repositories/di.iiii-production`

Override them if needed:

```bash
DEPLOY_SSH_TARGET=your-user@your-host npm run deploy:remote:staging
DEPLOY_REMOTE_STAGING_REPO=/some/other/path npm run deploy:remote:staging
DEPLOY_REMOTE_PRODUCTION_REPO=/some/other/path npm run deploy:remote:production
```

Branch mapping:

- `staging` source branch publishes `cpanel-staging`
- `main` source branch publishes `cpanel-production`
- `dev` does not deploy directly

### Fast path

Use this when you are on `dev`, the change is committed, and you want to test the same
commit on the real staging phone URL.

1. Push current `dev` commit to GitHub staging:

```bash
git push origin HEAD:dev HEAD:staging
```

GitHub Actions automatically builds and publishes `cpanel-staging`.

2. Apply the new staging artifact on the server:

```bash
cd /home/distudio/repositories/di.iiii-staging
git pull --ff-only origin cpanel-staging
bash scripts/cpanel-apply-prebuilt-release.sh staging
```

3. Check real staging on desktop and mobile:

```bash
curl -s https://staging.di-studio.xyz/serverXR/api/health
npm run smoke:cpanel -- --base-url https://staging.di-studio.xyz
```

4. After staging passes, promote that exact staging commit to production:

```bash
git fetch origin staging
git push origin FETCH_HEAD:main
```

GitHub Actions automatically builds and publishes `cpanel-production`. Apply it in the
production cPanel clone, then verify `https://di-studio.xyz`.

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

Only after staging is verified, promote the same commit to production:

```bash
git switch main
git pull --ff-only origin main
git merge --ff-only staging
git push origin main
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
git switch main
git pull --ff-only origin main
git merge --ff-only staging
git push origin main
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

If `--ff-only` fails during source promotion, stop and either rebase or cherry-pick the exact approved commit instead of forcing a merge you do not trust.

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
