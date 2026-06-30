# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev

---

## Last commit

`2890c61` — fix(wcc): increase mouse look sensitivity to 0.018
**`origin/main` == `origin/dev` == `2890c61`, LIVE on di-studio.xyz. Working tree has uncommitted `src/wcc/landing/landing.css` changes (minor, pre-existing).**

## Last session (2026-06-29)

- **Auth patch-refresh bug fixed**: `GET /api/auth/session` now re-syncs role/spaces/isUnrestricted from DB when cookie is stale — admin patches take effect on next page load, no re-login needed (`serverXR/src/index.js`).
- **Emilya access**: granted admin role + space access via Ops Graph → Manage → People. She must sign out and back in once (before the session-refresh fix was deployed).
- **Studio viewport trackpad**: two-finger swipe = rotate (FPS look-around), pinch = zoom. Implemented via per-event `mouseButtons.wheel` switch in `StudioOrbit` (`StudioViewport.jsx`).
- **WCC exhibition mouse**: pointer lock look-around was broken because our wheel handler was rotating on regular mouse scroll (deltaY ~100 × sensitivity = 23°/tick). Fixed: wheel-to-rotate only fires for trackpad-like events (pixel-mode AND delta < 60). Added `.catch()` to `requestPointerLock()` so silent failures don't leave the user stuck.
- **WCC exhibition trackpad**: two-finger swipe look-around added to `Walker` (`LiveProjectScene.jsx`), guarded to skip mouse scroll wheel events.
- **Mouse sensitivity tuned**: `POINTER_LOCK_SENSITIVITY` 0.0055 → 0.018 (pointer lock bypasses OS acceleration so raw values feel slow; user confirmed 0.018 is good).

## What works

- Beta editor: graph-first layout, node palette (all nodes, scrollable), undo/redo, outliner
- Studio editor: project hub, 3D scene, inspector, assets, spaces, undo/redo (Ctrl+Z/Y), view-centred + double-click placement
- Studio viewport controls: left-drag = rotate, right-drag = pan, scroll/pinch = zoom, trackpad two-finger swipe = rotate
- WCC exhibition controls: WASD walk, mouse (click to lock) or trackpad two-finger swipe = look-around, F = fly, ESC = release lock
- Portal object: Studio entity referencing another project (embed or gateway); 14th type in `EntityContent`
- Auth: session-cookie login, role-based access (guest/viewer/editor/admin); GitHub/Google OAuth; session auto-refreshes from DB on `GET /api/auth/session` so admin patches propagate without re-login
- Admin UI: Ops Graph → Manage → People panel — set role (viewer/editor/admin), toggle space access per user
- Deploy: push `dev` → staging.di-studio.xyz, push `main` → di-studio.xyz (via `publish-cpanel-prebuilt-v2.yml`)
- Docker: `docker compose up --build -d` runs full stack locally on port 8080
- WCC exhibition: LiveProjectScene renderer, WASD + mouse/trackpad FPS controls, portal embeds, atmosphere blend, hub decor, animated entities, billboard text
- Space sync: `npm run space:new/pull/push` + SpaceSyncPanel UI

## What is broken / open

- **Zone positions not synced staging↔prod**: entity positions in WCC exhibition live in the DB. Edits in Studio on staging must be manually pushed via `node scratchpad/copy-staging-to-prod.mjs`.
- **VR fly unverified on hardware** — AR confirmed on Android; VR path (right-thumbstick-Y) only build-checked.
- WCC landing perf: always-on WebGL particle veil (700 pts) — gate on mobile/`prefers-reduced-motion` if needed.
- `origin/self-host` — intentionally kept: 1 unmerged commit (`b9baa30`) stripping contributor machinery for clean self-host build.

## Space sync setup (per machine)

Add to `serverXR/.env.local` (gitignored):
```
LIVE_API_URL=https://di-studio.xyz/serverXR
LIVE_API_TOKEN=<editor-or-admin-token>
```

## Known fixes

→ **[docs/ai/known-fixes.md](docs/ai/known-fixes.md)** — check before investigating any bug.

## Deploy

```bash
git push origin dev                                                   # staging
git checkout main && git merge dev --no-edit && git push origin main && git checkout dev   # prod
gh run list --workflow publish-cpanel-prebuilt-v2.yml                 # monitor
```

## Validation

```bash
npm run lint && npm run build && npm run test -- --run && npm run test:server-contracts && npm run docs:wiki:check
```
