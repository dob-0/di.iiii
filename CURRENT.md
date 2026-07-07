# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev

---

## Last commit

`2ef0884` — refactor(wcc): extract walk-mode tuning into one shared config file
**Live on staging** (`ea14581`+`b706282` confirmed on staging/prod earlier; `2ef0884` pushed after, not yet re-verified live). `main`/prod is one commit behind at `b706282`.

**Uncommitted on top:** Studio Scene-panel entity-list height cap (see below) — verified locally (lint, build, 412/412 tests), not yet pushed.

## Last session (2026-07-07, part 2)

Ran a 6-way parallel full-codebase audit and fixed the 4 critical findings (`03adf90`): `wcc`
space auth-gate bypass, unauthenticated `/api/events`, silent data loss on failed doc writes, and
Studio/Beta undo-redo bypassing the sync engine. All merged to `main`, confirmed live on prod.

Then, from live user testing on staging:

- **WCC drag-look "not working"** → `DRAG_LOOK_SENSITIVITY` tuned live to **0.35x**
  `POINTER_LOCK_SENSITIVITY` (`ea14581`).
- **Studio mouse wheel rotated instead of zoomed** → `StudioOrbit` was guessing trackpad-vs-mouse
  from `ctrlKey` (golden-rule violation); wheel always dollies now (`b706282`).
- Merged to `main`, confirmed live on prod.
- **Walk-mode tuning extracted** into `src/components/walkModeConfig.js` (one file for look
  sensitivity/speed/pitch-limits/bounds instead of scattered inline consts) — pure refactor
  (`2ef0884`), pushed to `dev`, not yet promoted.
- **Studio Scene panel: Transform kept sliding down as scene grew** — the entity list (`.spa-list`)
  had no height cap and shared one scroll region with the Transform inspector below it. Capped to
  `220px` with its own scroll (`src/studio/styles/studio.css`) — Transform's position no longer
  depends on entity count. Same fix applies to 3 other `.spa-list` usages (Drive/Commons pickers,
  Files library) that had the identical latent issue. **Not yet pushed.**

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

- **Scene-panel entity-list cap is uncommitted** — commit + push to `dev`, verify, then promote.
- `2ef0884` (walk-mode config refactor) is on `dev`/staging but not yet promoted to `main`/prod.
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
