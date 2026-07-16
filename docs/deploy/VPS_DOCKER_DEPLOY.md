# VPS Docker Deploy (GHCR + SSH)

This is the new production deploy path, replacing cPanel as the primary
target. It builds the `server` and `client` Docker images, pushes them to
GHCR, then SSHes into the VPS to pull and restart the Docker Compose stack.

cPanel (`publish-cpanel-prebuilt-v2.yml`, `cpanel-staging`/`cpanel-production`
branches) is untouched and remains a documented fallback until its hosting
term expires. Do not delete it as part of adopting this path.

## Workflow

- [.github/workflows/deploy-vps.yml](../../.github/workflows/deploy-vps.yml)
  — triggers on push to `main` (production).
- [.github/workflows/deploy-vps-staging.yml](../../.github/workflows/deploy-vps-staging.yml)
  — triggers on push to `dev` (staging). Decided against a second VPS: at
  2 vCPU/4GB (see `docs/ai/roles/infrastructure-engineer.md`), staging runs
  as a separate, deliberately small Compose project
  (`docker-compose.staging.yml`, 0.2 CPU/384M server + 0.1 CPU/64M client —
  small enough that it can't meaningfully starve production's 0.9 CPU/1G
  server + 0.3 CPU/128M client + 0.3 CPU/128M Caddy, all five summing to
  1.8 vCPU against the host's real 2 — enforced via top-level `cpus`/
  `mem_limit`, not the Swarm-only `deploy.resources.limits`, see
  `docs/ai/known-fixes.md`)
  on the **same** VPS, in a **separate checkout directory** with its own
  `.env` so it never inherits production's `COMPOSE_PROFILES=https` or
  secrets. Production's Caddy (the only Caddy instance; staging has none)
  reverse-proxies `STAGING_DOMAIN` to staging's host-published client port
  — see the second site block in `Caddyfile`.

### One-time VPS setup for staging

1. Clone this repo (or copy the compose files + `Caddyfile`) into a second
   directory, sibling to the production checkout, e.g.
   `/opt/dii` (prod) and `/opt/dii-staging` (staging).
2. In `/opt/dii-staging/.env`: set `PORT` to a free host port (e.g. `8081`)
   and fill in the `STAGING_*` vars documented in `.env.example`
   (`STAGING_AUTH_SESSION_SECRET` especially — generate a fresh one, do not
   reuse production's).
3. In `/opt/dii` (production)'s `.env`: set `STAGING_DOMAIN` (a subdomain
   DNS already points at this same host, e.g. `staging.your-domain`) and
   `STAGING_PORT` to match step 2's port. Restart production's `caddy`
   service (`docker compose --profile https up -d caddy`) to pick up the
   new site block.
4. Configure the GitHub secrets/variables below, then push to `dev` or run
   the workflow manually.

## What It Does

1. Builds `ghcr.io/<owner>/dii-server` (from `serverXR/Dockerfile`) and
   `ghcr.io/<owner>/dii-client` (from `Dockerfile`), tagged with the commit
   SHA and `latest`, and pushes both to GHCR.
2. SSHes into the VPS and, in `VPS_DEPLOY_PATH`:
   - `git fetch` + `git checkout <deployed-sha> -- docker-compose.yml
     docker-compose.prod.yml docker-compose.caddy-hardened.yml Caddyfile` —
     syncs the tracked compose/Caddy config to the exact commit being
     deployed first (everything else on the checkout — `.env`, data volumes —
     is untouched), closing a gap where the workflow used to only pull new
     images and never noticed config drift.
   - `docker compose --profile https -f docker-compose.yml -f
     docker-compose.prod.yml [-f docker-compose.caddy-hardened.yml] pull`
     then `up -d`. `docker-compose.prod.yml` overrides `server`/`client` to
     pull `ghcr.io/${REGISTRY_USER}/dii-*:${IMAGE_TAG}` instead of building
     locally (defaults: `REGISTRY_USER=youruser`, `IMAGE_TAG=latest` — see
     `.env.example`); `docker-compose.caddy-hardened.yml` is added only if
     present in the checkout.
   - Reloads Caddy afterward (`caddy reload`, falling back to `restart` if
     that fails) — its Caddyfile is a read-only bind mount, so a content-only
     change doesn't trigger a container recreate on its own.

   (Staging's workflow does the same three steps against
   `docker-compose.staging.yml` instead of `.prod.yml`/`caddy-hardened.yml`,
   and has no Caddy of its own to reload.)
3. Runs a smoke check against `/serverXR/api/health` (and the other routes in
   `scripts/smoke-check.mjs`) using `--base-url ${VPS_BASE_URL}`.

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

Staging (`deploy-vps-staging.yml`) reuses the same `VPS_HOST`/`VPS_SSH_USER`/
`VPS_SSH_PORT`/`VPS_SSH_KEY` secrets (same VPS) plus its own `staging`
Environment variables:

- `VPS_STAGING_DEPLOY_PATH` — the **separate** staging checkout directory
  from step 1 above (not `VPS_DEPLOY_PATH`)
- `VPS_STAGING_BASE_URL` — base URL to smoke-check (e.g.
  `https://staging.your-domain`); skipped with a warning if unset

### GHCR image authentication on the VPS

`ghcr.io/dob-0/dii-server` and `dii-client` were public by accident until
2026-07-16 (default GHCR visibility, never explicitly set) — anyone with
the URL could pull the compiled backend/frontend, undermining the repo
being private. Both are now **private**. The `docker compose ... pull`
step in `deploy-vps.yml`/`deploy-vps-staging.yml` runs directly on the VPS
via SSH, separate from the GH-Actions runner that builds/pushes (which
authenticates with the ephemeral `secrets.GITHUB_TOKEN`, useless for a
persistent host login) — so the VPS itself needs its own durable
credential to keep pulling.

One-time setup (already done as of 2026-07-16, only needed again if the
VPS is rebuilt or the token is rotated): a classic PAT (`read:packages`
scope only, no other permissions — fine-grained tokens don't support GHCR
package permissions as of this writing) was used to `docker login ghcr.io`
as `root` on the VPS, once. This persists in `/root/.docker/config.json`
(unencrypted, per Docker's own credential-store warning — acceptable here
since it's `read:packages`-only, not a repo/account-wide token) and covers
both the production and staging deploy paths, since they share one Docker
daemon on the box. Nothing in this repo or in CI holds that token; it
lives only on the VPS. To rotate it: generate a new classic PAT the same
way, `docker login ghcr.io -u dob-0 --password-stdin` on the VPS with it,
then revoke the old one on GitHub.

## Reusable Raw Material

The now-deleted `.github/workflows/deploy-staging-ssh.yml` (removed in
`1a45ab80`, "no SSH secrets") used the same SSH-key-setup and
`ssh-keyscan`/`StrictHostKeyChecking=yes` pattern this workflow reuses, just
over `rsync` instead of Docker Compose. Recoverable with:

```bash
git show a92feb00:.github/workflows/deploy-staging-ssh.yml
```

## Backup & Restore

Production's SQLite DB + uploads/spaces/snapshots are backed up nightly via
a root crontab entry on the VPS (`17 3 * * * /root/vps-backup.sh`) — this
was already live and working when a 2026-07-16 audit flagged "no backup
mechanism" as a gap; the audit only reviewed the git repo, not the VPS
itself, and the script was never committed here. It now is:

- `deploy/vps-backup.sh` — version-controlled copy of `/root/vps-backup.sh`.
  Takes a consistent SQLite snapshot (`VACUUM INTO`, WAL-safe) of the running
  `dii-server-1`'s DB, tars it with `uploads`/`spaces`/`snapshots` from the
  `dii_data` volume into `/root/backups/dii-backup-<timestamp>.tar.gz`,
  prunes anything older than 14 days.
- `deploy/vps-restore.sh` — companion restore script (didn't exist before
  2026-07-16). Stops `dii-server-1`, extracts a chosen backup into `dii_data`
  replacing what's there, restarts the stack. Requires typing `restore` to
  confirm — this overwrites live data. Validated 2026-07-16 by dry-running
  the extraction logic against a disposable scratch volume (not production)
  and confirming the restored DB opens cleanly and contains all real spaces.

**No deploy step keeps the VPS copies and these files in sync** — if you
change either script, `scp` it to `/root/` on the VPS by hand
(`scp deploy/vps-backup.sh dii-vps:/root/vps-backup.sh`) and `chmod +x`.

**Known gap, not yet addressed**: backups are local to the VPS only. A
host-level disaster (not just a lost Docker volume) takes the backups down
with it. An off-box copy (object storage, another host) would close this,
but needs a destination + credentials someone has to choose — ask before
picking one.

## Follow-Ups

- Both production and staging have been exercised for real (2026-07-16):
  GitHub secrets/variables set, real deploy runs verified end-to-end for
  each. `staging.di-studio.xyz` is live at `/opt/di.iiii-staging`.
- Consider adding a rollback note (`IMAGE_TAG=<previous-sha>` + re-run
  `pull && up -d`) — not yet needed in practice, but worth having on hand.
- No `release.json`/git-commit stamp in the build yet, so `/api/health`
  can't self-report what's deployed — cross-check `gh run list` if unsure.
