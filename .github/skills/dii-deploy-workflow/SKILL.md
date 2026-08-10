---
name: dii-deploy-workflow
description: 'Promote code from dev to main, deploy the Hetzner VPS Docker stack, verify hosts, and handle emergency hotfixes. Use when deploying, releasing, or deciding whether a change is ready for production.'
argument-hint: 'Describe the deployment or promotion task'
---

# dii Deploy Workflow

## When to Use
- You are promoting code from dev to main for production.
- A staging deploy needs to be triggered or verified.
- You need to smoke-test a host after deploy.
- A hotfix needs to reach production outside the normal branch flow.

## Outcome
Advance code through the correct branch path, verify what is actually running on the host, and document the deploy without leaking private host details.

## Branch Model
- dev: active development lane — push deploys to VPS staging (staging.di-studio.xyz)
- main: production lane — push deploys to the VPS production stack (di-studio.xyz)
- there is no `staging` source branch — staging is a deploy target, not a branch
- do not start routine feature work on main
- use main as a starting point only for emergency production hotfixes

## Deploy Pipeline
- push `dev` -> `.github/workflows/deploy-vps-staging.yml`
- push `main` -> `.github/workflows/deploy-vps.yml`
- both run `ci.yml` first (test, lint, build, server contracts, docs checks), then build images, push to GHCR, SSH into the Hetzner VPS, and restart the Docker Compose project
- both check out tracked Compose/Caddy files at the deployed SHA before restarting, so host config drift is corrected too, not just images
- the production job has `environment: production`, so its run sits in status `waiting` for manual approval — `waiting` is not `queued`, nothing deploys until it is approved
- a failing CI job blocks the deploy; `npm run docs:ai:check` fails when CURRENT.md was written by anything other than `npm run land`, which stops an otherwise-green push from reaching staging

## Normal Promotion Flow
1. Confirm the current branch is clean and on dev.
2. Run the test suite and build before promoting.
3. Push dev and verify staging.
4. Promote to main.
5. Approve the waiting production run.
6. Verify the production host before signing off.

## Commands
- Deploy staging: `git push origin dev`
- Promote to production: `git checkout main && git merge dev --no-edit && git push origin main && git checkout dev`
- Check CI: `gh run list --workflow=deploy-vps.yml` (or `deploy-vps-staging.yml`)
- Verify what is running: `curl -s https://di-studio.xyz/serverXR/api/health` — `release.gitCommit` is the deployed commit
- Smoke a host: `npm run deploy -- smoke production` (or `staging`), or `node scripts/smoke-check.mjs --base-url https://di-studio.xyz`

## Smoke Check After Deploy
1. Wait for the deploy workflow run to finish — do not check the host before the run completes.
2. `curl -s <host>/serverXR/api/health` and compare `release.gitCommit` to the commit you promoted.
3. Run the smoke check against the same base URL.

## Emergency Hotfix Path
1. Branch from main directly.
2. Make the minimal fix.
3. Run contract tests and build.
4. Promote directly to main and approve the production run.
5. Backport the fix to dev afterward to prevent drift.

## What Warrants Extra Care Before Merging to Main
- auth, session, or write permission changes
- serverXR route or persistence changes
- publish state or live pointer changes
- deploy automation, Compose file, or Caddyfile changes
- env variable shape changes
- anything that changes the container entrypoint or image build

## What Can Go Straight to Main
- frontend-only style changes with passing tests and build
- AI-doc only changes with passing docs check
- small content or text corrections with no server behavior

## Legacy: cPanel (not the live path)
- cPanel stopped being the production path on 2026-07-15 when DNS was cut over to the VPS
- `publish-cpanel-prebuilt-v2.yml` is `workflow_dispatch`-only since then (#63); its smoke check fails every run, so a manual dispatch is expected to go red
- `cpanel-production` / `cpanel-staging` branches, `deploy/cpanel/DEPLOY.md`, `npm run deploy:host:*` and `npm run deploy:remote:*` belong to that fallback only — do not use them to ship
- PM2 is not used anywhere; the VPS runs Docker Compose

## Repo Anchors
- Deploy runbook: ../../../docs/deploy/LIVE_DEPLOY.md
- VPS detail and secrets reference: ../../../docs/deploy/VPS_DOCKER_DEPLOY.md
- Production workflow: ../../../.github/workflows/deploy-vps.yml
- Staging workflow: ../../../.github/workflows/deploy-vps-staging.yml
- Automation: ../../../scripts/AGENTS.md
- Deploy docs: ../../../deploy/AGENTS.md
- Shortcut commands: package.json scripts section

## Validation
- Before promoting: `npm run test && npm run build`
- Backend contract changes: `npm run test:server-contracts` first
- After deploy: `npm run deploy -- smoke production` (or `staging`)

## Completion Checks
- No routine work started on main.
- Tests and build passed before merge.
- The production run was approved, not left `waiting`.
- `release.gitCommit` on the host matches the promoted commit.
- Hotfixes were backported to dev.
- No credentials, private host paths, or SSH keys were added to tracked files.
- Smoke check passed before signing off.
