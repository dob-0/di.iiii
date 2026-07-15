# VPS Docker Deploy (GHCR + SSH)

This is the new production deploy path, replacing cPanel as the primary
target. It builds the `server` and `client` Docker images, pushes them to
GHCR, then SSHes into the VPS to pull and restart the Docker Compose stack.

cPanel (`publish-cpanel-prebuilt-v2.yml`, `cpanel-staging`/`cpanel-production`
branches) is untouched and remains a documented fallback until its hosting
term expires. Do not delete it as part of adopting this path.

## Workflow

- [.github/workflows/deploy-vps.yml](../../.github/workflows/deploy-vps.yml)
- triggers on push to `main` (production only, for now)
- `dev`/staging is not wired up yet — it depends on whether staging ends up
  on the same VPS or a separate host. Once that's confirmed, add a `dev`
  trigger with its own host secrets/variables (or a `staging` GitHub
  Environment) alongside this one.

## What It Does

1. Builds `ghcr.io/<owner>/dii-server` (from `serverXR/Dockerfile`) and
   `ghcr.io/<owner>/dii-client` (from `Dockerfile`), tagged with the commit
   SHA and `latest`, and pushes both to GHCR.
2. SSHes into the VPS and runs, in `VPS_DEPLOY_PATH`:
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.prod.yml pull
   docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
   ```
   `docker-compose.prod.yml` overrides `server`/`client` to pull
   `ghcr.io/${REGISTRY_USER}/dii-*:${IMAGE_TAG}` instead of building locally
   (defaults: `REGISTRY_USER=youruser`, `IMAGE_TAG=latest` — see
   `.env.example`).
3. Runs a smoke check against `/serverXR/api/health` (and the other routes in
   `scripts/smoke-check-cpanel.mjs`) using `--base-url ${VPS_BASE_URL}`.

## Required GitHub Configuration

Secrets (repo or `production` Environment):

- `VPS_HOST` — VPS hostname or IP
- `VPS_SSH_USER` — SSH user (e.g. `root` or a deploy user)
- `VPS_SSH_PORT` — optional, defaults to `22`
- `VPS_SSH_KEY` — private key with access to the VPS

Variables (repo or `production` Environment):

- `REGISTRY_USER` — GitHub username/org the images are pushed under (must
  match `.env`'s `REGISTRY_USER` on the VPS so `docker-compose.prod.yml`
  pulls the right image)
- `VPS_DEPLOY_PATH` — absolute path to the `docker-compose.yml` checkout on
  the VPS (a clone of this repo, or just the two compose files + `.env` +
  `Caddyfile`/`nginx.conf` as needed)
- `VPS_BASE_URL` — base URL to smoke-check after deploy (e.g.
  `https://your-domain` or `http://<ip>:<port>`); the smoke-check step is
  skipped with a warning if unset

None of these are committed anywhere in this repo — configure them in the
GitHub repo/environment settings before the workflow can run.

## Reusable Raw Material

The now-deleted `.github/workflows/deploy-staging-ssh.yml` (removed in
`1a45ab80`, "no SSH secrets") used the same SSH-key-setup and
`ssh-keyscan`/`StrictHostKeyChecking=yes` pattern this workflow reuses, just
over `rsync` instead of Docker Compose. Recoverable with:

```bash
git show a92feb00:.github/workflows/deploy-staging-ssh.yml
```

## Follow-Ups

- `scripts/smoke-check-cpanel.mjs` is generic over `--base-url` already and
  works unchanged here; it should be renamed to something host-neutral (e.g.
  `smoke-check.mjs`) once the cPanel path is retired, so as not to keep
  implying a cPanel-only tool.
- Wire up staging once its VPS/host target is confirmed.
- Consider adding a rollback note (`IMAGE_TAG=<previous-sha>` + re-run
  `pull && up -d`) once this path has been exercised for real.
