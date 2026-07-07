# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev

---

## Last commit

`1fcb6d6` — fix(wcc): surface project-document load failures (dev, staging — not yet promoted to main/prod)
**Prod is at `0559427` (VR/AR fixes + gitignore, confirmed live). This newest commit (doc-load error/retry) is dev-only as of session end — promote to main when ready.**

## Last session (2026-07-07)

- **VR controller locomotion fixed after a rocky multi-round debug (`src/components/xrFlyControl.js`)**: left-stick strafe (`moveFromStick` uses `xAxis`, no negation) and right-stick turn (`xrTurnSpeed` negates base speed) — both **confirmed correct on a real headset**. Right-stick fly got flipped twice on an internally-contradictory test round, then reverted to the original 3x-confirmed sign (`-yAxis`). Full blow-by-blow in `docs/ai/known-fixes.md` — 5+ sign flips now, don't re-flip without a fresh deliberate headset re-test.
- **AR/passthrough fly extended**: right-stick fly used to require `isVr`; now also works when a controller is connected during AR/mixed-reality (`LiveProjectScene.jsx`, handheld phone AR unaffected).
- **`scratchpad/` gitignored** — was blocking the deploy script's clean-worktree check.
- **Desktop mouse-look investigated and hardened**: could not reproduce against the live deployed site or a properly-running local stack — `npm run check:input` passes 13/13 with the backend up. Root-caused a real, separate bug that plausibly explains the original report: a failed project-document fetch was caught silently (`useLiveProjectDocument`), leaving the opaque loading overlay (`pointer-events: all`) stuck forever with no error/retry — blocking all mouse/wheel input invisibly while WASD (independent of doc load) kept working. Added `loadError` state + auto-retry + visible "Couldn't load this space — Retry" UI; added 2 new `check:input` contracts (now 15/15) that force a 502 and verify recovery.

## Earlier (prod)

- 07-05: Walker input fixes (scroll=dolly, drag-to-look fallback); `npm run check:input` + `browser-checks.yml` gate both deploys; pre-push gate hook; pay-once rule codified; `npm run wcc:promote`; GitHub-sync webhook manifest-aware.
- 07-02: Unified Files library; Commons moderation + guest-share gate; Drive import; five-window Studio.

## What works

- Studio editor (five windows: Create/Scene/World/Share/Code), unified Files library, quick insert, undo/redo, persisted layout
- Beta editor: graph-first layout, node palette, undo/redo, outliner
- WCC exhibition (LiveProjectScene): WASD + mouse/trackpad + drag-look fallback (verified via 15/15 `check:input` contracts, backend must be running); VR/AR controller locomotion confirmed correct on real headset; orbit viewport: drag rotate/pan, scroll zoom
- Auth (session-cookie, roles, GitHub/Google OAuth); Admin Ops Graph → Manage; GitHub → space sync live on prod
- Deploy: push `dev`→staging, `main`→prod, gated on `browser-checks.yml`, auto smoke; `npm run wcc:promote` for staging→prod project promotion

## What is broken / open

- **Drive on prod**: staging verified; prod live-check + Google OAuth sensitive-scope verification (manual, user-only) still pending.
- GitHub-sync App webhook is manifest-aware now but **not yet exercised against a real repo push** — verify on next br_id_ge push.
- `origin/self-host` intentionally 1 commit ahead (`b9baa30`).

## Known fixes

→ **[docs/ai/known-fixes.md](docs/ai/known-fixes.md)** — check before investigating any bug.

## Deploy & validation

```bash
git push origin dev        # staging   |  merge dev→main + push = prod
npm run lint && npm run build && npm run test -- --run && npm run test:server-contracts && npm run docs:wiki:check
node scripts/smoke-check-cpanel.mjs --base-url <origin>   # prod/staging/local smoke
```
