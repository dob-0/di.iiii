# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev

---

## Last commit

`dev` pushed to `origin` and deployed to staging — CI green, staging
healthy. `main` not yet updated (multi-world pass + full-repo audit work
still only on `dev`). Local checkout is 1 commit ahead of `origin/dev`
(a `perf(ci)` commit from the concurrent audit session, not yet pushed by
them — leave it for them to push, not ours to publish).

## Last session (2026-07-17 — pushed multi-world pass to staging, coordinated with concurrent audit session)

- Pushed `dev` (multi-world pass + everything queued behind it) to
  `origin/dev` → `Deploy VPS Staging` succeeded, staging is live on it.
- A concurrent session is independently running a full-repo audit,
  committing straight to `dev` on this same machine in parallel (same git
  identity `dob-0`, tagged `(audit #N)`) — confirmed by commit history,
  not assumed.
- Their audit work shipped a flaky test (`httpContracts.test.js`'s
  sync-status rate-limit test, real HTTP/disk I/O, 5000ms default
  timeout) that failed one CI run under runner load. Per their own
  in-file comment this now also gates real deploys, so asked to stabilize
  rather than ignore — they fixed it themselves (`fee4fa91`, timeout
  5000ms→20000ms, no behavior change) before we touched it. CI green
  since.
- Net: nothing left outstanding from this session's own scope; watched
  CI/deploy status via `gh run list` rather than guessing.

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

- Promote `dev` → `main` when ready (staging verified healthy, prod not
  yet updated).
- Concurrent audit session has a local unpushed `perf(ci)` commit on this
  checkout — not pushed on their behalf; check if it's landed next session.
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
