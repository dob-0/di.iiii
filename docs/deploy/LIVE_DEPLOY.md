# Live Deploy Runbook

This is the shortest practical runbook for normal future work.

If you only remember one thing, remember this:

- `dev + staging` = work lane
- `main + production` = public lane

## Golden Path

- local work happens on `dev`
- staging is published from `dev`
- production is published from `main`
- GitHub publishes prebuilt `cpanel-*` branches
- cPanel `Git Version Control` applies those branches on the host

Canonical pieces:

- workflow:
  - [.github/workflows/publish-cpanel-prebuilt-v2.yml](/home/nnn/Desktop/dii_ii/.github/workflows/publish-cpanel-prebuilt-v2.yml)
- release bundle:
  - `.deploy/cpanel/`
- apply script:
  - [scripts/cpanel-apply-prebuilt-release.sh](/home/nnn/Desktop/dii_ii/scripts/cpanel-apply-prebuilt-release.sh)

## Daily Workflow

### To update staging

1. commit and push `dev`
2. GitHub automatically publishes `cpanel-staging`
3. in cPanel `Git Version Control`, update the staging clone if needed
4. run `Deploy HEAD Commit` for the staging clone if the host did not auto-apply
5. verify:
   - `/main`
   - `/<space>` for the space you are working on
   - `/admin?space=main`
   - `/main/studio`
   - `/main/beta`
   - `/serverXR/api/health`
   - `/serverXR/api/spaces`
   - assets
   - live sync

### To update production

1. merge or promote approved work into `main`
2. push `main`
3. GitHub automatically publishes `cpanel-production`
4. in cPanel `Git Version Control`, update the production clone if needed
5. run `Deploy HEAD Commit` for the production clone if the host did not auto-apply
6. verify production

## What Is Automatic Today

- GitHub-side prebuilt publish is automatic on pushes to `dev` and `main`
- the prebuilt branches are:
  - `cpanel-staging`
  - `cpanel-production`

## What May Still Be Manual

- if cPanel `Git Version Control` exposes `Automatic Deployment`, enable it for the tracked `cpanel-*` clones
- cPanel host apply is host-dependent
- if the live site looks stale after GitHub finished, go to cPanel `Git Version Control` and run `Deploy HEAD Commit`

## Runtime Contract

- `/serverXR` stays owned by the cPanel Node.js App
- frontend lives in the web root
- backend lives in `serverXR` or `serverXR-staging`
- shared schema files live outside the backend repo copy and must be pointed to with `SHARED_ROOT`
- staging and production do not automatically share media/content

Per environment keep these aligned:

- `APP_BASE_PATH=/serverXR`
- `DATA_ROOT=<environment specific>`
- `SHARED_ROOT=<environment specific>`
- `CORS_ORIGINS=<environment specific>`
- `API_TOKEN` and `VITE_API_TOKEN` must match

## Public Surfaces

- public app: `https://your-domain/`
- public/main route: `https://your-domain/main`
- public/space route: `https://your-domain/<space>`
- admin: `https://your-domain/admin?space=main`
- Studio: `https://your-domain/main/studio`
- Beta: `https://your-domain/main/beta`
- backend monitor: `https://your-domain/serverXR/`
- backend health: `https://your-domain/serverXR/api/health`

## First Checks If Something Breaks

1. `https://<host>/serverXR/api/health`
2. Passenger `.htaccess` inside the web-root `serverXR/` mount
3. backend `.env`
4. `DATA_ROOT` and `SHARED_ROOT`
5. browser console and network panel

## Legacy Fallbacks

These still exist, but they are not the default future path:

- [docs/deploy/CPANEL_GIT_PULL_DEPLOY.md](/home/nnn/Desktop/dii_ii/docs/deploy/CPANEL_GIT_PULL_DEPLOY.md)
- [docs/deploy/PM2_QUICK_GUIDE.md](/home/nnn/Desktop/dii_ii/docs/deploy/PM2_QUICK_GUIDE.md)
- legacy SSH-push workflows in `.github/workflows/`
