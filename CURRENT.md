# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev

---

## Last commit

`dev` at `e374d70f` (own scope this session, not yet pushed — see Open).
`main` still at `f656bc63`; nothing from this or the prior session has
been promoted to `main` yet.

## Last session (2026-07-18 — Studio wrong-space bug fix + hardening batch 1+2)

- Real user-reported bug: opening a project in Studio via a direct/
  bookmarked link (no space segment in the URL, e.g. from admin's
  "Open in Studio") silently landed in the `main` space instead of the
  project's real space — everything but the project document itself
  (assets, publish state, back-to-hub link) was wrong. Root cause:
  `getStudioLocationState` (`src/studio/utils/studioRouting.js`)
  hardcoded `spaceId: defaultSpaceId` for space-less URLs instead of
  leaving it unset, pre-empting `StudioEditor`'s own fallback to
  `document.projectMeta.spaceId`. Fixed + admin's two "Open in Studio"
  buttons (`AdminManageSection.jsx`) switched from an async `space`
  lookup (`space?.id`, could resolve null/stale) to `project.spaceId`
  (DB-sourced, travels with the project row). Regression tests added;
  known-fixes.md updated. Pushed to `dev`, staging verified.
- User then asked for a "full audit + hardening plan" covering this bug
  class, general security, and AI-agent stale-fact citation (caught the
  agent citing an old cPanel deploy workflow and a wrong Ollama model
  name in the same session). Planned via EnterPlanMode, approved, shipped
  in two batches (not yet pushed — local commits `1a56e9a7`, `e374d70f`):
  - **Batch 1**: `config.js` now hard-fails boot in production if
    `AUTH_SESSION_SECRET` falls back to an API token instead of only
    warning; CI + Dependabot gained `npm audit` coverage (root +
    serverXR); new `scripts/check-fallback-patterns.mjs` (CI-gated)
    greps `serverXR/src` for the "silent hardcoded fallback" bug-class
    shape; `known-fixes.md` got a bug-class header naming all 4 known
    instances; `golden_rules.md`/`agent-operating-contract.md` gained a
    "verify infra/deploy/tool facts before citing" rule.
  - **Batch 2**: new `fallbackContracts.test.js` (server-side analog of
    the spaceId bug, wired into `test:server-contracts`) +
    `authAccess.test.js` cases locking in null/undefined-spaces-means-
    unrestricted semantics; `docs:ai:check`'s rot-scan extended to
    `docs/deploy/*.md` for stale legacy-workflow-name citations — running
    it for real found and fixed two genuinely stale citations beyond the
    known allowlist candidates (`.claude/agents/infra.md` still called
    the cPanel workflow "Current deploy"; `deploy/AGENTS.md` still
    described the VPS path as unconfigured/additive when it's been live
    primary since 2026-07-15).
  - User's own global `~/.claude/CLAUDE.md` (outside this repo) also had
    the same stale cPanel deploy claim — fixed on request.
  - Full plan: `/home/nooo/.claude/plans/stateless-greeting-bengio.md`.
    Deferred items (not started): recover/re-list the ~23 untriaged audit
    findings, decide whether to test-gate `deploy-space-code.yml`, rotate
    the stale GitHub App key, a speculative periodic memory-self-audit.

## Previous session (2026-07-17 cont'd — landing "Enter Space" target + a real Walk/Fly UX bug, both shipped to staging only)

- Built "Enter Space" (landing page) to open an admin-chosen populated
  space instead of an empty decorative void — first attempt invented a
  new `landingSpaceId` config field; user caught it as wrong ("no its
  tooo old bag" energy but for design this time) — reverted and reused
  the platform's existing "Main" space concept (`defaultSpaceId`)
  instead, and consolidated its one remaining write-UI into `/admin`
  (removed the duplicate inline "Set main" from Studio Hub's grid + map
  views). `GET/PATCH /api/config` unchanged in final shape.
- CI flaked once on an unrelated pre-existing test
  (`projectContracts.test.js` "unrecoverable-project" ENOENT) — passed
  57/57 locally, re-ran the failed CI job rather than guessing, it
  went green on retry.
- Verified the whole loop live end-to-end via direct VPS/container
  `node -e fetch(...)` calls to staging's own `/api/config` (using the
  container's own `ADMIN_API_TOKEN`, never extracted to disk) + headless
  Playwright — set `beyond-form` as Main, confirmed Enter Space
  navigated there, then cleared it back to `null` per the user's
  correction that it was only ever a test value.
- Real bug from user report: after using a real project's "Walk / Fly"
  toggle (`PublicProjectViewer.jsx`), there was no way back to the calm
  view without a full page Exit + re-Enter. The toggle-back mechanism
  actually already worked — verified live, round-trips fine — the only
  real defect was its label: `LiveProjectScene`'s chrome exit button was
  hardcoded `← Exit`, identical wording to the landing page's own real
  "Exit space", so it read as "leaves the page" when it doesn't. Added
  an `exitLabel` prop (default unchanged for `WccExperience.jsx`'s real
  exit case), `PublicProjectViewer` now passes `"← View mode"`.
  Regression test mocks `LiveProjectScene` to assert the label and the
  round trip back to the `Walk / Fly` button.
- Also shipped a smaller, separate, tested addition to the landing
  page's own decorative preview: a "◐ View mode" button + `V` key so it
  can flip back to the calm orbit view without a full Exit + re-Enter
  either — same idea in miniature, not the actual bug fix.
- None of staging's current public spaces (`wcc`, `beyond-form`,
  `br-id-ge`) expose the generic Walk/Fly button — they're all custom
  experiences — so the real-viewer fix could only be click-verified
  locally against `/main`, not live on staging; user confirmed the
  landing-page toggle live on staging separately (after a hard refresh
  cleared a stale cached bundle).
- Made the "Made with di.iiii" badge minimal + `mix-blend-mode:
  difference` so it reads on any published site's theme instead of a
  fixed dark-cyan pill that clashed on a B/W brutalist site.

## Earlier this session (perf audit shipped to staging, two live bugs found+fixed, promoted to prod)

- Ran a deep perf audit (5 parallel research agents) across build
  chunking, code-splitting, asset caching, server query paths, and Beta/
  Studio render loops; shipped all 12 fixes to `dev`/staging with
  regression tests for each (confirmed failing pre-fix via `git stash`).
- User manual-tested staging and hit a real live bug: `GET /projects/
  main/document` 500ing repeatedly. Root cause: `/data/spaces/*` on the
  staging volume was `root`-owned (leftover from an earlier `docker cp`
  import) while the server runs as non-root `app` → `EACCES` on the
  read-path write-back. Fixed live via `docker exec -u root ... chown -R
  app:app /data/spaces` on the VPS, no code change; verified via repeat
  200s + a headless Playwright check.
- Second live bug: mouse-look (pointer-lock/drag camera rotation) didn't
  turn the camera on `/wcc/scene`, though WASD worked and `?inputdebug=1`
  showed healthy lock state + changing yaw/pitch. User insisted this was
  old and pre-existing, not caused by the perf work — asked to
  git-blame/compare history instead of bisecting today's commits.
  `git log -L` on the spawn effect found it: commit `a79c689c`
  (2026-06-29, data-driven spawn) reassigns `playerRef.current` to a
  whole new object once `worldState.spawn` loads; `Walker`'s mouse/touch-
  look listeners are wired up once at mount and closed over the old
  object, so mouse-look kept mutating an orphaned object forever while
  the camera's per-frame code read the new one. Fixed with `Object.assign`
  (mutate in place) instead of reassignment — `src/components/
  LiveProjectScene.jsx`.
- Also hardened `deploy/vps-restore.sh` to `chown -R 100:101 /data` after
  restore, matching the same ownership class of bug.
- User re-verified mouse-look fixed on staging, then approved promoting
  `dev` → `main`; fast-forwarded and pushed, production deploy triggered.
- A concurrent audit session was working on this same repo/branch in
  parallel this session too (own `perf(ci)` commit, own `CURRENT.md`
  coordination note at `d6eb7e19`) — no conflicts, just interleaved
  pushes to `dev`.

## Previous session (2026-07-17 — multi-world graphs + live Studio 3D render, dev-only)

User wanted TouchDesigner-style multi-world: several independent worlds
(one per node-scope), one marked "live", rendered as real 3D inside Studio
— not just a read-only graph view. Explicit "max extended version" ask, 4
phases, each committed:
1. **Scoped singletons** — `world.light`/`background`/`grid`/`universe.world`
   moved from document-wide to per-scope dedup (`getSingletonDedupKey`,
   `typeId::parentId`) in `src/shared/projectSchema.js` + CJS mirror
   `shared/projectSchema.cjs`.
2. **Scoped rendering** — `BetaViewport.jsx` gained `scopeId`; each World's
   own `values.bgColor` is now load-bearing (was inert), falls back to
   `document.worldState` last (untouched, still Studio's own concern).
3. **Live pointer** — `workspaceState.liveWorldNodeIdByScope` map via
   existing `setWorkspaceState`/`mergePatch` (no new op type); "●" toggle
   on Beta World panels.
4. **Studio render pane** — new `StudioWorldSurface.jsx` (reuses
   `BetaViewport` read-only), flag-gated "W" split button in
   `StudioViewportLayout.jsx`, dev-only (`isGraphViewEnabled()`).

Known, flagged (not silently dropped): `isWorldFullscreen` still one
boolean not per-world; Studio's multi-live-world tie-break is arbitrary
first-in-document-order (no scope-nav UI in Studio yet).

Live-browser click-through now done: installed Playwright's bundled
Chromium, drove it via raw CDP (its `chrome` channel needs root to
install, unavailable here). Beta → created/live-marked a World, added a
Cube inside its scope → Studio on the same project, clicked "W", got a
second independent WebGL canvas rendering that World's real scene with a
"READ-ONLY · LIVE WORLD" badge, zero console errors.

`npm run lint`/`build`/`test` clean throughout (737/737 tests, up from 726).

### Previous sessions (compressed — see PROGRESS.md for full detail)

- **2026-07-17, Beta audit → Studio graph pane**: fixed a real window-
  clipping CSS bug (`.beta-window` flex layout), corrected stale docs,
  deduped routing plumbing, extracted node-graph engine into
  `src/project/graph/`, added Studio's first read-only graph pane
  (`StudioGraphSurface.jsx`, dev-only "N" split), fixed a Node-0-deletion
  safety bug. 726/726 tests.
- **2026-07-16, full repo audit**: fixed path-traversal/auth-scope bug in
  `syncRoutes.js`, a lost-update race on concurrent doc writes (new
  `asyncLock.js` + DB unique constraint), confirmed nightly VPS backups
  already existed (committed + added validated restore script). ~23 lower
  findings still open, see `docs/ai/known-fixes.md`.
- **Earlier**: deploy pipeline made real (staging+prod on VPS/Docker/Caddy),
  OAuth sign-in bug fixed (state signed per-request, not once at startup).

## What works

- Studio (six desktop panels — Create/Scene/World/Share/Code/Projects — five on the mobile nav, + phone layout + visual help), Beta, WCC, viewer
- Auth (session-cookie, roles, OAuth-first, CSRF-protected) + open-space/sandbox grants
- Production + staging both live on VPS, deploy via `git push origin main`/`dev`
- Nightly VPS backups + validated restore path
- Studio dev-only panes: read-only node-graph ("N" split) and live-world 3D ("W" split)

## Open

- Push this session's local `dev` commits (`1a56e9a7`, `e374d70f`,
  hardening batches 1+2) — not yet asked for. The earlier spaceId bug fix
  (`74cad01f`) is already pushed and staging-verified.
- Hardening plan deferred items (see plan file above): recover/re-list
  the ~23 untriaged findings below, decide on test-gating
  `deploy-space-code.yml`, rotate the stale GitHub App key, a speculative
  periodic memory-self-audit.
- Promote this session's `dev` work (Enter Space/Main-space reuse, the
  Walk/Fly "View mode" label fix, badge minimal restyle) to `main` when
  the user is ready — not yet asked for.
- No published staging space currently exercises the generic Walk/Fly
  button (all are custom experiences) — if that regression test class
  matters going forward, consider publishing one plain `entryView:
  'scene'` demo project.
- ~23 lower-priority audit findings untriaged — `docs/ai/known-fixes.md`.
- Studio dev-only panes need a product decision before leaving dev-only:
  inspector wiring, flag rollout audience, Beta-vs-Studio long-term shape.
- Off-box backup copy still missing (VPS-local only).
- `main`'s branch protection still bypassed by admin-override direct pushes.
- Brand: canonical domain/handle undecided; `/privacy` not wired into routes.
- Real-device click-through owed: guest journey + invite flow.
- Drive Picker blocked on Cloud console. Stale GitHub App key in `serverXR/.env.local`.

## Known fixes → [docs/ai/known-fixes.md](docs/ai/known-fixes.md) — check before any bug hunt.

## Deploy & validation

```bash
git push origin dev        # deploys to VPS staging — verified working
git push origin main       # deploys to VPS production — verified working
npm run lint && npm run build && npm run test -- --run && npm run test:server-contracts && npm run docs:wiki:check
```
