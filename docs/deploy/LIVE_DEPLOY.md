# Live Deploy Runbook

This is the shortest practical runbook for normal future work.

If you only remember one thing, remember this:

- `dev` = active development → deploys to VPS staging
- `main` = production → deploys to the Hetzner VPS (Docker/Caddy)
- normal promotion path: `dev -> main`
- there is no `staging` source branch — staging is a deploy target, not a branch

## Golden Path (VPS, current)

Production DNS was cut over from cPanel to the Hetzner VPS on 2026-07-15
(manual deploy); the automated pipeline below was wired up and verified
end-to-end (both environments, real runs) on 2026-07-16.

- push `dev` → [deploy-vps-staging.yml](../../.github/workflows/deploy-vps-staging.yml)
  builds images, pushes to GHCR, SSHes into the VPS, restarts the staging
  Compose project (`docker-compose.staging.yml`) — small, isolated, shares
  the box with production but not its resources or secrets; served at
  `staging.di-studio.xyz` via production's Caddy
- push `main` → [deploy-vps.yml](../../.github/workflows/deploy-vps.yml) does
  the same for the production Compose project
- both workflows `git checkout <deployed-sha> -- <tracked compose/Caddy
  files>` before restarting, so config drift on the host gets caught
  automatically, not just image updates
- full detail, GitHub secrets/variables reference: [VPS_DOCKER_DEPLOY.md](VPS_DOCKER_DEPLOY.md)

The build stamps the deployed commit into `/serverXR/api/health`'s
`release.gitCommit` field — `curl -s <host>/serverXR/api/health` is the
fastest way to verify exactly what's running (verified live on both
environments 2026-07-19). `gh run list --workflow=deploy-vps.yml` (or
`-staging`) remains the cross-check for run status.

Do not start routine feature work on `main`.
Use `main` as a starting point only for an emergency production hotfix.

## Daily Workflow

Typical start-of-session commands:

```bash
git switch dev
git pull --ff-only origin dev
npm run dev
```

### To update staging (once the one-time VPS setup is done)

```bash
git push origin dev
```

Wait for the `Deploy VPS Staging` GitHub Action to finish, then verify:

```bash
curl -s https://<staging-domain>/serverXR/api/health
node scripts/smoke-check.mjs --base-url https://<staging-domain>
```

### To update production

Merge the verified `dev` into `main` and push:

```bash
git checkout main && git merge dev --no-edit && git push origin main && git checkout dev
```

Wait for the `Deploy VPS (GHCR + SSH)` GitHub Action to finish, then verify:

```bash
curl -s https://di-studio.xyz/serverXR/api/health
node scripts/smoke-check.mjs --base-url https://di-studio.xyz
```

Resolve any merge conflicts between `dev` and `main` before shipping.

## Emergency Hotfix Path

When production needs an urgent fix, start from `main`, then bring the same
commit back into `dev` so the branches do not drift apart.

## Public Surfaces

- public app: `https://di-studio.xyz/`
- public/main route: `https://di-studio.xyz/main`
- public/space route: `https://di-studio.xyz/<space>`
- admin: `https://di-studio.xyz/admin?space=main`
- Studio: `https://di-studio.xyz/main/studio`
- Beta: `https://di-studio.xyz/main/beta`
- backend health: `https://di-studio.xyz/serverXR/api/health`

## First Checks If Something Breaks

1. `https://di-studio.xyz/serverXR/api/health`
2. `docker compose ps` / `docker compose logs server` on the VPS
3. the VPS checkout's `.env`
4. `docker compose logs caddy` if TLS/routing looks wrong
5. browser console and network panel

## cPanel Fallback (legacy)

cPanel is no longer the live path but remains a documented fallback until
its hosting term expires. `publish-cpanel-prebuilt-v2.yml`'s automatic push
trigger was disabled (2026-07-15, #63) — its smoke-check was failing every
run since the DNS cutover, and it was burning CI minutes for a host real
traffic no longer reaches. It still runs via `workflow_dispatch` if cPanel
is ever needed again.

Canonical pieces (unchanged, kept for that fallback):

- workflow: [.github/workflows/publish-cpanel-prebuilt-v2.yml](../../.github/workflows/publish-cpanel-prebuilt-v2.yml)
  (manual dispatch only)
- release bundle: `.deploy/cpanel/`
- apply script: [scripts/cpanel-apply-prebuilt-release.sh](../../scripts/cpanel-apply-prebuilt-release.sh)
- `npm run deploy:host:*` — only for the matching cPanel clone/host shell
- cron-based auto-apply, host runtime contract, and recovery steps: see
  [CPANEL_PREBUILT_DEPLOY.md](CPANEL_PREBUILT_DEPLOY.md) and
  [legacy/README.md](legacy/README.md)

`npm run deploy:staging` / `deploy:production` (via `scripts/deploy.mjs`)
still just push `dev` / merge-and-push `main` — same git operations as
above, regardless of which workflow is currently wired to that branch.
