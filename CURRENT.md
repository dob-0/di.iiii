# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev

---

## Last commit

`main` promoted to `f656bc63` (fast-forward from `dev`) and deployed to
production — user tested staging first (including a live mouse-look
retest), confirmed healthy, then explicitly asked to push to `main`.
Both `dev` and `main` are even.

## Last session (2026-07-17 — perf audit shipped to staging, two live bugs found+fixed, promoted to prod)

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

- Do a quick prod smoke-check now that `main` deployed (same checklist
  run on staging: routes, sign-in, node dragging, tab sync, model cache).
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
