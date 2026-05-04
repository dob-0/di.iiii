# SSH Staging Deploy

This workflow is the VPS-style staging deploy path. It is intentionally opt-in so it can live beside the current cPanel prebuilt flow until the SSH host is ready.

Workflow:

- `.github/workflows/deploy-staging-ssh.yml`
- triggers on pushes to `staging` and manual `workflow_dispatch`
- only runs when GitHub environment/repository variable `ENABLE_SSH_STAGING_DEPLOY=true`

## Required GitHub Configuration

Use the `staging` GitHub Environment for these values.

Variables:

- `ENABLE_SSH_STAGING_DEPLOY=true`
- `STAGING_API_BASE_URL=/serverXR`
- `STAGING_RESTART_COMMAND=pm2 restart dii-staging --update-env`

Secrets:

- `STAGING_SSH_HOST`
- `STAGING_SSH_USER`
- `STAGING_SSH_PORT` (optional; defaults to `22`)
- `STAGING_SSH_PRIVATE_KEY`
- `STAGING_WEB_ROOT`
- `STAGING_SERVER_ROOT`
- `STAGING_SHARED_ROOT`

Do not commit hostnames, private paths, tokens, or private keys.

## What It Deploys

- `dist/` -> `STAGING_WEB_ROOT`
- `serverXR/package*.json`, `serverXR/src/`, `serverXR/public/`, `serverXR/release.json` -> `STAGING_SERVER_ROOT`
- `shared/` -> `STAGING_SHARED_ROOT`

On the host, it runs:

```bash
cd "$STAGING_SERVER_ROOT"
npm ci --omit=dev
eval "$STAGING_RESTART_COMMAND"
```

The host remains responsible for `.env`, data volume, reverse proxy, TLS, and PM2/service setup.

## Expected Host Shape

The staging backend should have server-only env configured on the host, for example:

```bash
APP_BASE_PATH=/serverXR
DATA_ROOT=/var/lib/dii-staging/data
DB_PATH=/var/lib/dii-staging/data/di.db
SHARED_ROOT=<same path as STAGING_SHARED_ROOT>
REQUIRE_AUTH=true
API_TOKEN=<server-only token>
AUTH_SESSION_SECRET=<server-only secret>
CORS_ORIGINS=https://staging.example.com
```

## Verification

After a deploy:

```bash
curl -s https://<staging-host>/serverXR/api/health
npm run smoke:cpanel -- --base-url https://<staging-host>
```

The health response should include `release.deploymentMode = "ssh-rsync"`.
