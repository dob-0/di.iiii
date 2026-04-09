# cPanel Git Pull Deploy

This is the fallback build-on-host cPanel path.

Use it only when:

- GitHub Actions cannot push artifacts to the host
- the hosting account only exposes cPanel `Git Version Control` and a web terminal

The canonical path is still the prebuilt publish/apply model documented in:

- [docs/deploy/CPANEL_PREBUILT_DEPLOY.md](/home/nnn/Desktop/dii_ii/docs/deploy/CPANEL_PREBUILT_DEPLOY.md)

## What This Mode Means

- cPanel `Git Version Control` updates a local clone on the host
- `.cpanel.yml` runs the host-side script [scripts/cpanel-git-deploy.sh](/home/nnn/Desktop/dii_ii/scripts/cpanel-git-deploy.sh)
- the host itself installs deps, stages the release bundle, and applies it
- the existing cPanel Node.js App still serves `/serverXR`
- staging and production still stay separated through two cPanel-managed clones

## One-Time Setup

1. Keep the Node.js apps:
   - staging app root: `/home/distudio/serverXR-staging`
   - production app root: `/home/distudio/serverXR`
   - app URL: `/serverXR`
2. In cPanel `Git Version Control`, create:
   - staging clone tracking `cpanel-staging`
   - production clone tracking `cpanel-production`
3. In cPanel Terminal:

```bash
mkdir -p ~/.config/dii
```

4. Create server-only deploy config files:

- `~/.config/dii/staging.deploy.env`
- `~/.config/dii/production.deploy.env`

## Required Settings

At minimum, keep these correct per environment:

- `VITE_API_BASE_URL=/serverXR`
- `NODE_ENV=production`
- `APP_BASE_PATH=/serverXR`
- `DATA_ROOT=<environment specific>`
- `SHARED_ROOT=<environment specific>`
- `CPANEL_WEB_ROOT=<environment specific>`
- `CPANEL_SERVERXR_ROOT=<environment specific>`
- `CPANEL_SHARED_ROOT=<environment specific>`
- `CPANEL_SMOKE_BASE_URL=<environment specific>`

## Deploy From cPanel

For staging:

1. update the staging clone from remote
2. deploy `HEAD`

For production:

1. promote the approved commit into `main`
2. publish the matching `cpanel-production` branch
3. update the production clone from remote
4. deploy `HEAD`

## What The Deploy Script Does

- installs root and backend dependencies on the host
- optionally runs tests on the host
- stages the cPanel release bundle on the host
- writes backend `.env`
- syncs frontend files into the web root
- syncs backend files into the Node.js App root
- syncs shared schema files
- installs production backend deps
- restarts the cPanel Node.js App
- runs smoke checks
- writes a checkpoint
