# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev

---

## Last commit

`03adf90` — fix: close 4 critical findings from full-codebase audit
**Confirmed live on staging** (`staging.di-studio.xyz`, verified via `/api/health` gitCommit + `/api/events` gating). Not yet promoted to `main`/prod.

**Uncommitted on top:** a 5th fix (drag-look sensitivity, see below) — verified locally (15/15 `check:input`, 412/412 tests), not yet pushed.

## Last session (2026-07-07, part 2)

Ran a 6-way parallel full-codebase audit (project core, Studio/Beta, shared components,
XR/WCC/landing, serverXR, scripts/schema) and fixed the 4 critical findings (all in `03adf90`,
live on staging):

- **`wcc` space bypassed the login gate** every other space goes through (`RootApp.jsx`) — added
  `WccSurfaceRoute`, same `isPublic` check as every other space.
- **`/api/events` leaked recent request URLs + error text** with zero auth, in any config — now
  gated behind admin auth when `REQUIRE_AUTH` is on. `/api/health` deliberately stays public.
- **Silent data loss**: a failed document-op write was dropped with no retry — now requeues, sets a
  visible `pendingSyncError` (red dot in Studio's control cluster), retries after 4s.
- **Undo/redo in Studio + Beta bypassed the sync engine** — now routes through `replaceDocument`
  (network-backed) for project-backed workspaces.

Then the user manually checked `/wcc/scene` on staging and reported mouse-look "not working."
Investigated live with Playwright (headless *and* headed against this machine's real Wayland
session) — pointer lock engaged fine and the camera rotated correctly in every test. Root cause
found by inspection, not repro: **`DRAG_LOOK_SENSITIVITY` (the fallback path used exactly when
pointer lock is denied — the Wayland/Linux population most likely to report this) was deliberately
tuned 3x gentler than `POINTER_LOCK_SENSITIVITY`**, on an untested "drag distances run larger"
theory — for a normal human drag gesture it just reads as unresponsive. Unified both constants.
Row added to `docs/ai/known-fixes.md`. **Not yet committed.**

## Earlier (prod, 07-07 part 1)

VR/AR controller locomotion fixed (strafe/turn/fly signs, AR passthrough fly extension) and a
doc-load-error/retry hardening for `LiveProjectScene.jsx` — both confirmed live on prod at `ed79b06`.

## What works

- Studio editor (five windows), Beta (node-first), WCC exhibition, orbit viewport, public viewer
- Auth (session-cookie, roles, OAuth), Admin Ops Graph, GitHub → space sync live on prod
- VR/AR controller locomotion confirmed correct on real headset (prod)
- Deploy: push `dev`→staging, `main`→prod, gated on `browser-checks.yml`

## What is broken / open

- **Drag-look sensitivity fix is uncommitted** — commit + push to `dev`, then re-verify on staging.
- **`03adf90` (the 4 audit fixes) is live on staging but not yet promoted to `main`/prod.**
- Remaining audit findings not yet fixed (7 High, 7 Medium, 6 Low + ~14 dead-code items) — see the
  audit artifact from this session, not yet transcribed into known-fixes.md. Worth a follow-up pass.
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
