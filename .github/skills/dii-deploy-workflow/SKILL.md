---
name: dii-deploy-workflow
description: 'Promote code from dev to main, verify the VPS deploy, and handle emergency hotfixes. Use when deploying, releasing, or deciding whether a change is ready for production.'
argument-hint: 'Describe the deployment or promotion task'
---

# dii Deploy Workflow

## When to Use
- You are promoting code from dev to main for production.
- You need to smoke-test a host after deploy.
- A hotfix needs to reach production outside the normal branch flow.

## Outcome
Advance code through the correct branch path, verify the host, and document the deploy without leaking private host details.

## Branch Model
- dev: active development lane — push here deploys the dev tier (https://dev.diiii.xyz) via deploy-vps-dev.yml
- main: production lane — push here runs deploy-vps.yml (GHCR build + SSH to the Hetzner VPS)
- do not start routine feature work on main
- use main as a starting point only for emergency production hotfixes

## Normal Promotion Flow
1. Confirm the current branch is clean and on dev.
2. Run the test suite and build before promoting.
3. Promote to main.
4. GitHub Actions (`deploy-vps.yml`) runs the CI suite, builds images to GHCR, and restarts the production Compose project on the VPS.
5. Wait for the `Deploy VPS (GHCR + SSH)` run to finish.

## Commands
- Promote to production: `git checkout main && git merge dev --no-edit && git push origin main && git checkout dev`
- Check CI: `gh run list --workflow deploy-vps.yml`
- Verify production host: `npm run deploy -- smoke production`

## Smoke Check After Deploy
1. Wait for the deploy workflow run to finish.
2. Check the health endpoint manually or via smoke command.
3. Confirm `release.gitCommit` in `/serverXR/api/health` matches what was promoted.

## Emergency Hotfix Path
1. Branch from main directly.
2. Make the minimal fix.
3. Run contract tests and build.
4. Promote directly to main.
5. Backport the fix to dev afterward to prevent drift.

## What Warrants Extra Care Before Merging to Main
- auth, session, or write permission changes
- serverXR route or persistence changes
- publish state or live pointer changes
- deploy automation script changes
- env variable shape changes
- changes to the Dockerfiles, compose files, or Caddy/nginx config

## What Can Go Straight to Main
- frontend-only style changes with passing tests and build
- AI-doc only changes with passing docs check
- small content or text corrections with no server behavior

## Repo Anchors
- Deploy runbook: ../../docs/deploy/LIVE_DEPLOY.md
- Automation: ../../scripts/AGENTS.md
- Deploy docs: ../../deploy/AGENTS.md
- Shortcut commands: package.json scripts section
- VPS setup: ../../docs/deploy/VPS_DOCKER_DEPLOY.md
- Deploy workflows: ../../.github/workflows/deploy-vps.yml, ../../.github/workflows/deploy-vps-dev.yml

## Validation
- Before promoting: `npm run test && npm run build`
- Backend contract changes: `npm run test:server-contracts` first
- After deploy: `npm run deploy -- smoke production` (or `smoke dev`)

## Completion Checks
- No routine work started on main.
- Tests and build passed before merge.
- Hotfixes were backported to dev.
- No credentials, private host paths, or SSH keys were added to tracked files.
- Smoke check passed before signing off.
