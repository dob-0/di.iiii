# Live Deploy Runbook

This is the shortest practical runbook for normal future work.

If you only remember one thing, remember this:

- `dev` = active development
- `staging` = stable preview
- `main` = production
- normal promotion path: `dev -> staging -> main`

## Golden Path

- local work happens on `dev`
- normal work starts on `dev`
- `staging` and `main` are promotion branches during normal flow
- reviewed work is promoted to `staging`
- staging is published from `staging`
- production is published from `main`
- GitHub publishes prebuilt `cpanel-*` branches
- cPanel `Git Version Control` applies those branches on the host

Do not start routine feature work on `main`.
Use `main` as a starting point only for an emergency production hotfix.

Canonical pieces:

- workflow:
  - [.github/workflows/publish-cpanel-prebuilt-v2.yml](../../.github/workflows/publish-cpanel-prebuilt-v2.yml)
- release bundle:
  - `.deploy/cpanel/`
- apply script:
  - [scripts/cpanel-apply-prebuilt-release.sh](../../scripts/cpanel-apply-prebuilt-release.sh)

## Daily Workflow

Typical start-of-session commands:

```bash
git switch dev
git pull --ff-only origin dev
npm run dev
```

### To update staging

1. commit and push `dev` normally while you work
2. promote the approved commit from `dev` to `staging`
3. push `staging`
4. GitHub automatically publishes `cpanel-staging`
5. in cPanel `Git Version Control`, update the staging clone if needed
6. run `Deploy HEAD Commit` for the staging clone if the host did not auto-apply
7. verify:
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

1. promote the already verified `staging` commit into `main`
2. push `main`
3. GitHub automatically publishes `cpanel-production`
4. in cPanel `Git Version Control`, update the production clone if needed
5. run `Deploy HEAD Commit` for the production clone if the host did not auto-apply
6. verify production

### Promotion Commands

Use fast-forward promotions when the branches are still linear:

```bash
git switch staging
git merge --ff-only dev
git push origin staging

git switch main
git merge --ff-only staging
git push origin main
```

If a fast-forward is not possible, stop and cherry-pick or rebase the exact approved commit instead of creating a merge you did not mean to ship.

## What Is Automatic Today

- GitHub-side prebuilt publish is automatic on pushes to `staging` and `main`
- the prebuilt branches are:
  - `cpanel-staging`
  - `cpanel-production`
- `workflow_dispatch` exists for repair or recovery work, but it should not replace the normal `dev -> staging -> main` promotion flow

## Emergency Hotfix Path

When production needs an urgent fix, start from `main`, then bring the same commit back into `staging` and `dev` so the branches do not drift apart.

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

These docs still exist for emergency use, but they are not the default future path:

- [docs/deploy/legacy/README.md](legacy/README.md)
- [docs/deploy/legacy/CPANEL_GIT_PULL_DEPLOY.md](legacy/CPANEL_GIT_PULL_DEPLOY.md)
- [docs/deploy/legacy/PM2_QUICK_GUIDE.md](legacy/PM2_QUICK_GUIDE.md)

The old legacy SSH-push GitHub workflows were removed on purpose so the Actions page reflects the real path in use.
