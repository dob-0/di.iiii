# Live Deploy Runbook

This is the shortest practical runbook for normal future work.

If you only remember one thing, remember this:

- `dev` = active development → deploys to `staging.di-studio.xyz`
- `main` = production → deploys to `di-studio.xyz`
- normal promotion path: `dev -> main`

## Golden Path

- local work happens on `dev`
- push `dev` → GitHub Actions publishes `cpanel-staging` → staging.di-studio.xyz updates
- verify staging
- merge `dev` into `main` and push → GitHub Actions publishes `cpanel-production` → production updates
- there is no `staging` source branch — staging is a GitHub Actions environment, not a branch

Do not start routine feature work on `main`.
Use `main` as a starting point only for an emergency production hotfix.

Canonical pieces:

- workflow:
  - [.github/workflows/publish-cpanel-prebuilt-v2.yml](../../.github/workflows/publish-cpanel-prebuilt-v2.yml)
- release bundle:
  - `.deploy/cpanel/`
- apply script:
  - [scripts/cpanel-apply-prebuilt-release.sh](../../scripts/cpanel-apply-prebuilt-release.sh)

## Shortcut Commands

From the repo root:

```bash
npm run deploy:status
npm run deploy:dev
npm run deploy:staging
npm run deploy:production
npm run deploy:host:staging
npm run deploy:host:production
```

Equivalent single helper form:

```bash
npm run deploy -- status
npm run deploy -- staging
npm run deploy -- production
npm run deploy -- host staging
npm run deploy -- host production
```

Rules:

- `dev` is the integration lane — pushing it triggers the staging deploy automatically
- `deploy:production` merges `dev` into `main` and pushes
- `deploy:host:*` is only for the matching cPanel clone or host shell
- `deploy:remote:*` is optional for a future SSH-capable host and is not part of the current shared-host flow
- `npm run smoke:cpanel` is the quick verification command

Current host truth:

- push `dev` (or run `npm run deploy:staging`) to update staging
- verify staging at `https://staging.di-studio.xyz`
- run `npm run deploy:production` to merge `dev` into `main` and push to production
- cPanel applies the published `cpanel-*` branches automatically

Future SSH/VPS staging path:

- [.github/workflows/deploy-staging-ssh.yml](../../.github/workflows/deploy-staging-ssh.yml)
- [SSH_STAGING_DEPLOY.md](SSH_STAGING_DEPLOY.md)
- disabled by default until `ENABLE_SSH_STAGING_DEPLOY=true` and staging SSH secrets are configured

## Auto Apply Via Cron

If the host does not allow SSH but does allow cPanel `Terminal` and `Cron Jobs`, use:

```bash
cd /home/distudio/repositories/di.iiii-staging
bash scripts/cpanel-poll-deploy.sh staging
```

```bash
cd /home/distudio/repositories/di.iiii-production
bash scripts/cpanel-poll-deploy.sh production
```

Suggested cron entries:

```cron
*/2 * * * * cd /home/distudio/repositories/di.iiii-staging && bash scripts/cpanel-poll-deploy.sh staging >> /home/distudio/logs/staging-auto-deploy.log 2>&1
*/2 * * * * cd /home/distudio/repositories/di.iiii-production && bash scripts/cpanel-poll-deploy.sh production >> /home/distudio/logs/production-auto-deploy.log 2>&1
```

This is pull-based auto-deploy rather than SSH push deploy, but on this host it is the simplest fully repeatable option.

## Daily Workflow

Typical start-of-session commands:

```bash
git switch dev
git pull --ff-only origin dev
npm run dev
```

### To update staging

1. Push `dev`:

```bash
git push origin dev
# or
npm run deploy:staging
```

2. Wait about 1-2 minutes for GitHub Actions to publish `cpanel-staging`.

3. Verify:

```bash
curl -s https://staging.di-studio.xyz/serverXR/api/health
npm run smoke:cpanel -- --base-url https://staging.di-studio.xyz
```

### To update production

1. Merge the verified `dev` into `main`:

```bash
npm run deploy:production
# equivalent to: git checkout main && git merge dev --no-edit && git push origin main && git checkout dev
```

2. Wait about 1-2 minutes for GitHub publish plus cPanel cron.

3. Verify:

```bash
curl -s https://di-studio.xyz/serverXR/api/health
npm run smoke:cpanel -- --base-url https://di-studio.xyz
```

Resolve any merge conflicts between `dev` and `main` before shipping.

## What Is Automatic Today

- GitHub-side prebuilt publish is automatic on pushes to `dev` and `main`
- the prebuilt branches are:
  - `cpanel-staging` (from `dev` push)
  - `cpanel-production` (from `main` push)
- `workflow_dispatch` exists for repair or recovery work, but it should not replace the normal `dev -> main` promotion flow

## Emergency Hotfix Path

When production needs an urgent fix, start from `main`, then bring the same commit back into `dev` so the branches do not drift apart.

## What May Still Be Manual

- first-time cron setup in cPanel
- host recovery when a cPanel clone diverges
- manual cPanel apply if cron is disabled or delayed
- if cPanel says branches diverged, use the reset recovery steps in [cPanel Prebuilt Deploy](CPANEL_PREBUILT_DEPLOY.md)

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
