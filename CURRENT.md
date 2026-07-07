# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev

---

## Last commit

`ea14581` — fix(wcc): tune drag-look sensitivity down to 0.35x pointer-lock
**Confirmed live on staging** through `fd6c646`; `ea14581` and the Studio wheel-zoom fix below are pushed but not yet re-verified live.

**Uncommitted on top:** Studio viewport wheel-zoom fix (see below) — verified locally (lint, build, full suite 412/412), not yet pushed.

## Last session (2026-07-07, part 2)

Ran a 6-way parallel full-codebase audit (project core, Studio/Beta, shared components,
XR/WCC/landing, serverXR, scripts/schema) and fixed the 4 critical findings (`03adf90`, live on
staging, verified via `/api/health` gitCommit + `/api/events` gating):

- **`wcc` space bypassed the login gate** every other space goes through (`RootApp.jsx`) — added
  `WccSurfaceRoute`, same `isPublic` check as every other space.
- **`/api/events` leaked recent request URLs + error text** with zero auth, in any config — now
  gated behind admin auth when `REQUIRE_AUTH` is on. `/api/health` deliberately stays public.
- **Silent data loss**: a failed document-op write was dropped with no retry — now requeues, sets a
  visible `pendingSyncError` (red dot in Studio's control cluster), retries after 4s.
- **Undo/redo in Studio + Beta bypassed the sync engine** — now routes through `replaceDocument`
  (network-backed) for project-backed workspaces.

Then: user reported mouse-look "not working" on `/wcc/scene` on staging. Investigated live with
Playwright (headless *and* headed against this machine's real Wayland session) — pointer lock and
drag-look both worked in every automated test. Root cause found by inspection: `DRAG_LOOK_SENSITIVITY`
was deliberately 3x gentler than `POINTER_LOCK_SENSITIVITY` on an untested theory, making the
Wayland/Linux fallback path feel unresponsive. User-tested through several values (1x → 0.75x →
0.5x → **0.35x** final) live against localhost, each pushed to `dev`/staging in turn.

User then flagged a second, unrelated bug: **Studio's mouse wheel rotated the camera instead of
zooming it.** `StudioViewport.jsx`'s `StudioOrbit` set `wheel: ctrlKey ? DOLLY : ROTATE` to give
trackpad swipe a "look around" feel — but a plain mouse wheel is *also* `ctrlKey: false`,
indistinguishable from a trackpad swipe on that signal, so every normal mouse scroll rotated
instead of zoomed. Same "guess the device" anti-pattern the golden rules already flagged once for
the WCC Walker. Fixed by removing the guess entirely — wheel always dollies now. **Not yet pushed.**

All 5 fixes have `known-fixes.md` rows.

## Earlier (prod, 07-07 part 1)

VR/AR controller locomotion fixed (strafe/turn/fly signs, AR passthrough fly extension) and a
doc-load-error/retry hardening for `LiveProjectScene.jsx` — both confirmed live on prod at `ed79b06`.

## What works

- Studio editor (five windows), Beta (node-first), WCC exhibition, orbit viewport, public viewer
- Auth (session-cookie, roles, OAuth), Admin Ops Graph, GitHub → space sync live on prod
- VR/AR controller locomotion confirmed correct on real headset (prod)
- Deploy: push `dev`→staging, `main`→prod, gated on `browser-checks.yml`

## What is broken / open

- **Studio wheel-zoom fix is uncommitted** — commit + push to `dev`, then verify on staging.
- **`ea14581` (audit fixes + drag-look tuning) is live on staging but not yet promoted to `main`/prod.**
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
