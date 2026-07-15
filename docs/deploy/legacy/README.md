# Legacy Deploy Archive

These files are kept for emergency recovery only.

Do not use them as the normal deploy path for this repo.

## Historical Path (superseded)

This described the old default production flow, before the VPS cutover:

1. work on `dev`
2. promote through `staging` and `main`
3. let GitHub publish the matching `cpanel-*` branch
4. let cPanel `Git Version Control` apply it
5. keep `/serverXR` owned by the cPanel Node.js App

Production is now on a Hetzner VPS (Docker + Caddy) — see `docs/deploy/VPS_DOCKER_DEPLOY.md` for
the current path.

## Use This Archive Only When

- the VPS deploy path is unavailable and you're doing cPanel-specific disaster recovery
- you need old host-specific commands to recover service quickly

## Archived Materials

- [CPANEL_GIT_PULL_DEPLOY.md](CPANEL_GIT_PULL_DEPLOY.md)
- [PM2_QUICK_GUIDE.md](PM2_QUICK_GUIDE.md)
- [SSH_COMMANDS.md](SSH_COMMANDS.md)
- [`legacy/cpanel-git-pull/cpanel.git-pull.yml`](../../../legacy/cpanel-git-pull/cpanel.git-pull.yml)
- [`legacy/cpanel-git-pull/cpanel-git-deploy.sh`](../../../legacy/cpanel-git-pull/cpanel-git-deploy.sh)
- [`legacy/pm2/build-for-cpanel.ps1`](../../../legacy/pm2/build-for-cpanel.ps1)

For humans and AI agents:

- treat everything here as fallback material
- do not suggest these files before checking the main deploy docs
