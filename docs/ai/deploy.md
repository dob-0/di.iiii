# AI Deploy Guide

This page is the AI-safe deployment map. Keep host-specific or secret material out of it.

## Canonical Deployment Model

- normal branch flow is `dev -> main`
- `dev` push deploys the dev tier, `dev.diiii.xyz`; `main` push deploys prod, `diiii.xyz` (the tiers are local · dev · prod; identifiers say `dev` too, e.g. `deploy-vps-dev.yml` — see [vocabulary.md](vocabulary.md))
- both deploy to the Hetzner VPS as Docker Compose projects (`deploy-vps.yml`, `deploy-vps-dev.yml`): GHCR images, nginx serves the client and proxies `/serverXR` to the server container

## Main Places To Read

- human deploy runbook: [../deploy/LIVE_DEPLOY.md](../deploy/LIVE_DEPLOY.md)
- publish content to a space (Options A–D): [../deploy/PUBLISH_WORKFLOW.md](../deploy/PUBLISH_WORKFLOW.md)
- VPS setup and secrets: [../deploy/VPS_DOCKER_DEPLOY.md](../deploy/VPS_DOCKER_DEPLOY.md)
- backend runtime contract: [../../serverXR/README.md](../../serverXR/README.md)
- automation entrypoint: [../../scripts/AGENTS.md](../../scripts/AGENTS.md)

## Main Commands

From the repo root:

```bash
npm run deploy:dev
npm run deploy:production
npm run deploy -- smoke production
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
- high-level host ownership such as “the server container owns `/serverXR`”

Checked-in AI docs should not contain:

- credentials
- personal SSH targets
- private host paths
- machine-local notes
- per-user override instructions that belong in ignored or user-scoped files
