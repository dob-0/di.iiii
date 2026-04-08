# cPanel Git Pull Deploy

This flow is for hosting accounts that only expose the cPanel web terminal and do not allow inbound SSH from GitHub Actions.

## Why use this

- The server pulls from GitHub locally through cPanel `Git Version Control`.
- Deployment runs on the hosting account itself through `.cpanel.yml`.
- The existing cPanel Node.js App still serves `/serverXR`.
- Staging and production stay separated by using two cPanel-managed clones.

## One-time setup

1. Keep the Node.js Apps as they are:
   - staging app root: `/home/distudio/serverXR-staging`
   - production app root: `/home/distudio/serverXR`
   - app URL: `/serverXR`
2. In cPanel `Git Version Control`, create two repositories:
   - staging clone tracking `dev`
   - production clone tracking `main`
3. In cPanel Terminal, create the config directory:

```bash
mkdir -p ~/.config/dii
```

4. Create the deploy config files from `deploy/cpanel/cpanel.deploy.env.example`:
   - `~/.config/dii/staging.deploy.env`
   - `~/.config/dii/production.deploy.env`

## Suggested staging config

```env
VITE_API_BASE_URL=/serverXR
VITE_API_TOKEN=your-token
NODE_ENV=production
PORT=4001
APP_BASE_PATH=/serverXR
DATA_ROOT=/home/distudio/serverXR-staging/data
API_TOKEN=your-token
REQUIRE_AUTH=true
CORS_ORIGINS=https://staging.di-studio.xyz
MAX_UPLOAD_MB=100
CPANEL_WEB_ROOT=/home/distudio/staging.di-studio.xyz
CPANEL_SERVERXR_ROOT=/home/distudio/serverXR-staging
CPANEL_SHARED_ROOT=/home/distudio/shared-staging
CPANEL_SMOKE_BASE_URL=https://staging.di-studio.xyz
CPANEL_RUN_TESTS=1
```

## Suggested production config

```env
VITE_API_BASE_URL=/serverXR
VITE_API_TOKEN=your-token
NODE_ENV=production
PORT=4000
APP_BASE_PATH=/serverXR
DATA_ROOT=/home/distudio/serverXR/data
API_TOKEN=your-token
REQUIRE_AUTH=true
CORS_ORIGINS=https://di-studio.xyz,https://www.di-studio.xyz
MAX_UPLOAD_MB=100
CPANEL_WEB_ROOT=/home/distudio/public_html
CPANEL_SERVERXR_ROOT=/home/distudio/serverXR
CPANEL_SHARED_ROOT=/home/distudio/shared
CPANEL_SMOKE_BASE_URL=https://di-studio.xyz
CPANEL_RUN_TESTS=0
```

## Useful toggles

These can go into the server-only deploy config when you are debugging:

```env
CPANEL_SKIP_BACKUP=1
CPANEL_SKIP_RESTART=1
CPANEL_SKIP_SMOKE=1
```

## Deploy from cPanel

For staging:

1. Open the staging repository in cPanel `Git Version Control`.
2. Click `Update from Remote`.
3. Click `Deploy HEAD Commit`.

For production:

1. Merge or fast-forward the approved commit into `main`.
2. Open the production repository in cPanel `Git Version Control`.
3. Click `Update from Remote`.
4. Click `Deploy HEAD Commit`.

## What the deploy script does

- installs frontend and backend dependencies
- optionally runs tests
- builds the frontend
- stages a cPanel release bundle
- copies frontend files into the web root
- copies backend files into the Node.js App root
- preserves system folders like `cgi-bin` and `.well-known`
- writes backend `.env`
- installs production backend deps
- restarts the cPanel Node.js App
- runs smoke checks
- writes a checkpoint under `~/deploy-checkpoints/<environment>/`

## Files involved

- `.cpanel.yml`
- `scripts/cpanel-git-deploy.sh`
- `deploy/cpanel/cpanel.deploy.env.example`
