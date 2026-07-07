# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev

---

## Last commit

`b706282` — fix(studio): mouse wheel zooms instead of rotating the viewport
**Confirmed live on both staging and prod** (`di-studio.xyz`, verified via `/api/health` gitCommit).
`dev` and `main` are in sync.

**Uncommitted on top:** walk-mode config extraction (see below) — verified locally (lint, build,
412/412 tests, 15/15 `check:input`), not yet pushed.

## Last session (2026-07-07, part 2)

Ran a 6-way parallel full-codebase audit (project core, Studio/Beta, shared components,
XR/WCC/landing, serverXR, scripts/schema) and fixed the 4 critical findings (`03adf90`):

- **`wcc` space bypassed the login gate** every other space goes through (`RootApp.jsx`) — added
  `WccSurfaceRoute`, same `isPublic` check as every other space.
- **`/api/events` leaked recent request URLs + error text** with zero auth, in any config — now
  gated behind admin auth when `REQUIRE_AUTH` is on. `/api/health` deliberately stays public.
- **Silent data loss**: a failed document-op write was dropped with no retry — now requeues, sets a
  visible `pendingSyncError` (red dot in Studio's control cluster), retries after 4s.
- **Undo/redo in Studio + Beta bypassed the sync engine** — now routes through `replaceDocument`
  (network-backed) for project-backed workspaces.

Then two more, found from live user testing on staging:

- **WCC drag-look "not working"** — root cause was `DRAG_LOOK_SENSITIVITY` deliberately tuned 3x
  gentler than `POINTER_LOCK_SENSITIVITY` (untested theory), making the Wayland/Linux fallback path
  feel unresponsive. User-tuned live through 1x → 0.75x → 0.5x → **0.35x** final (`ea14581`).
- **Studio mouse wheel rotated instead of zoomed** — `StudioOrbit` guessed trackpad-vs-mouse from
  `ctrlKey` (same anti-pattern golden rules already flagged for the WCC Walker); every plain mouse
  wheel is also `ctrlKey:false`, so it always rotated. Fixed: wheel always dollies (`b706282`).

All 5 fixes merged `dev`→`main`, confirmed live on **prod** via `/api/health` gitCommit.

Then: user asked to "sync mouse and global things... in walk mode" — extracted all walk-mode
tuning constants (look sensitivity per input method, walk/fly speed, pitch limits, joystick/bounds)
out of `LiveProjectScene.jsx`'s inline consts into a new `src/components/walkModeConfig.js`, with
`DRAG_LOOK_SENSITIVITY` now defined as a ratio of `POINTER_LOCK_SENSITIVITY` instead of an
independent magic number. Pure refactor, no behavior change — verified via `check:input` (15/15,
one unrelated timing flake on first run, clean on retry) and the full suite. **Not yet pushed.**

All fixes have `known-fixes.md` rows.

## Earlier (prod, 07-07 part 1)

VR/AR controller locomotion fixed (strafe/turn/fly signs, AR passthrough fly extension) and a
doc-load-error/retry hardening for `LiveProjectScene.jsx` — both confirmed live on prod.

## What works

- Studio editor (five windows), Beta (node-first), WCC exhibition, orbit viewport, public viewer
- Auth (session-cookie, roles, OAuth), Admin Ops Graph, GitHub → space sync live on prod
- VR/AR controller locomotion confirmed correct on real headset (prod)
- Deploy: push `dev`→staging, `main`→prod, gated on `browser-checks.yml`

## What is broken / open

- **Walk-mode config extraction is uncommitted** — commit + push to `dev`, verify, then promote.
- Remaining audit findings not yet fixed (7 High, 7 Medium, 6 Low + ~14 dead-code items) — see the
  audit artifact from the 2026-07-07 session, not yet transcribed into known-fixes.md.
- Drive on prod: staging verified; prod live-check + Google OAuth sensitive-scope verification
  (manual, user-only) still pending.
- GitHub-sync App webhook not yet exercised against a real repo push.
- `origin/self-host` intentionally 1 commit ahead (`b9baa30`).

## Known fixes

→ **[docs/ai/known-fixes.md](docs/ai/known-fixes.md)** — check before investigating any bug.

## Deploy & validation

```bash
git push origin dev        # staging   |  merge dev→main + push = prod
npm run lint && npm run build && npm run test -- --run && npm run test:server-contracts && npm run docs:wiki:check
node scripts/smoke-check-cpanel.mjs --base-url <origin>   # prod/staging/local smoke
```
