---
name: dii-deploy-workflow
description: 'Promote code from dev to staging to main, run prebuilt cPanel releases, verify hosts, and handle emergency hotfixes. Use when deploying, releasing, checking staging, running smoke tests, or deciding whether a change needs staging verification first.'
argument-hint: 'Describe the deployment or promotion task'
---

# dii Deploy Workflow

## When to Use
- You are promoting code from dev to staging or staging to production.
- A prebuilt cPanel release artifact needs to be created or applied.
- You need to smoke-test a host after deploy.
- You need to decide whether a change warrants staging verification before main.
- A hotfix needs to reach production outside the normal branch flow.

## Outcome
Advance code through the correct branch path, verify the host, and document the deploy without leaking private host details.

## Branch Model
- dev: active development integration lane
- staging: stable preview lane, published from staging
- main: production lane, published from main
- cpanel-staging and cpanel-production: prebuilt artifact branches consumed by cPanel Git Version Control
- do not start routine feature work on main
- use main as a starting point only for emergency production hotfixes

## Normal Promotion Flow
1. Confirm the current branch is clean and on dev.
2. Run the test suite and build before promoting.
3. Promote to staging first.
4. Verify staging before touching main.
5. If staging is healthy, promote to production.

## Commands
- Check status: npm run deploy:status
- Promote to staging: npm run deploy:staging
- Promote to production: npm run deploy:production
- Verify staging host: npm run smoke:cpanel staging
- Verify production host: npm run smoke:cpanel production

## Smoke Check After Deploy
1. Wait 1-2 minutes for cPanel cron to apply the published branch.
2. Check the health endpoint manually or via smoke command.
3. Confirm the release manifest version matches what was promoted.

## Emergency Hotfix Path
1. Branch from main directly.
2. Make the minimal fix.
3. Run contract tests and build.
4. Promote directly to main.
5. Backport the fix to staging and dev afterward to prevent drift.

## What Warrants Staging Verification
- auth, session, or write permission changes
- serverXR route or persistence changes
- publish state or live pointer changes
- deploy automation script changes
- env variable shape changes
- changes to the cPanel Node.js App bootstrap or entrypoint

## What Does Not Need Staging Gate
- frontend-only style changes with passing tests and build
- AI-doc only changes with passing docs check
- small content or text corrections with no server behavior

## Repo Anchors
- Deploy runbook: ../../docs/deploy/LIVE_DEPLOY.md
- Automation: ../../scripts/AGENTS.md
- Deploy docs: ../../deploy/AGENTS.md
- Shortcut commands: package.json scripts section
- cPanel bundle: ../../deploy/cpanel/DEPLOY.md
- Prebuilt workflow: ../../.github/workflows/publish-cpanel-prebuilt-v2.yml

## Validation
- Before promoting: npm run test and npm run build
- Backend contract changes: npm run test:server-contracts first
- After deploy: npm run smoke:cpanel

## Completion Checks
- No routine work started on main.
- Staging was verified before production promote.
- Hotfixes were backported to staging and dev.
- No credentials, private host paths, or SSH keys were added to tracked files.
- Smoke check passed before signing off.
