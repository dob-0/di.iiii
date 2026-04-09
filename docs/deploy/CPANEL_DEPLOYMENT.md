# cPanel Deployment Guide

This file describes the current safe deployment model for the dii platform.

## Canonical Model

- source branches:
  - `dev` for staging
  - `main` for production
- canonical publish workflow:
  - [.github/workflows/publish-cpanel-prebuilt-v2.yml](/home/nnn/Desktop/dii_ii/.github/workflows/publish-cpanel-prebuilt-v2.yml)
- canonical server apply step:
  - [scripts/cpanel-apply-prebuilt-release.sh](/home/nnn/Desktop/dii_ii/scripts/cpanel-apply-prebuilt-release.sh)
- runtime baseline:
  - Node `22.x`

Important:

- both environments use cPanel `Setup Node.js App`
- `/serverXR` must be owned by the Node.js App, not by a static proxy directory
- the canonical path is GitHub + cPanel `Git Version Control`
- the old SSH-push workflows are legacy fallbacks, not the primary path

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

1. merge approved work into `dev`
2. push `dev`
3. let GitHub publish `cpanel-staging`
4. in cPanel `Git Version Control`, update and deploy `HEAD` if needed
5. verify staging smoke checks and real editor flows

### Production

1. promote the approved commit into `main`
2. push `main`
3. let GitHub publish `cpanel-production`
4. in cPanel `Git Version Control`, update and deploy `HEAD` if needed
5. verify production smoke checks

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
