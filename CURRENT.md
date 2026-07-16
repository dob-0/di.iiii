# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev

---

## Last commit

`dev` has fixes not yet on `main` (this session's Beta/Studio work plus a
parallel session's full-repo audit fixes, both below — not pushed yet as of
this write-up). Deploy pipeline is live and verified on both branches; both
staging and production confirmed healthy on their last deployed commits.

## Last session (2026-07-17 — Beta deep audit → node-graph engine shared into Studio, dev-only preview)

- User reported the new Chat floating-window's input was clipped off-screen
  at high browser zoom, then asked for a full Beta audit ("feels messy"),
  then asked to actually connect Beta's node-graph system into Studio
  rather than just clean Beta up in isolation. Ran a 6-phase plan (approved
  via plan mode), each phase committed + tested + manually click-through
  verified in headless Chromium (`--use-angle=swiftshader` for real
  software-rendered WebGL, needed for the Studio phase — default headless
  GL doesn't work in this sandbox and there's no error boundary, so a WebGL
  init failure blanks the whole page silently):
  1. Fixed the clipping bug: `.beta-window-body`'s hardcoded
     `calc(100% - 58px)` didn't survive the header wrapping to 2 rows;
     switched `.beta-window` to a flex column. Affects all 5 Beta floating
     windows, not just Chat.
  2. Corrected `docs/studio-beta-fork-map.md` — it claimed 7 Beta re-export
     shim files were still "safe to delete"; checked directly, they'd
     already been deleted, doc just never updated. Also its line counts
     had drifted (re-measured everything).
  3. Deduped `betaRouting.js`/`studioRouting.js`'s identical base-path
     plumbing into `src/project/routing/laneBasePath.js`. Did **not** merge
     `betaGuide.js`/`studioGuide.js` — read both fully first and found
     they're not actually duplicates, just the same informal pattern with
     different content/exports; forcing a merge would've been a fake
     abstraction.
  4. Extracted `useNodeGraphScope` (breadcrumb/scope navigation) and
     `buildNodeValues`/node authoring out of `BetaEditor.jsx` (was 1,142
     lines) into `src/project/graph/`, lane-agnostic, with real unit tests
     (this logic had zero coverage before).
  5. **The actual Studio integration.** Corrected another stale assumption
     first: the fork-map doc and initial plan both assumed
     `useViewportLayout`'s `viewType` field was already a live render
     switch — direct inspection showed `LayoutNode` only branches on
     `node.type`, never reads `viewType` at all. Added that branch for
     real: new `StudioGraphSurface.jsx` (reuses `BetaGraphSurface`
     directly — verified zero CSS collisions with `studio.css` before
     importing `beta.css`), a new `GraphPane` in `StudioViewportLayout.jsx`,
     and a flag-gated "N" split button. Gated behind
     `isGraphViewEnabled()` = `import.meta.env.DEV` — **false in every
     production build**, so this cannot reach a real Studio user yet.
     Strictly read-only (no mutating callbacks passed through) — node
     selection is local/informational, not wired into `StudioInspector`.
     Verified live: split a graph pane in Studio's "open-jam" project,
     confirmed it rendered the project's actual Node 0 (same document Beta
     edits), side-by-side with a working 3D viewport.
  6. Fixed a real bug the audit surfaced: Node 0 (Beta's root node) was
     silently deletable via two different paths (Delete FAB, and the graph
     canvas's own Delete-key listener reachable via selecting Node 0 in the
     Outliner) — deleting it silently removed the entire topbar with no
     warning. Added `isRootGraphNode()` guard in the shared engine, both
     paths now `window.confirm()` first. Full writeup:
     `docs/ai/known-fixes.md`.
- **Explicitly out of scope, by design** — flagged as open product
  decisions, not silently picked: whether graph-node selection should
  drive `StudioInspector`, the feature-flag rollout audience beyond
  dev-only, whether this is step one toward retiring Beta or a permanent
  parallel lane, and a list of other real-but-orthogonal Beta UX findings
  (undiscoverable wire-deletion/pan/zoom, redundant Node-0 access paths,
  overflow-menu weighting, inconsistent window-persistence between
  Outliner/Chat vs graph-backed windows) — tracked, not fixed this pass.
- A parallel session ran its own full-repo audit throughout — both sessions
  committed to `dev`/`main` concurrently all day, merged cleanly. One
  near-miss: a commit briefly landed on `main` instead of `dev` when the
  other session's checkout automation moved HEAD mid-command; caught
  immediately, fixed with a clean fast-forward, no data lost, no rewrite.
- `npm run lint`/`build`/`test` all clean throughout (726/726 tests passing
  at session end, up from 640).

### Previous session (2026-07-16 — full 6-phase repo audit + top-5 fixes)

- Ran a 6-phase parallel audit (serverXR backend, schema/op-log/CRDT, node
  system, 3D/viewport, Studio/Beta frontend, infra/deploy) — ~28 findings,
  full list + rationale in `docs/ai/known-fixes.md`. Fixed the top 5:
  1. **Path traversal + auth-scope bypass in `syncRoutes.js`** — never
     sanitized `spaceId` before touching the filesystem; fixed to match
     every other route's `normalizeSpaceId` + 400 pattern.
  2–4. **Lost-update race** in `POST /api/{spaces,projects}/:id/ops` and the
     full-document/scene replace paths — version-checked across multiple
     `await`s with no atomicity, so two concurrent writes at the same
     version could both succeed, one silently clobbering the other. Fixed
     with a new per-key async lock (`serverXR/src/asyncLock.js`) around the
     whole check-then-write; DB gained a `dedupeAndUniqueOps` migration
     making `(space_id/project_id, version)` genuinely `UNIQUE` (defense in
     depth). Regression tests fire truly concurrent (`Promise.all`) HTTP
     requests against a real spawned server and prove exactly one wins.
     Golden rule added — this exact shape existed in 3 places at once.
  5. **"No backup" — false positive.** A working nightly backup cron
     (`/root/vps-backup.sh`) was already live on the VPS; the audit only
     saw the git repo, which never had it committed. Committed it
     (`deploy/vps-backup.sh`) plus a new, validated `deploy/vps-restore.sh`
     (dry-run tested against a scratch Docker volume, not prod). Documented
     in `docs/deploy/VPS_DOCKER_DEPLOY.md`. Still open: backups are
     VPS-local only, no off-box copy.
  Full test suite (640 tests) + build pass clean.
- Remaining ~23 lower-priority findings from the audit are listed in
  `docs/ai/known-fixes.md` — not yet triaged/fixed.

### Earlier 2026-07-16 sessions (compressed — see PROGRESS.md for full detail)

- Deploy pipeline (`deploy-vps.yml`/`deploy-vps-staging.yml`) made real for
  the first time; staging OAuth configured + seeded with prod's real
  spaces (`wcc`, `br-id-ge`, `beyond-form`); live OAuth sign-in bug fixed
  (state signed once at startup instead of per-request); one brief prod
  outage caused and recovered (bad `client`/`caddy` healthcheck — don't
  re-add one without testing the exact command against a real container).

## What works

- Studio (five windows + phone layout + visual help + coach marks), Beta, WCC, viewer
- Auth (session-cookie, roles, OAuth-first, CSRF-protected login) + open-space/sandbox implicit grants
- Production + staging both live on the VPS (Docker/Caddy), both deploy via
  `git push origin main`/`dev` — verified working end-to-end, release.json included.
- Nightly VPS backups (see `docs/deploy/VPS_DOCKER_DEPLOY.md`), restore path now written and validated.
- Studio can split off a read-only node-graph pane (dev-only, `import.meta.env.DEV`-gated "N" split button) showing the project's real Beta document.

## Open

- Push this session's fixes to `dev`, verify on staging, promote to `main`.
- ~23 lower-priority audit findings not yet triaged — see `docs/ai/known-fixes.md`'s latest entry.
- **Studio node-graph preview is dev-only** (`isGraphViewEnabled()` gates on
  `import.meta.env.DEV`) — needs a real product decision before it can go
  further: (1) should graph-node selection drive `StudioInspector` or stay
  independent, (2) feature-flag rollout audience once it's ready to leave
  dev-only, (3) is this step one toward retiring Beta or a permanent
  parallel lane. Also deferred: several real Beta UX findings (undiscoverable
  wire-deletion/pan/zoom, redundant Node-0 access paths, overflow-menu
  weighting, inconsistent window-persistence between Outliner/Chat vs
  graph-backed windows) — not fixed, tracked only.
- Off-box backup copy still missing (VPS-local only) — needs a destination/credentials decision.
- `main`'s "PR required" branch protection is still bypassed by direct pushes (admin override) — decide whether to enforce it.
- Brand: canonical domain/handle undecided (di-studio.xyz vs thedi.studio vs IG handle); `/privacy` still not wired into app routes.
- Real-device click-through owed: guest journey + invite flow.
- ANSCC research-grant angle for `br_id_ge` — ~1 month out, if pursued.
- Drive Picker blocked on Cloud console. Stale GitHub App key in `serverXR/.env.local`.
- Orphaned cPanel `.htaccess`/PHP files + cron scripts — left alone, still back the intentionally-preserved cPanel fallback until its hosting term expires.

## Known fixes → [docs/ai/known-fixes.md](docs/ai/known-fixes.md) — check before any bug hunt.

## Deploy & validation

```bash
git push origin dev        # deploys to VPS staging — verified working
git push origin main       # deploys to VPS production — verified working
npm run lint && npm run build && npm run test -- --run && npm run test:server-contracts && npm run docs:wiki:check
```
