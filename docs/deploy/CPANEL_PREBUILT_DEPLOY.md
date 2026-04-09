# cPanel Prebuilt Deploy

This is the canonical deploy path for this repo.

It is a GitHub-to-cPanel Git flow:

- GitHub Actions publishes prebuilt `cpanel-*` branches
- cPanel `Git Version Control` tracks those branches
- `.cpanel.yml` runs the apply script on the host
- SSH push deploys are not the canonical path

## What Is Canonical

- publish workflow: [.github/workflows/publish-cpanel-prebuilt-v2.yml](/home/nnn/Desktop/dii_ii/.github/workflows/publish-cpanel-prebuilt-v2.yml)
- staged bundle source: `.deploy/cpanel/`
- server apply script: [scripts/cpanel-apply-prebuilt-release.sh](/home/nnn/Desktop/dii_ii/scripts/cpanel-apply-prebuilt-release.sh)
- runtime baseline: Node `22.x`

Branch and environment mapping:

- `dev` -> `cpanel-staging`
- `main` -> `cpanel-production`

That means:

- `dev + staging` is the work lane
- `main + production` is the public lane

## What The Workflow Does

The canonical workflow:

1. runs automatically on pushes to `dev` and `main`
2. can also be run manually with `workflow_dispatch`
3. checks out the source ref
4. installs dependencies on GitHub Actions
5. runs tests
6. stages `.deploy/cpanel`
7. force-updates the prebuilt branch for the target environment

The prebuilt branch contains:

- repo files
- prebuilt `.deploy/cpanel`
- `.cpanel.yml`
- the source ref and deploy environment markers

## What cPanel Should Track

- staging cPanel repo should track `cpanel-staging`
- production cPanel repo should track `cpanel-production`
- both environments should keep `/serverXR` mounted through the cPanel Node.js App

## What Is Automatic vs Manual

Automatic:

- push to `dev` -> GitHub publishes `cpanel-staging`
- push to `main` -> GitHub publishes `cpanel-production`

Sometimes still manual:

- enable `Automatic Deployment` in cPanel `Git Version Control` if the host exposes it
- cPanel host apply
- if the live/staging site still serves the older build after GitHub finished, open cPanel `Git Version Control` and run `Deploy HEAD Commit`

If GitHub already published the correct `cpanel-*` branch but the site is stale, the missing step is usually cPanel-side, not GitHub-side.

## Server Apply Step

When cPanel runs `Deploy HEAD Commit`, `.cpanel.yml` should execute:

```bash
bash scripts/cpanel-apply-prebuilt-release.sh staging
```

or:

```bash
bash scripts/cpanel-apply-prebuilt-release.sh production
```

That apply step:

- generates backend `.env`
- syncs prebuilt frontend files into the web root
- syncs backend files into the Node.js app root
- installs production backend dependencies
- restarts the Node.js app
- runs smoke checks
- writes a checkpoint

In other words, the canonical human flow is:

1. push to `dev` or `main`
2. let GitHub publish `cpanel-staging` or `cpanel-production`
3. in cPanel `Git Version Control`, update and deploy `HEAD` if it did not apply automatically

If GitHub already has the right `cpanel-*` branch but the live site still serves an older build, the missing step is in cPanel, not in GitHub.

## Server-Only Config

Keep using:

- `~/.config/dii/staging.deploy.env`
- `~/.config/dii/production.deploy.env`

Those files should contain the real tokens and path settings, including:

- `APP_BASE_PATH`
- `DATA_ROOT`
- `SHARED_ROOT`
- `CPANEL_WEB_ROOT`
- `CPANEL_SERVERXR_ROOT`
- `CPANEL_SHARED_ROOT`

## Legacy Paths

Old GitHub Action deploy workflows were removed to keep the Actions page focused on the canonical path.

Legacy/manual references still live only in docs and scripts for emergency recovery:

- Git-pull/self-host deploy docs
- PM2 fallback docs
