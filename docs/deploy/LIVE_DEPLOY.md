# Live Deploy And Self-Host Plan

This repo uses a staged cPanel deployment model with one canonical publish path and a smaller set of fallback options.

## Canonical Release Model

- `dev` publishes staging
- `main` publishes production
- canonical publish workflow:
  - [.github/workflows/publish-cpanel-prebuilt-v2.yml](/home/nnn/Desktop/dii_ii/.github/workflows/publish-cpanel-prebuilt-v2.yml)
- canonical staged bundle:
  - `.deploy/cpanel/`
- canonical apply step:
  - [scripts/cpanel-apply-prebuilt-release.sh](/home/nnn/Desktop/dii_ii/scripts/cpanel-apply-prebuilt-release.sh)

## Public Surfaces

- public app: `https://your-domain/`
- V1 editor: `https://your-domain/main`
- admin: `https://your-domain/admin?space=main`
- Studio: `https://your-domain/studio`
- backend monitor: `https://your-domain/serverXR/`
- backend health: `https://your-domain/serverXR/api/health`

## Release Outputs

Run:

```bash
npm run deploy:cpanel
```

That stages:

```text
.deploy/cpanel/
├── public_html/
├── serverXR/
├── shared/
├── DEPLOY.md
├── frontend.env.production.example
└── release.json
```

Important:

- `public_html/` does not contain a static `serverXR/` proxy folder
- `/serverXR` is expected to be served by the cPanel Node.js App

## GitHub Environments And Secrets

Create:

- `staging`
- `production`

Required environment secrets:

- `CPANEL_HOST`
- `CPANEL_PORT`
- `CPANEL_USERNAME`
- `CPANEL_SSH_KEY`
- `CPANEL_WEB_ROOT`
- `CPANEL_SERVERXR_ROOT`
- `CPANEL_SHARED_ROOT`
- `SERVERXR_API_TOKEN`

## Server Shared Contract

Per environment, keep these aligned:

- `APP_BASE_PATH=/serverXR`
- `DATA_ROOT=<environment specific>`
- `SHARED_ROOT=<environment specific>`
- `CORS_ORIGINS=<environment specific>`
- `API_TOKEN` and `VITE_API_TOKEN` must match

## Smoke Checks

Run locally against any deployed environment:

```bash
npm run smoke:cpanel -- --base-url https://staging.di-studio.xyz
```

That should cover:

- `/`
- `/main`
- `/admin?space=main`
- `/studio`
- `/serverXR/api/health`
- `/serverXR/api/events`
- `/serverXR/`
- a non-existent asset route

## Fallback Paths

These are still available, but they are not the primary route:

- `docs/deploy/CPANEL_GIT_PULL_DEPLOY.md`
- `docs/deploy/PM2_QUICK_GUIDE.md`
- legacy SSH-push workflows in `.github/workflows/`
