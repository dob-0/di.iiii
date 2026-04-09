# cPanel Prebuilt Deploy

This is the canonical deploy path for this repo.

## What Is Canonical

- publish workflow: [.github/workflows/publish-cpanel-prebuilt-v2.yml](/home/nnn/Desktop/dii_ii/.github/workflows/publish-cpanel-prebuilt-v2.yml)
- staged bundle source: `.deploy/cpanel/`
- server apply script: [scripts/cpanel-apply-prebuilt-release.sh](/home/nnn/Desktop/dii_ii/scripts/cpanel-apply-prebuilt-release.sh)
- runtime baseline: Node `22.x`

Branch and environment mapping:

- `dev` -> `cpanel-staging`
- `main` -> `cpanel-production`

## What The Workflow Does

The canonical workflow:

1. checks out `dev` or `main`
2. installs dependencies on GitHub Actions
3. runs tests
4. stages `.deploy/cpanel`
5. force-updates the prebuilt branch for the target environment

The prebuilt branch contains:

- repo files
- prebuilt `.deploy/cpanel`
- `.cpanel.yml`
- the source ref and deploy environment markers

## What cPanel Should Track

- staging cPanel repo should track `cpanel-staging`
- production cPanel repo should track `cpanel-production`

## Server Apply Step

When cPanel runs `Deploy HEAD Commit`, it should execute:

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

These still exist, but they are not the primary path:

- `publish-cpanel-prebuilt.yml`
- `deploy-cpanel.yml`
- `deploy-cpanel-safe.yml`
- Git-pull/self-host deploy docs
