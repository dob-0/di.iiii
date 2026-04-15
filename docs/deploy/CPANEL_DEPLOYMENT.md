# cPanel Deployment Guide

This file describes the current safe deployment model for the dii platform.

## Canonical Model

- source branches:
  - `dev` for active development
  - `staging` for stable preview
  - `main` for production
- canonical publish workflow:
  - [.github/workflows/publish-cpanel-prebuilt-v2.yml](../../.github/workflows/publish-cpanel-prebuilt-v2.yml)
- canonical server apply step:
  - [scripts/cpanel-apply-prebuilt-release.sh](../../scripts/cpanel-apply-prebuilt-release.sh)
- runtime baseline:
  - Node `22.x`

Important:

- both environments use cPanel `Setup Node.js App`
- `/serverXR` must be owned by the Node.js App, not by a static proxy directory
- the canonical path is GitHub + cPanel `Git Version Control`
- legacy/manual fallback material is archived under [docs/deploy/legacy/README.md](legacy/README.md)
- normal work starts on `dev`
- `staging` and `main` are promotion branches except during emergency hotfixes

## One-Time Setup

### 1. Create the staging subdomain

In cPanel:

1. Open `Domains`
2. Create `staging.di-studio.xyz`
3. note the document root cPanel creates for it

### 2. Create the Node.js apps

In `Setup Node.js App`, create:

- production
  - app root: `serverXR`
  - application URL: `/serverXR`
  - startup file: `src/index.js`
- staging
  - app root: `serverXR-staging`
  - application URL: `/serverXR`
  - startup file: `src/index.js`

### 3. Create sibling shared folders

Create once:

```text
/home/distudio/shared
/home/distudio/shared-staging
```

## GitHub / cPanel Mapping

GitHub publish branches:

- `cpanel-staging`
- `cpanel-production`

cPanel-managed clones:

- staging should track `cpanel-staging`
- production should track `cpanel-production`

## Required Server Config

Keep the real deploy config on the server, not in the repo.

Expected settings include:

- `VITE_API_BASE_URL=/serverXR`
- `NODE_ENV=production`
- `APP_BASE_PATH=/serverXR`
- `DATA_ROOT=<environment specific>`
- `SHARED_ROOT=<environment specific>`
- `CPANEL_WEB_ROOT=<environment specific>`
- `CPANEL_SERVERXR_ROOT=<environment specific>`
- `CPANEL_SHARED_ROOT=<environment specific>`

Recommended roots:

- production
  - `CPANEL_SERVERXR_ROOT=/home/distudio/serverXR`
  - `CPANEL_SHARED_ROOT=/home/distudio/shared`
- staging
  - `CPANEL_SERVERXR_ROOT=/home/distudio/serverXR-staging`
  - `CPANEL_SHARED_ROOT=/home/distudio/shared-staging`

## Release Flow

### Staging

1. Promote the approved source commit:

```bash
git switch staging
git pull --ff-only origin staging
git merge --ff-only dev
git push origin staging
```

2. Wait for GitHub Actions to publish `cpanel-staging`.

3. In cPanel `Git Version Control`, open:

```text
/home/distudio/repositories/di.iiii-staging
```

4. Click `Update from Remote`.

5. Confirm the checked-out branch is `cpanel-staging`.

6. Click `Deploy HEAD Commit`.

7. Verify staging:

```bash
curl -s https://staging.di-studio.xyz/serverXR/api/health
npm run smoke:cpanel -- --base-url https://staging.di-studio.xyz
```

### Production

1. Promote the staging-verified source commit:

```bash
git switch main
git pull --ff-only origin main
git merge --ff-only staging
git push origin main
```

2. Wait for GitHub Actions to publish `cpanel-production`.

3. In cPanel `Git Version Control`, open the production clone.

4. Click `Update from Remote`.

5. Confirm the checked-out branch is `cpanel-production`.

6. Click `Deploy HEAD Commit`.

7. Verify production:

```bash
curl -s https://di-studio.xyz/serverXR/api/health
npm run smoke:cpanel -- --base-url https://di-studio.xyz
```

## Automatic Behavior

- GitHub-side publish is automatic on pushes to `staging` and `main`
- if cPanel `Git Version Control` exposes `Automatic Deployment`, enable it on the tracked `cpanel-staging` and `cpanel-production` clones
- cPanel-side apply may still require `Deploy HEAD Commit`, depending on host behavior

## Expected Checks

- `https://staging.di-studio.xyz/`
- `https://staging.di-studio.xyz/admin?space=main`
- `https://staging.di-studio.xyz/studio`
- `https://staging.di-studio.xyz/serverXR/api/health`
- asset upload/readback
- collaboration routes

## Troubleshooting

### `/serverXR/` shows directory listing or HTML fallback

That means the web root is still serving a static folder instead of the Node.js app. Fix the cPanel Node.js App mapping and remove legacy proxy leftovers.

### `/serverXR/api/health` fails

Check:

- the Node.js app is started
- backend `.env` exists
- `API_TOKEN`, `DATA_ROOT`, `SHARED_ROOT`, and `CORS_ORIGINS` are valid
- dependencies are installed in the app root
- the Passenger `.htaccess` inside the web-root `serverXR/` mount still points at the correct app root

### cPanel says branches diverged

If `Update from Remote` says `Diverging branches can't be fast-forwarded` or `Not possible to fast-forward`, do not deploy the old HEAD.

Reset the cPanel clone to the remote artifact branch so it matches GitHub exactly, then deploy.

For staging:

```bash
cd /home/distudio/repositories/di.iiii-staging
git status --short
git branch backup-cpanel-staging-before-reset-$(date +%Y%m%d-%H%M%S)
git fetch origin cpanel-staging
git reset --hard origin/cpanel-staging
git status --short
git log -1 --oneline
```

Then refresh cPanel `Git Version Control`, confirm the clone is on `cpanel-staging`, and click `Deploy HEAD Commit`.

For production, use the production clone and replace `cpanel-staging` with `cpanel-production`.

### Live site is healthy but stale

Compare the live backend release metadata with the expected source branch:

```bash
git rev-parse --short origin/staging
curl -s https://staging.di-studio.xyz/serverXR/api/health
```

If the live `release.gitCommit` is older than `origin/staging`, the missing step is cPanel deploy or Node.js app restart, not source promotion.
