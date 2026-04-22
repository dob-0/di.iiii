# AI Deploy Guide

This page is the AI-safe deployment map. Keep host-specific or secret material out of it.

## Canonical Deployment Model

- normal branch flow is `dev -> staging -> main`
- production hosting deploys from the private repo release flow, not the public mirror repo
- prebuilt `cpanel-*` branches are the release artifacts consumed by cPanel Git Version Control
- `/serverXR` stays owned by the cPanel Node.js App

## Main Places To Read

- human deploy runbook: [../deploy/LIVE_DEPLOY.md](../deploy/LIVE_DEPLOY.md)
- cPanel bundle notes: [../../deploy/cpanel/DEPLOY.md](../../deploy/cpanel/DEPLOY.md)
- backend runtime contract: [../../serverXR/README.md](../../serverXR/README.md)
- automation entrypoint: [../../scripts/AGENTS.md](../../scripts/AGENTS.md)

## Main Commands

From the repo root:

```bash
npm run deploy:staging
npm run deploy:production
npm run deploy:cpanel
```

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
