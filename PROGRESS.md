# di.iiii Progress Log

Developer work journal. One entry per session, newest at top.
Read this before starting work. Update it before stopping.

---

## 2026-06-10 — Space and project workflow

**Who:** Copilot

### Done this session

- Documented the default space → Studio/Beta → public workflow in `README.md`.
- Added a workflow card to Studio Hub for space creation, project development, and publishing.
- Added a workflow card to Beta Hub for experimental project development and handoff to Studio.

### Validation

- `npm run build`

---

## 2026-05-10 — Beta graph-first workspace + world node

**Who:** Gevorg + Claude

### Done

- **Graph as primary surface** — `BetaViewSurface` removed; `BetaGraphSurface` is the permanent canvas
- **Topbar seeding** — topbar is hidden until `universe.node0` is placed; fades in on Node 0 creation
- **`universe.world` node** — singleton panel-2d node replacing the ad-hoc system viewport window
  - Panel mode: resizable `DesktopWindow` with `BetaViewport` inside
  - Overlay mode (◫): 3D world renders as transparent background behind graph
  - Fullscreen mode (⤢): world takes over screen; topbar "← World" exits
- **NodePalette**: removed `slice(0, 8)` cap; all matching nodes visible with arrow-key scroll tracking
- **`Node0PanelWindow`** and **`WorldPanelWindow`** added as dedicated panel components
- `universe.world` added to `SINGLETON_TYPE_IDS` in `projectSchema.js`
- Committed `3e8824a` to `dev` + `staging`; cPanel deploy confirmed live on `staging.di-studio.xyz`

### Validation

- `npm run test` — 81 files / 284 tests — all pass

---

## 2026-05-04d — Bundle Fix + SHA-256 Asset IDs

**Who:** Copilot

### Done this session

**Content-addressed asset IDs (complete):**
- Both upload routes (`projectRoutes.js`, `spaceRoutes.js`) already used SHA-256 — done in a prior session.
- Removed the dead `|| crypto.randomUUID()` fallback from `buildProjectAssetMeta` in `serverXR/src/projectStore.js`.
- Function now throws `Error('assetId is required')` if called without one — misuse is immediately visible.
- Removed now-unused `const crypto = require('node:crypto')` import from `projectStore.js`.

**Bundle manualChunks fix:**
- Root cause: the previous `manualChunks` omitted drei's peer deps (`detect-gpu`, `maath`, `camera-controls`, `@react-spring/three`, `@monogrid/gainmap-js`). Those landed in `vendor`, imported `three`, creating `three-vendor → vendor → three-vendor` circular init order → TDZ crash in production (SES/lockdown).
- Fix: added all missing drei peer deps to the `three-vendor` group in `vite.config.js`.
- Build now produces **no circular chunk warning**. Chunk caching is now clean: `three-vendor` and `vendor` are stable across app changes.
- **Needs runtime verification on staging** — the prior TDZ crash was a browser runtime issue. Monitor after next staging deploy.

### Chunk comparison (gzip)

| Chunk | Before | After |
|---|---|---|
| three ecosystem | 462 + 234 kB (split) | 591 kB (one stable chunk) |
| vendor (MUI + socket.io) | scattered | 391 kB (one stable chunk) |
| react | bundled in index | 46 kB separate |
| SceneCanvas | 43 kB | 5.5 kB (just the entry) |
| useAssetUrl shared | 234 kB | 3.7 kB |

### Files changed

- `vite.config.js` — restored manualChunks with complete drei peer dep list
- `serverXR/src/projectStore.js` — removed randomUUID fallback, removed crypto import
- `PROGRESS.md` — this entry

### Validation

- `npx vite build` — clean, no circular chunk warning
- `npx vitest run` — 79 files / 274 tests — all pass

### Easy wins (pick any next)

1. ~~**Routing**~~ — done. `react-router-dom@6` installed; `BrowserRouter` in `RootApp`, `useLocation()` in `AppRouter`/`useAppRoute`, `initialRoute` prop passed down to `StudioApp`/`BetaApp`. 274/274 tests pass.
2. ~~**GitHub Actions deploy**~~ — done. `deploy-staging-ssh.yml` is complete and tested in CI. Remaining step is ops-only: add `staging` environment secrets to GitHub repo settings (`STAGING_SSH_HOST`, `STAGING_SSH_PRIVATE_KEY`, `STAGING_WEB_ROOT`, `STAGING_SERVER_ROOT`, `STAGING_SHARED_ROOT`) and set `ENABLE_SSH_STAGING_DEPLOY=true`. See `docs/deploy/SSH_STAGING_DEPLOY.md`.

---

## 2026-05-04c — Manifesto Shortcut Capture Rule

**Who:** Copilot

### Done this session

- Added a permanent manifesto section requiring short reusable solution notes after solved tasks.
- Defined a compact template: Problem, Short way, Verification, Source files/commands.

### Why

- Prevent repeat investigation of already solved paths.
- Keep operational memory compact and immediately actionable.

### Files changed

- `MANIFESTO.md`

### Follow-up update

- Added a concrete shortcut entry for staging publish failures: missing `deploy/cpanel/cpanel.prebuilt.yml`, repromote flow, and verification checklist.

---

## 2026-05-04b — Outliner Panel + Tests

**Who:** Gevorg + Claude

### Done this session

**Outliner panel (node count badge → clickable toggle):**

- Converted `<span class="beta-topbar-node-count">` to a `<button>` that toggles an Outliner window
- `surfaceNodes` memo reuses the filtered array for both the count and the outliner list (was computing separately before)
- Created `OutlinerPanelWindow.jsx` — lists nodes for the active surface, shows type label + node label, highlights selected node with `is-selected`
- Outliner window is a floating `DesktopWindow`, draggable/resizable, available on all three surfaces
- CSS: node count button gets `appearance: none` reset, hover/active color brightening; `.beta-outliner button.is-selected` added

**Tests:**

- `OutlinerPanelWindow.test.jsx` — 5 tests: empty state, node list rendering, typeId fallback, is-selected class, click callback
- `BetaEditor.test.jsx` — 4 new outliner toggle tests: no button when empty, button appears with nodes, opens dialog on click, closes on second click

### Validation

- `npm run test` — 79 files / 270 tests — all pass

### Easy wins (pick any next)

1. **Bundle size follow-up** — drei subpath imports (note: `sideEffects: false` is already set in drei's package.json so tree-shaking from the index works; investigate whether chunk inflation from dynamic import boundaries is addressable with a different Rollup strategy instead)
2. **Routing** — replace manual `window.location`/`popstate` with a router library (medium-large scope; current system is clean and tested — weigh carefully)
3. ~~**Outliner node-type icon/colour**~~ — done. `OutlinerPanelWindow` already renders `.beta-outliner-dot` with `getCategoryColor(typeDef?.category)` and CSS grid layout.

---

## 2026-05-04 — geom.plane Texture + Initial Bundle Optimization

**Who:** Gevorg + Claude

### Done this session

**`geom.plane` texture support:**

- Added `textureUrl` string port to `geom.plane` in `nodeRegistry.js`
- Added `PlaneWithTexture` component in `BetaViewport.jsx` using `useTexture` from drei
- When `textureUrl` is set, renders with texture mapped; falls back to solid color otherwise
- Loads lazily inside existing `<Suspense>` boundary — no new Suspense needed

**Initial bundle optimization (index.js: 459kB → 30kB gzip):**

- Made `App`, `BlankNodeWorkspaceApp`, and `PublicProjectViewer` lazy in `SpaceSurfaceApp.jsx`
- Made `SceneCanvas`, `PresentationCanvas`, and drei `Loader` lazy in `EditorLayout.jsx`
- Fixed `SpaceSurfaceApp.test.jsx` — two sync `getByText` checks updated to async `findByText` to match new lazy rendering
- Updated `manualChunks` in `vite.config.js`: merged `xr-vendor` into `react-three`, added `@react-spring/three` to prevent circular chunk warnings; removed stale comment
- Known tradeoff: Three.js lazy chunks are larger than original (tree-shaking is less aggressive across dynamic import boundaries). Initial render is dramatically faster for landing pages and non-3D workflows.

### Validation

- `npm run lint` — 0 errors, 5 pre-existing warnings (unchanged)
- `npm run test` — 78 files / 261 tests — all pass

### Easy wins (pick any next)

1. **GitHub Actions deploy** — replace cPanel cron. Push to `staging` → build → rsync + SSH restart. IE role. New workflow file.
2. **Outliner panel** — node count badge in topbar has no click target. Wire it to an outliner panel.
3. **Bundle size follow-up** — `drei` tree-shaking regresses with lazy imports. Root fix: use drei subpath imports (`@react-three/drei/web/Grid`) instead of top-level index in viewport components. ~15 targeted import changes.
4. **Routing** — replace manual `window.location`/`popstate` with a router library.

---

## 2026-05-04 — Undo/Redo + AI Company Structure + Ollama Integration

**Who:** Gevorg + Claude

### Changes

**Undo/redo in Beta editor:**
- Wrapped `applyLocalOps` with a history-tracking layer inside `BetaEditor.jsx`
- All structural ops (everything except `setWorkspaceState`) push the current document to a 50-entry undo stack
- `Ctrl+Z` / `Cmd+Z` restores previous document state via `replace-document` dispatch
- `Ctrl+Shift+Z` / `Ctrl+Y` redoes
- Input/textarea fields correctly ignore the shortcut
- Fixed stale `windowLayout.test.js` assertions (expected old formula values, now reflect `bottom + 8`)

**AI company structure** (`docs/ai/roles/`):
- 10 role cards: UI/UX Engineer, Node System Engineer, 3D/Viewport Engineer, Backend/API Engineer, Schema/Protocol Engineer, Infrastructure Engineer, QA/Test Engineer, Security Auditor, Technical Architect, Documentation Engineer
- Each card has: owned files, forbidden files, elite domain knowledge, done criteria
- Role routing table added to root `AGENTS.md`

**Token efficiency + Ollama integration:**
- `scripts/ollama-task.sh` — safe CLI wrapper for 5 Ollama tiers (fast/deep/coder/general/tiny)
- `dob-fast` and `dob-deep` are project-fine-tuned — called without system prompt override
- Model routing guide at `docs/ai/roles/model-routing.md`
- Token budget rules added to `AGENTS.md` (startup context limits, tool budgets)
- All 4 AI tools (Claude, Gemini, Copilot, Cursor) now receive role routing table + token efficiency rules via their bridge files
- `npm run docs:ai:sync` regenerates all 16 bridge files automatically

### Validation

- `npm run lint` — 0 errors, 5 pre-existing warnings (unchanged)
- `npm run test` — 78 files / 261 tests — all pass
- `npm run docs:ai:check` — pass

### Easy wins (pick any next)

1. **`geom.plane` texture** — add `textureUrl` port in `nodeRegistry.js`, read with `useTexture` in `BetaViewport.jsx`. ~30 lines. NSE + VPE.
2. **GitHub Actions deploy** — replace cPanel cron. Push to `staging` → build → rsync + SSH restart. IE role. New workflow file.
3. ~~**Content-addressed asset IDs**~~ — done. Both project and space upload routes use `SHA-256(file content)`. `buildProjectAssetMeta` fallback removed.
4. **Outliner panel** — node count badge in topbar has no click target. Wire it to an outliner panel.

---

## 2026-05-04 — Beta Layout Fixes + Full Surface Testing

**Who:** Copilot

### Done this session

Created `default-scene-test` project and systematically tested all three Beta editor surfaces. Found and fixed 4 layout bugs.

**Fixed:**
1. **Dead space below topbar**: `DEFAULT_BETA_WORKSPACE_TOP` was 168px (old value from before topbar redesign). Changed to 64px, updated `getWorkspaceTopInset` formula to `return bottom > 0 ? bottom + 8 : DEFAULT_BETA_WORKSPACE_TOP`.
2. **Viewport starts at y=0 when workflow strip hidden**: `workflowHeight` fallback was `0`, so surfaces started under topbar. Changed fallback to `workspaceTop`.
3. **Workflow strip not hiding when cube exists**: `hasWorldContent = entities.length > 0` only checked legacy entities. Beta nodes live in `document.nodes`. Fixed to `entities.length > 0 || nodes.length > 0`.
4. **Inspector overlapping workflow strip**: `.beta-selection-scaffold` had `top: 64px` hardcoded in CSS. When workflow strip height ~150px, inspector overlapped it. Added `style={{ top: workflowHeight + 'px' }}` to override.

**Tested and verified:**
- World surface: cube visible at [0,0.5,0], clickable, inspector updates on selection, no layout overlaps
- Graph surface: node cards visible, port connections show, inspector works, no overlaps  
- View surface: text panel floating window at correct position, draggable, workflow strip hides when view nodes exist

**Files changed:**
- `src/beta/utils/windowLayout.js` — DEFAULT_BETA_WORKSPACE_TOP 168→64, formula updated
- `src/beta/components/BetaEditor.jsx` — 4 fixes: workflowHeight fallback, hasWorldContent, inspector top, (surface switching)

### Follow-up fixes

- Made Beta selection surface-aware so World/View no longer inherit an unrelated selected node from another surface.
- Scoped the topbar node count to the active surface instead of counting the full mixed document.
- Filtered `view.image` asset picker options to image assets only so the node UI no longer offers incompatible project assets.
- Added focused tests for the asset-filtering inspector behavior.
- Fixed `OpCreateDialog` render loop on `Add View Node` / `Add World Node`: stable selection now comes from the memoized definitions list, which prevents the `Maximum update depth exceeded` warning when opening the create dialog.
- Completed live Beta checks for remaining todos: View surface OK, add-node flow OK (created Browser node), and graph wiring OK (created a `value.color -> geom.cube.color` edge in `default-scene-test`).

### Validation

- `npm run lint` — pass
- All surfaces load cleanly with no console errors
- Cube visible and selectable in World; inspector shows Cube ports
- Graph shows node cards with ports; edges visible as wires
- View shows floating text panel at correct y position; no overlap with topbar

---

## 2026-05-04 — Beta Graph Node Dragging + Visibility Fix

**Who:** Codex

### Done this session

- Fixed Beta Graph surface not showing node cards: removed inline `position: 'relative'` that was breaking `position: absolute; inset: 0` CSS.
- Fixed `topInset` calculation to use `offsetTop + offsetHeight` for proper workflow strip offset.
- Added auto-scroll to Graph surface on mount to show nodes.
- **Added drag-to-move for graph nodes**: nodes now respond to click-and-drag to reposition in the graph canvas. Cursor changes to `grab`/`grabbing` to indicate affordance.
- Connected drag callback (`onMoveNode`) to persist `graphX`/`graphY` via `updateNode` operations.
- **Fixed UI overlap issues**: Workflow strip now hides when content exists on the active surface (hidden on World when entities exist, hidden on Graph when nodes exist, hidden on View when view nodes exist).

### Validation

- Node cards visible and interactive.
- Graph drag-to-move tested: moved node by (150px, 100px) and confirmed position updated.
- Workflow strip hidden on all surfaces with content (tested World and Graph).
- World viewport fully visible with no overlays.
- Graph editor showing 6 nodes with connection wires visible.
- Inspector panel positioned non-overlapping on right.
- All surfaces layout correctly with topbar and optional workflow hints.

### Completed Features

✅ Graph visibility (nodes now show)
✅ Node dragging (drag to reposition)  
✅ UI layout (no overlaps, clean workspace)
✅ Workflow hinting (shows only when empty)


---

## 2026-05-03 — Beta Empty World Affordance

**Who:** Gevorg + Codex

### Done this session

- Replaced the faint empty-world hint with a visible onboarding overlay in Beta World.
- Added a bright framed target area, crosshair, and a centered `Add World Node` button so users do not have to guess where to double-click.
- Kept double-click support, but added a direct first-action button for dark-grid scenes where the interaction was too hidden.
- Added focused viewport tests for the empty-world CTA.

### Validation

- `npm run lint` passed.
- `npm run test -- src/beta/components/BetaViewport.test.jsx src/beta/components/BetaHelpDialog.test.jsx src/beta/components/BetaHub.test.jsx src/beta/utils/betaGuide.test.js src/beta/components/BetaEditor.test.jsx` passed.

---

## 2026-05-03 — Beta Visitor/Creator First Landing

**Who:** Gevorg + Codex

### Done this session

- Added a visual Beta hub onboarding split for two audiences: `For Visitors` and `For Creators`.
- Added audience-specific steps and actions so visitors can go to the public space while creators can jump into project creation.
- Extended the in-app Beta help `Start Here` section with matching visitor/creator guidance cards.
- Updated the Beta user manual so the written docs now begin with the same two entry paths.

### Validation

- `npm run lint` passed.
- `npm run test -- src/beta/components/BetaHub.test.jsx src/beta/components/BetaHelpDialog.test.jsx src/beta/utils/betaGuide.test.js src/beta/components/BetaEditor.test.jsx` passed.

---

## 2026-05-03 — Beta Help Flow + User Manual

**Who:** Gevorg + Codex

### Done this session

- Added a Beta in-app help system with surface-aware guidance for `Start Here`, `World`, `View`, and `Graph`.
- Added a topbar `Help` button plus a workflow-strip `How To Use ...` action so users can open guidance from multiple places.
- Added shared Beta guide content in code so the in-app steps stay consistent.
- Added a written Beta manual at `docs/beta/USER_MANUAL.md` covering first steps, first connections, and current Beta expectations.

### Validation

- `npm run lint` passed.
- `npm run test -- src/beta/components/BetaHelpDialog.test.jsx src/beta/utils/betaGuide.test.js src/beta/utils/surfaceWorkflow.test.js src/beta/components/BetaEditor.test.jsx` passed.

---

## 2026-05-03 — Beta Workflow Strip Layout Fix

**Who:** Gevorg + Codex

### Done this session

- Fixed Beta surface overlap caused by the new workflow strip floating above World/View/Graph content.
- Measured workflow strip height in `BetaEditor.jsx` and passed a live top inset into each active surface.
- Updated `BetaGraphSurface.jsx` and `BetaViewport.jsx` to reserve that inset instead of rendering under the strip.
- Updated Beta surface CSS so the workflow strip participates in normal layout and the View surface honors a dynamic top offset.

### Validation

- `npm run lint` passed.
- `npm run test -- src/beta/components/BetaEditor.test.jsx src/beta/components/BetaGraphSurface.test.jsx src/beta/utils/surfaceWorkflow.test.js` passed.

---

## 2026-05-03 — Handoff Cleanup · Logical Commits · Beta Delete Key

**Who:** Gevorg + Codex

### Done this session

- Fixed `git diff --check` trailing whitespace failures in Studio/shared panel CSS.
- Reviewed the large uncommitted handoff batch and committed it in logical slices:
    - AI task contract + manifesto/golden-rules tooling
    - browser session auth gate and token removal from client requests/sockets
    - SQLite-backed serverXR persistence and migration
    - serverXR Docker image support
    - App/Preferences/StudioShell file splits
    - fallback catch annotations and visible sync warnings
    - di.i visual identity refresh across landing, Studio, Beta, and shared surfaces
- Completed quick Beta editor win: Delete/Backspace now deletes selected nodes/entities in World/View surfaces, while Graph keeps its existing graph-local handler.
- Cleared the remaining lint warnings:
    - moved `useAppState` ref updates out of render and into an effect
    - removed unused imports/destructures in Beta, Preferences, and node registry tests
    - converted intentionally ignored catch bindings to bare `catch`
    - made Beta graph/world/view interactive surfaces keyboard-addressable
- Added the opt-in SSH/VPS staging deploy path:
    - GitHub Actions workflow for `staging` / manual SSH rsync deploys
    - deployment docs for required GitHub variables/secrets and host shape
    - live deploy docs now point to the future SSH staging path while keeping cPanel as current truth
- Cleaned branch hygiene after the deploy workflow push:
    - deleted stale remote `copilot/help-with-pull-request` branch with no open PR
    - fast-forwarded local `main` and `staging` refs to their upstreams
    - closed PRs #9/#10 and deleted their `copilot/*` branches after confirmation to keep only needed branches
- Stabilized the PreferencesPage runtime metadata test by waiting for async backend health metadata before asserting release fields.
- Completed quick Beta editor win: `world.background` nodes now drive the Beta viewport background color, with legacy `worldState.backgroundColor` as fallback.

### Validation

- `git diff --check` passed after whitespace cleanup.
- SSH deploy workflow structural check passed.
- Branch cleanup verification passed: remote branch count is now 5; only `dev`, `staging`, `main`, `cpanel-staging`, and `cpanel-production` remain.
- `npm run docs:ai:sync` passed — bridges already up to date.
- `npm run docs:ai:check` passed.
- `npm run lint` passed with 0 warnings.
- `npm run test` passed: 67 files / 221 tests.
- `npm run build` passed.
- `npm run test:server-contracts` passed: 2 files / 16 tests.
- Focused Beta checks passed: `npm run test -- BetaGraphSurface.test.jsx beta/utils/betaRouting.test.js`.

---

## 2026-04-29 — AI Task Contract + MCP Guardrails

**Who:** Gevorg + Copilot

### Done this session

- Added a required **AI Task Contract** section to `AGENTS.md` with goal/priority/scope/non-goals/output/done-criteria fields.
- Added **MCP / tool-usage guardrails** to `AGENTS.md` to reduce extra tool calls and out-of-scope edits.
- Added a practical **Task Request Template** section to `README.md` so task prompts are clearer and better prioritized.
- Added `docs/ai/workflows.md` guidance for task intake checks and MCP/tool budgeting.
- Added a new golden rule in `docs/ai/golden_rules.md` to prevent tool-heavy work before contract clarity.
- Tightened contract with strict execution rules: max 2 clarifying questions, scope lock, and explicit end-of-task reporting.
- Added output response contract to keep AI replies concise and structured (summary/changes/validation/risks).
- Extended README template with a copy-paste strict task format for higher prompt control.
- Added an ultra-short default task mode block in `AGENTS.md` for always-on strict behavior.
- Added a required progress status bar contract (`status | phase X/Y | XX% | current | next`) in `AGENTS.md`.
- Added matching progress-bar fields to `README.md` strict task templates.
- Added `docs/ai/workflows.md` progress telemetry rules and blocked-state format.
- Added a universal all-model startup contract in `AGENTS.md` so Claude/Gemini/Copilot/Cursor all inherit the same behavior at project open.
- Updated `docs/ai/agent-support-matrix.md` to explicitly require the same runtime contract across all supported agent entrypoints.
- Ran AI docs maintenance checks:
	- `npm run docs:ai:sync`
	- `npm run docs:ai:check`
	- both passed.

## 2026-04-29 — File Splits · Dockerfile · Manifesto + Golden Rules

**Who:** Gevorg + Claude

### Done this session

- **App.jsx split** — all hook wiring extracted to `src/hooks/useAppState.js`. `App.jsx` is now 56 lines (was 795). Zero behavior change. 219 tests pass.
- **PreferencesPage + StudioShell splits confirmed** — these were done in a previous uncommitted session. Now documented as done.
- **Dockerfile for serverXR** — `serverXR/Dockerfile` finalized. Builds from repo root so `shared/` schema files are baked into the image. Only `/data` (SQLite + assets) is a volume. Runs as non-root user. Build: `docker build -f serverXR/Dockerfile -t dii-server .`
- **`.dockerignore`** — added at repo root. Excludes `node_modules`, `serverXR/data`, `.env`, `.git` from build context.
- **`MANIFESTO.md`** — platform vision, non-negotiables, and architectural seeds. Permanent record. Lives at repo root.
- **`docs/ai/golden_rules.md`** — living record of hard-won solutions and agent behavior rules. Wired into `AGENTS.md` and `docs/ai/index.md`.

---

## 2026-04-28 — Auth · Storage · Bug Sweep · Architecture Direction

**Who:** Gevorg + Claude

### Done this session

#### Fix 1 — Auth
- Removed `VITE_API_TOKEN` from the client bundle — the raw server token was being baked into the JavaScript at build time and was visible to anyone inspecting the bundle.
- Added `AuthGate` (`src/components/AuthGate.jsx`) — a proper login form shown when `requireAuth=true` and the user has no session. Replaces the old `window.prompt()` fallback.
- Added `useAuthSession` hook (`src/hooks/useAuthSession.js`) — fetches `/api/auth/session`, provides `login()` / `logout()`.
- Session cookies now handle all auth. Sockets already sent `withCredentials: true` so they pick up the session automatically.
- `frontend.env.production.example` no longer sets `VITE_API_TOKEN`.

#### Fix 2 — Storage
- Replaced filesystem JSON stores with SQLite (`better-sqlite3`). All space/project metadata, ops logs, and the project index now live in `{DATA_ROOT}/di.db`. Binary assets remain on disk.
- **Automatic first-startup migration**: existing `meta.json` / `ops.json` files are imported into SQLite and the migration is marked done. No manual step needed on deploy.
- **Race condition on ops fixed**: ops appends are now atomic SQLite transactions.
- **Project index is a query**: `findProjectById` no longer does a two-phase directory scan with a JSON file that could go stale.
- New files: `serverXR/src/db.js`, `serverXR/src/migrate.js`. Config: `DB_PATH` env var to override `{DATA_ROOT}/di.db`.

#### Simplify pass
- Prepared statements cached per DB instance in `spaceStore.js` and `projectStore.js` — built once, reused on every call. ~30-50% latency on metadata hot paths.
- Redundant final SELECT removed from `appendOpsHistory` / `appendProjectOps` — the routes never used the return value.
- Silent op-import failures in `migrate.js` now log with context.

#### Bug sweep
- Fixed 3 bugs where empty `catch {}` blocks were hiding real server errors in `useSceneInitializer.js` and `useLiveSync.js` — errors now surface via `console.warn`.
- Fixed 31 other intentional empty catches with `// ignore` comments — ESLint `no-empty` rule satisfied without changing behavior.
- **Result: 0 lint errors (was 37), 219 tests passing (was 219).**

### Architecture decisions made
- **VPS migration path confirmed**: serverXR backend is the move-critical piece. Frontend (static build) stays on cPanel or moves separately. Next infra step: Dockerfile + GitHub Actions.
- **Decentralization path identified**: op-log is CRDT-compatible. Asset IDs → SHA-256 content hashes would make them IPFS-compatible. These are seeds to plant, not immediate work.

---

## Current project state — for all readers

### For developers

**What exists and works:**
- Studio editor: project-based 3D scene authoring, inspector, camera, assets upload
- Beta editor: node graph system with typed ports, graph surface, wiring
- Real-time collaboration: Socket.IO + SSE ops sync, cursor sharing
- Auth: session-cookie login form, role-based access (viewer/editor/admin)
- Storage: SQLite for all structured data, filesystem for binary assets
- Deploy: cPanel Node.js App + cron pulling prebuilt GitHub branch

**What is broken or missing:**
- Delete key not wired in world/view surfaces (handler exists, no keyboard listener)
- No undo/redo in Beta editor node ops
- No outliner panel (node count badge exists, no click target)
- `geom.plane` texture port defined in registry but not read by viewport
- `world.background` node defined but viewport still reads from legacy `worldState`

**File sizes:** All three large files have been split.
- `PreferencesPage.jsx` → 443 lines (logic in `usePreferencesData.js`)
- `StudioShell.jsx` → 502 lines (panels in `StudioShellPanels.jsx`)
- `App.jsx` → 56 lines (all hook wiring in `src/hooks/useAppState.js`)

**Bundle issues:**
- `three-core` chunk: 740 kB (not lazy-loaded)
- Public production sourcemaps are disabled in Vite
- Route-level lazy loading exists for Studio/Beta/SpaceSurface, but deeper 3D chunk splitting is still open

**Routing:**
- Manual `window.location` / `popstate` — no router library
- Works but fragile; deep-link support is limited

### For designers and product

**Studio lane** (main shipped product):
- Project hub, project editor, inspector, asset panel, spaces panel, media panel
- Solid but monolithic — the large file sizes reflect this

**Beta lane** (experimental node-first direction):
- Node graph with wiring works
- Visual identity is di.i: black + cyan, square corners, monospace
- Missing: undo/redo, delete key, outliner, full viewport node feedback

**Landing page**: exists, currently double-click to reveal (hidden by default)

**What the platform is becoming**: a spatial editor for immersive XR experiences. Long-term direction is decentralized — scenes stored on IPFS, real-time via WebRTC, no central server dependency. This is the "heritage collection for future generations" vision.

### For infrastructure / ops

**Current deployment:**
- Frontend: cPanel public_html, static files
- Backend: cPanel Node.js App at `/serverXR`, PM2 via ecosystem.config.js
- Deploy trigger: cron job pulls prebuilt branch from GitHub every few minutes
- Data: `serverXR/data/` — SQLite DB + spaces directory with assets

**cPanel limitations hitting us:**
- No reliable process resurrection (PM2 restarts controlled by cPanel, not us)
- Shared disk I/O affects SQLite write performance under load
- No Docker, no background workers
- Awkward deploy pipeline (prebuilt branch model)

**Next infrastructure step:**
- Hetzner CX22 (~€4/mo): 2 vCPU, 4GB RAM, 40GB SSD
- PM2 for process management
- Nginx reverse proxy
- GitHub Actions: push → build → SSH deploy
- SQLite and assets on a mounted volume

---

## Easy wins — pick any of these next

> Self-contained. Each one 2-4 hours max. No research needed.

### Infra (unblock future scaling)
1. ~~**Dockerfile for serverXR**~~ — done. Build: `docker build -f serverXR/Dockerfile -t dii-server .` from repo root. Shared schema baked in, only `/data` volume needed at runtime.
2. **GitHub Actions workflow** — replace cPanel cron. Push to `staging` → build frontend → rsync dist + SSH restart.

### Quick feature completions
3. ~~**Delete key in world/view**~~ — done. World/View surfaces now listen for Delete/Backspace outside text inputs.
4. **`geom.plane` texture** — ~~add `textureUrl` port~~ — done (added in 2026-05-04).
5. ~~**`world.background` node drive**~~ — done. Beta viewport now reads the singleton graph node color before falling back to legacy `worldState.backgroundColor`.
6. ~~**Undo/redo in Beta**~~ — done (added in 2026-05-04b).

### File splits (reduce review friction)
7. ~~**Split `PreferencesPage.jsx`**~~ — done (`usePreferencesData.js` + `PreferencesShared.jsx`).
8. ~~**Split `App.jsx`**~~ — done (`useAppState.js` holds all wiring, `App.jsx` is 56 lines).

### Decentralization seeds
9. ~~**Content-addressed asset IDs**~~ — done. Upload routes use `crypto.createHash('sha256')`. `buildProjectAssetMeta` now requires `assetId` (no UUID fallback).

---

## Remaining priorities

| # | Priority | Item | Status |
|---|----------|------|--------|
| 1 | ~~HIGH~~ | Auth — token in bundle | ✓ Done |
| 2 | ~~HIGH~~ | Storage — filesystem race conditions | ✓ Done |
| 3 | ~~MEDIUM~~ | Large files — PreferencesPage, StudioShell, App | ✓ Done |
| 4 | ~~MEDIUM~~ | Bundle — reduce large 3D chunks | ✓ Done (manualChunks fixed · needs runtime verify) |
| 5 | MEDIUM | Routing — replace manual popstate | Open |
| 6 | INFRA | Dockerfile ✓ · GitHub Actions | Dockerfile done |
| 7 | FUTURE | Content-addressed assets (IPFS) | Routes done · client pre-hash TBD |
| 8 | FUTURE | CRDT sync (replace ops with Yjs) | Planned |
| 9 | FUTURE | WebRTC P2P mesh | Planned |

---

## Rule for all developers

**Before stopping work:**
1. Add an entry here (date, what changed, easy wins at the bottom)
2. Commit `PROGRESS.md` with your changes
3. Easy wins = tasks that are fully isolated, no research needed, clear where to start

This file is the handoff. If it is not updated, the next developer starts cold.

---

## 2026-04-24 — Node Cards + di.i Visual Identity + Staging Sync

**Who:** Gevorg + Claude

### Done this session

- **di.i visual identity applied** across beta app — `--di-cyan: #4df9ff`, black cards, square corners, monospace labels
- **Graph node cards redesigned** — hollow square `□` motif, cyan border, selected state glow
- **BetaHub main page** — `□ □ □` wordmark, `di.i studio_` heading
- **Hidden node auto-surface switch** (`BetaEditor.jsx:419`) — creating a hidden-render node auto-switches to Graph surface
- **Category colors** added to `NODE_CATEGORIES`
- **Staging updated** — dev merged to origin/staging

### Node system status

| Step | Status |
|------|--------|
| 1. Stabilize blank workspace | ~80% — missing undo/redo + keyboard shortcuts |
| 2. Local asset core | Not started |
| 3. Nodes replace legacy entities | Not started |
| 4. Graph authoring (edges/ports) | Works, no undo |
| 5. View UI fully authored | Not started |
| 6. Runtime adapters | Not started |
| 7. Recursive containers | Not started |
| 8. Publish + collaboration | Schema only |

---
