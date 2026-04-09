# Legacy Deploy Archive

These files are kept for emergency recovery only.

Do not use them as the normal future path for this repo.

The canonical path is still:

- push `dev` or `main`
- let GitHub publish the matching `cpanel-*` branch
- let cPanel `Git Version Control` apply it
- keep `/serverXR` owned by the cPanel Node.js App

Archived fallback materials:

- [CPANEL_GIT_PULL_DEPLOY.md](CPANEL_GIT_PULL_DEPLOY.md)
- [PM2_QUICK_GUIDE.md](PM2_QUICK_GUIDE.md)
- [SSH_COMMANDS.md](SSH_COMMANDS.md)
- [`legacy/cpanel-git-pull/cpanel.git-pull.yml`](../../../legacy/cpanel-git-pull/cpanel.git-pull.yml)
- [`legacy/cpanel-git-pull/cpanel-git-deploy.sh`](../../../legacy/cpanel-git-pull/cpanel-git-deploy.sh)
- [`legacy/pm2/build-for-cpanel.ps1`](../../../legacy/pm2/build-for-cpanel.ps1)

Use these only when the canonical GitHub prebuilt publish/apply path is unavailable or you are doing disaster recovery.
