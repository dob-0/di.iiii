# cPanel Git Pull Deploy

This is a fallback deploy model.

Use it only when:

- GitHub Actions cannot push artifacts to the host
- the hosting account only exposes cPanel `Git Version Control` and a web terminal

The canonical path is still the prebuilt publish/apply model documented in:

- [docs/deploy/CPANEL_PREBUILT_DEPLOY.md](/home/nnn/Desktop/dii_ii/docs/deploy/CPANEL_PREBUILT_DEPLOY.md)

## What This Fallback Does

- the server pulls from GitHub locally through cPanel `Git Version Control`
- deployment runs on the host through `.cpanel.yml`
- the existing cPanel Node.js App still serves `/serverXR`
- staging and production stay separated through two cPanel-managed clones

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

- installs dependencies
- optionally runs tests
- builds the frontend
- stages a cPanel release bundle
- copies frontend files into the web root
- copies backend files into the Node.js App root
- writes backend `.env`
- installs production backend deps
- restarts the cPanel Node.js App
- runs smoke checks
- writes a checkpoint
