# Project Audit And Growth Plan

Audit date: `2026-04-17`

## Executive Summary

The project is in a healthy working state.

- deploy automation is now boring in the best way: laptop promotion to GitHub, GitHub prebuilt publish, and cPanel cron auto-apply
- the backend contract is clear and covered by strong tests
- the product direction is coherent: `Studio` is the main authoring lane, `Beta` is the experiment lane, and `V1` is the fallback/history lane

The biggest constraints on future growth are not deploy anymore.

- the write-auth model now has a first server-session increment, but still needs real user identity and roles
- the frontend has several very large orchestration files
- the public bundle is still heavy for mobile
- persistence is still single-host filesystem storage, which will limit scale and analytics

## Verified Status

Checks run during this audit:

- `npm run lint`
- `npm run build`
- `npm run test`
- `npm run test:server-contracts`

Result:

- all passed on `2026-04-17`

Useful scale markers:

- frontend source files: `234`
- backend runtime files in `serverXR/src`: `16`
- scripts: `10`
- combined `src/`, `serverXR/src/`, and `scripts/` JS/JSX/MJS lines: about `35,417`

Largest files by line count right now:

- `src/components/PreferencesPage.jsx` about `1,518`
- `src/App.jsx` about `1,226`
- `src/studio/components/StudioShell.jsx` about `885`
- `src/ViewPanel.jsx` about `726`
- `src/hooks/useAssetPipeline.js` about `609`
- `scripts/deploy.mjs` about `549`
- `serverXR/src/index.js` about `427`
- `serverXR/src/routes/spaceRoutes.js` about `416`
- `serverXR/src/routes/projectRoutes.js` about `382`

Current production build signal:

- `three-core` chunk about `740 kB`
- `vendor` chunk about `586 kB`
- main `index` chunk about `442 kB`
- sourcemaps are enabled in production builds

## What Is Working Well

### 1. Deployment Is Finally Simple

The current shared-host flow is clear and repeatable:

- `npm run deploy:staging`
- verify staging
- `npm run deploy:production`

GitHub publishes prebuilt `cpanel-*` branches and cPanel cron applies them.

Relevant files:

- [scripts/deploy.mjs](../../scripts/deploy.mjs)
- [scripts/cpanel-poll-deploy.sh](../../scripts/cpanel-poll-deploy.sh)
- [scripts/cpanel-apply-prebuilt-release.sh](../../scripts/cpanel-apply-prebuilt-release.sh)

### 2. The Backend Contract Is Clear

`serverXR` is opinionated in a good way:

- spaces are the public and management unit
- projects are the editable documents inside spaces
- ops plus SSE are the durable sync path
- Socket.IO is presence, not source of truth

Relevant files:

- [serverXR/src/index.js](../../serverXR/src/index.js)
- [serverXR/src/routes/spaceRoutes.js](../../serverXR/src/routes/spaceRoutes.js)
- [serverXR/src/routes/projectRoutes.js](../../serverXR/src/routes/projectRoutes.js)

### 3. Shared Project Logic Is Moving In The Right Direction

The repo has already reduced a lot of Beta/Studio duplication by pushing project sync/state/API logic into `src/project/`.

Good sign:

- `src/beta/*` wrappers now mostly re-export shared modules from `src/project/*`

Relevant files:

- [src/project/state/projectStore.js](../../src/project/state/projectStore.js)
- [src/project/services/projectsApi.js](../../src/project/services/projectsApi.js)
- [src/project/hooks/useProjectDocumentSync.js](../../src/project/hooks/useProjectDocumentSync.js)

### 4. Testing Coverage Is Better Than Average For A Product This Shape

The repo has strong coverage across:

- UI routes and panels
- collaboration hooks
- project contracts
- backend config and auth behavior
- publish and asset flows

This is a real asset for moving faster safely.

## Main Findings

### High: Auth Still Needs Real Identity And Roles

Update `2026-04-19`: normal builds no longer need to ship `VITE_API_TOKEN` in the browser. Protected writes can establish an http-only server session through `/api/auth/session`, and bearer-token auth remains available for automation and legacy compatibility.

Relevant files:

- [src/services/apiClient.js](../../src/services/apiClient.js)
- [serverXR/src/authSession.js](../../serverXR/src/authSession.js)
- [scripts/cpanel-apply-prebuilt-release.sh](../../scripts/cpanel-apply-prebuilt-release.sh)

Impact:

- the old browser-token path is still available if `VITE_API_TOKEN` is intentionally set
- session auth removes the default compiled-token leak, but it is still a shared edit-token model
- there is still no real user identity, role boundary, or meaningful audit trail yet

Recommendation:

- keep `API_TOKEN` server-only for normal builds
- treat the shared edit token as a temporary gate, not true auth
- move to real user sessions, signed actions, roles, and audit trails before scaling team usage or public editing

### High: Persistence Is Still Single-Host Filesystem Storage

The runtime stores metadata, documents, ops, and assets on disk.

Relevant files:

- [serverXR/src/jsonStore.js](../../serverXR/src/jsonStore.js)
- [serverXR/src/spaceStore.js](../../serverXR/src/spaceStore.js)
- [serverXR/src/projectStore.js](../../serverXR/src/projectStore.js)

Impact:

- fine for one host and early-stage velocity
- weak fit for multi-instance deployment
- harder to add analytics, history queries, background jobs, backups, or moderation tooling
- recovery and consistency get harder as traffic and asset volume grow

Recommendation:

- keep the current schema and API shape
- migrate storage under the API to Postgres for metadata and ops
- move binary assets to object storage
- keep filesystem mode only for local development and emergency fallback

### Medium: Frontend Orchestration Is Concentrated In A Few Large Files

The codebase is organized, but several files are now too large and too responsible.

Most obvious pressure points:

- [src/App.jsx](../../src/App.jsx)
- [src/components/PreferencesPage.jsx](../../src/components/PreferencesPage.jsx)
- [src/studio/components/StudioShell.jsx](../../src/studio/components/StudioShell.jsx)
- [src/studio/components/StudioEditor.jsx](../../src/studio/components/StudioEditor.jsx)
- [src/hooks/useAssetPipeline.js](../../src/hooks/useAssetPipeline.js)

Impact:

- onboarding is slower
- regressions become easier when unrelated concerns live together
- parallel work gets riskier because many changes touch the same orchestration surfaces

Recommendation:

- split by domain, not by arbitrary line count
- move status, build/runtime diagnostics, and operator panels out of `PreferencesPage`
- split `App.jsx` into route, sync, asset, and editor-shell coordinators
- keep `StudioShell` focused on layout and move action logic into hooks or domain modules

### Medium: Public Bundle Weight Is Still High

The build is functional, but the shipped JS is still heavy for a mobile-first public surface.

Relevant files:

- [vite.config.js](../../vite.config.js)
- [src/index.jsx](../../src/index.jsx)
- [src/project/components/PublicProjectViewer.jsx](../../src/project/components/PublicProjectViewer.jsx)

Impact:

- slower first load on mobile networks
- more pressure on memory in lower-end devices
- bigger penalty for public users who only need the viewer, not the full editor

Recommendation:

- add route-based lazy loading around Studio, Beta, Preferences, and heavy editor-only surfaces
- keep the public viewer path as lean as possible
- consider disabling public production sourcemaps or uploading them privately instead of serving them
- add a bundle budget so chunk growth becomes visible in CI

### Medium: Routing Is Still Managed Manually

The app uses `window.location` and `popstate` handling directly in several root surfaces.

Relevant files:

- [src/RootApp.jsx](../../src/RootApp.jsx)
- [src/studio/StudioApp.jsx](../../src/studio/StudioApp.jsx)
- [src/beta/BetaApp.jsx](../../src/beta/BetaApp.jsx)

Impact:

- okay while route rules are simple
- more fragile as the number of surfaces, deep links, and publish states grows

Recommendation:

- either keep the custom route layer intentionally tiny
- or adopt a lightweight router once route behavior settles and more nested flows are needed

## Strategic Direction

### Product Direction

Keep this shape:

- `Studio` as the canonical authoring product
- `Beta` as the experiment lane
- `V1` as compatibility and fallback only
- `/<space>` as the clean public route

Do not let three editor generations keep growing equally.
That would spread product energy too thin.

### Engineering Direction

Invest next in:

1. security boundary
2. large-file decomposition
3. bundle weight
4. storage architecture

That order gives the best leverage.

### Platform Direction

The current cPanel cron deploy is good enough for now.
The next real platform jump should be about storage and runtime control, not deploy cosmetics.

When the project outgrows shared hosting, move to:

- VPS + Coolify
- or a managed host with real SSH/container deploys and persistent storage primitives

## Suggested 30 / 60 / 90 Day Plan

### Next 30 Days

- build on the server-session auth increment with real identity, permissions, and audit trails
- split `App.jsx`, `PreferencesPage.jsx`, and `StudioShell.jsx` into domain modules
- add one end-to-end test for `create space -> create project -> publish -> public route updates`
- add bundle budget checks for the public route
- keep README and deploy docs aligned with the current cron workflow

### 30 To 60 Days

- move more Beta UI logic onto shared `src/project/` foundations
- define which Beta features graduate into Studio and which stay experimental
- add lightweight product analytics around space creation, project creation, publish, and public opens
- introduce explicit editor permissions and ownership concepts

### 60 To 90 Days

- design the storage migration path: Postgres for metadata and ops, object storage for assets
- prepare hosting migration off shared hosting if concurrency or asset volume starts to hurt
- add real backup, restore, and retention policies around published projects and uploads

## Recommended Growth Bets

If the goal is product growth, not only code cleanup, the best bets are:

### 1. Make Publishing Feel Instant And Trustworthy

Publishing is the core loop.
Lean into:

- obvious project status
- clearer live-vs-draft messaging
- publish history / rollback
- better confirmation on public-route updates

### 2. Turn Spaces Into A Strong Product Primitive

Spaces are already a good model.
Build around them:

- templates
- permissions
- branded public defaults
- analytics per space

### 3. Make Public Viewing Sharper Than Editing

The public route is the product’s best showcase.
Optimize it separately:

- smaller bundle
- better load states
- stronger presentation defaults
- cleaner mobile polish

### 4. Keep Studio Boring And Beta Experimental

This split is healthy if you protect it.

- Studio should get reliability, clarity, and safe defaults
- Beta should absorb experiments without destabilizing the main authoring lane

## Bottom Line

This repo is not stuck.
It is already in a workable shape with solid tests and a now-stable deploy path.

The next ceiling is not “how do we deploy.”
The next ceiling is:

- secure auth
- lighter frontend architecture
- better public performance
- storage that can survive growth
