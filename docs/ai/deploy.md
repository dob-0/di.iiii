# AI Deploy Guide

This page is the AI-safe deployment map. Keep host-specific or secret material out of it.

## Canonical Deployment Model

- normal branch flow is `dev -> main`. There is no `staging` source branch — staging is a
  deploy target
- push `dev` → `.github/workflows/deploy-vps-staging.yml` → `staging.di-studio.xyz`
- push `main` → `.github/workflows/deploy-vps.yml` → `di-studio.xyz`
- both build images, push to GHCR, connect to the VPS, and restart the Docker Compose
  project. Each checks out the deployed SHA's tracked compose/Caddy files before
  restarting, so host config drift is caught, not just image updates
- **the production deploy waits for a manual approval.** A run sitting at `waiting` is
  not `queued` and is not stuck — it is asking for a human
- the deployed commit is stamped at `/serverXR/api/health` → `release.gitCommit`.
  `curl -s <host>/serverXR/api/health` is the fastest way to see what is actually running

**Legacy, since 2026-07-15:** production DNS moved off cPanel to the VPS on that date.
The `cpanel-*` branches and `publish-cpanel-prebuilt-v2.yml` are fallback only — the
workflow is `workflow_dispatch`-only and its smoke check fails every run, so it will
never confirm a deploy. Do not treat any cPanel path as current, and do not wait on a
cPanel cron.

## Main Places To Read

- human deploy runbook: [../deploy/LIVE_DEPLOY.md](../deploy/LIVE_DEPLOY.md) — canonical
- publish content to a space (Options A–D): [../deploy/PUBLISH_WORKFLOW.md](../deploy/PUBLISH_WORKFLOW.md)
- backend runtime contract: [../../serverXR/README.md](../../serverXR/README.md)
- automation entrypoint: [../../scripts/AGENTS.md](../../scripts/AGENTS.md)
- cPanel bundle notes (legacy): [../../deploy/cpanel/DEPLOY.md](../../deploy/cpanel/DEPLOY.md)

## Main Commands

From the repo root:

```bash
npm run deploy:production   # promote
npm run deploy:status       # where things are
npm run smoke               # verify the host after a deploy
```

`npm run deploy:cpanel` still exists but stages a legacy cPanel release artifact. It is
not part of the current path.

## Routing Rules

- change `scripts/` when deployment automation or helper behavior changes
- change `deploy/` when versioned examples, templates, or docs change
- change `serverXR/README.md` when backend runtime truth or auth/runtime contract changes
- keep `.github/workflows/` aligned with the deploy model, but treat those files as adjacent to `scripts/` and `deploy/`, not the canonical deploy docs themselves

## Public-Safe Rule

Checked-in AI docs may describe:

- branch flow
- deploy artifact shape
- the existence of env files and required categories of configuration
- high-level host ownership such as “Node.js App owns `/serverXR`”

Checked-in AI docs should not contain:

- credentials
- personal SSH targets
- private host paths
- machine-local notes
- per-user override instructions that belong in ignored or user-scoped files
