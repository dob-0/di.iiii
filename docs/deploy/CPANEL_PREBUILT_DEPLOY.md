# cPanel Prebuilt Deploy

Use this flow when the cPanel host cannot build the frontend because of memory limits.

## Branch mapping

- `dev` builds and publishes `cpanel-staging`
- `main` builds and publishes `cpanel-production`

## What the GitHub workflow does

The workflow `publish-cpanel-prebuilt.yml`:

- checks out `dev` or `main`
- installs dependencies on GitHub Actions
- runs tests
- builds the frontend off-server
- stages `.deploy/cpanel`
- force-updates a prebuilt branch with:
  - repo files
  - prebuilt `.deploy/cpanel`
  - a `.cpanel.yml` that applies the release without rebuilding

## What cPanel should track

- staging cPanel repo should track `cpanel-staging`
- production cPanel repo should track `cpanel-production`

## Server deploy command

When cPanel runs `Deploy HEAD Commit`, it will execute `scripts/cpanel-apply-prebuilt-release.sh`, which:

- generates backend `.env` from the server-only config
- syncs prebuilt frontend files into the web root
- syncs backend files into the Node.js app root
- installs production backend dependencies
- restarts the Node.js app
- runs smoke checks
- writes a checkpoint

## Server-only config files

Keep using:

- `~/.config/dii/staging.deploy.env`
- `~/.config/dii/production.deploy.env`

These should contain the real API token and path settings.
