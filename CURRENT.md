# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev

---

## Last commit

`dev` has fixes not yet on `main` (this session's multi-world pass plus
earlier Beta/Studio and full-repo audit work — not pushed yet). Deploy
pipeline live and verified on both branches; staging/production both
healthy on their last deployed commits.

## Last session (2026-07-17 — multi-world graphs + live Studio 3D render, dev-only)

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

**Owed:** real live-browser click-through — Playwright's Chromium isn't
installed in this sandbox, manual CDP scripting was deprioritized; relied
on the phases' new unit/regression coverage + clean lint/build instead.
Do this before the feature leaves dev-only.

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

- Push this session's fixes to `dev` → verify staging → promote to `main`.
- Live-browser click-through owed for the multi-world pass (see above).
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
