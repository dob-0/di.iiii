# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev

---

## Last commit

`223e7b1` — feat(walk/fly): strafe, wider look range, drone-style decoupled flight
(plus uncommitted working-tree changes from this session — see below)

## Last session (2026-06-23)

- Restored the inline "Enter Space" walk/fly mode on the landing page (`src/landing/LandingPage.jsx`) — pressing it fades the UI and lets you walk/fly right there instead of navigating away (was replaced by navigation in `d9cdc0f`; brought back per request).
- Fixed `GridFloorBackground.jsx` to follow whatever project is actually published to the `main` space instead of a hardcoded constant; fixed a resulting stale-fetch race (`useLiveProjectDocument`) and a missing asset-URL fallback for legacy-imported projects in `LiveProjectScene.jsx`. Hardened against 401/404 noise on envs where `main` isn't public (production).
- Walk/fly controls overhauled in `LiveProjectScene.jsx`: A/D strafe (only arrow keys/mouse/touch-drag turn); look-pitch range widened and set independently per mode (walk ~83°, fly ~89°); fly movement decoupled from look angle entirely — forward/strafe stay on the horizontal plane like a drone gimbal shot, altitude only changes via Space/Q/C/E (was jet-style pitch-coupled diving; replaced per request).
- Fixed mobile: the Fly toggle and joystick were gated behind `showChrome`, which the landing page always sets `false` — there was no way to ever reach fly mode on a touchscreen (no F key). They now render whenever `interactive`, independent of `showChrome`; landing page hint text is now mobile-aware too.
- Found a real scope gap: walk/fly only ever existed on the landing background + WCC. The actual public viewer every space's real URL uses (`PublicProjectViewer.jsx` → `StudioViewport`, orbit-only) had none. Added a "Walk / Fly" toggle there (scene entry-view only; fixed-camera/code modes untouched) so it's now available, by user choice, on every space — past and future — not just two special-cased surfaces.
- Added two golden rules (`docs/ai/golden_rules.md`): (1) UI/data-flow fixes aren't "done" until verified in a real browser, not just lint/build/tests; (2) when a feature lands on one surface, check whether it should apply to every surface serving the same purpose — including pre-existing content — before calling it done.
- Everything this session verified live via Playwright: real browser walkthroughs, numeric pitch/altitude checks via temporary debug hooks (not just screenshots), and a full toggle round-trip on a real public space (`/mytest`).
- **These changes are uncommitted on `dev`** as of this session — review and commit before continuing.
- Prior session's group/hierarchy decision (structural `group` node via `parentId`) is unchanged/unstarted.

Branch focus: `dev` → staging.di-studio.xyz, `main` → di-studio.xyz (production).

## What works

- Beta editor: graph-first layout, node palette (all nodes, scrollable), undo/redo, outliner
- Beta topbar: hidden until Node 0 is placed (Node 0 is the seed that awakens the UI)
- World node (`universe.world`): panel window with embedded 3D scene, fullscreen mode, overlay mode (3D behind graph)
- Studio editor: project hub, 3D scene, inspector, assets, spaces, undo/redo (Ctrl+Z/Y)
- Studio asset import: GLBs at least 10 MB offer opt-in browser optimization before upload (2048px WebP textures + conservative model cleanup; originals remain optional)
- Auth: session-cookie login, role-based access, 8 s timeout; GitHub/Google OAuth sign-in live and configured on both staging and production (separate OAuth apps per env, client secrets set as cPanel Node env vars, not in repo)
- Deploy: push `dev` → staging.di-studio.xyz, push `main` → di-studio.xyz (via `publish-cpanel-prebuilt-v2.yml`)
- Docker: `docker compose up --build -d` runs full stack locally on port 8080 (Podman-compatible)
- Space sync: `npm run space:new/pull/push` CLI scripts + `SpaceSyncPanel` UI in BetaHub (↓ get latest / ↑ publish buttons)
- n000 space: pulled locally to `spaces/n000/scene.json` and `serverXR/data/spaces/n000/`
- Public spaces: any space can be marked `isPublic: true` (`PATCH /api/spaces/:id`) to skip the login gate for just that space. WCC's page is the existing Present → Code view (paste HTML/CSS/JS, can pull in three.js/gsap from a CDN) — no new schema/panel. Added one thing to the existing sandboxed-preview postMessage bridge: calling `window.diiEnterExhibition()` from inside the pasted page swaps it for the live 3D scene in place, no reload. A generic "Landing" schema/panel was tried and deliberately reverted as overkill for one page. See `docs/WCC_MERGE_PLAN.md`.
- Real per-space read access control: `GET` reads of spaces/projects actually enforce `isAuthScopeAllowedForSpace` (mirrors the write-side check that already existed), with an `isPublic` bypass, and the full `GET /api/spaces` list is now filtered the same way (`isPublic` or in-scope, admins see all). `AuthGate` takes a `requiredSpaceId` prop and shows an "Access restricted" panel instead of silently rendering for an authenticated-but-out-of-scope session. `GUEST_SPACES = ['main']` guest auto-login still works exactly as before — it's just no longer accidentally readable everywhere.
- Studio nav fixes: the control-cluster header was showing the *project* title labeled as "space name" — now shows the actual space label + project title. Added a "View live" button (opens the public `/<spaceId>` URL in a new tab, only when the project is live). `handleCopyShareLink`'s activity message now includes the actual URL. Studio Hub shows "Space: {label}" above the Projects heading so landing on bare `/studio` (which silently defaults to `main`) is no longer silent.
- User-scoped sign-in: OAuth (`GitHub`/`Google`) sign-ins used to hardcode `spaces: null` (= unrestricted access to every space) on every login. `users.spaces` column defaults new accounts to `[]` (no access). Admin-only `GET /api/users` / `PATCH /api/users/:id { spaces: [...] }` lets dob-0 grant a signed-in account access to a specific space — same outcome as the `AUTH_IDENTITIES` env-var route, usable for a real account instead of a shared token. See `docs/WCC_MERGE_PLAN.md`. Self-serve "create your own space" onboarding and automated space↔git-repo mirroring were both explicitly deferred — not needed yet.
- WCC landing page EN/ՀՅ language toggle: switch lives in `WccExperience`, passed down as a controlled prop to `LandingPage` (the 2D landing only — the 3D exhibition has no captions to toggle, see below).
- WCC exhibition (`WccExhibition.jsx`) is now a thin wrapper over the shared `LiveProjectScene` (generalized renderer: entities, animations, gate glow, WASD walker, SSE live sync), rendering the real authored project `wcc-landing` in the `wcc` space. This independently achieves what PR #18's held-out `src/wcc/` refactor wanted (drop the hand-coded Canvas scene for a shared pipeline) — that PR's diff is now superseded/stale, no action needed.

## What is broken / open

- The `/api/users` admin endpoints are covered by automated tests only — no real OAuth round-trip has been confirmed end-to-end in this dev environment, even though GitHub/Google credentials ARE configured locally (`serverXR/.env.local`) and `/api/auth/providers` returns both `true`. A login was attempted 2026-06-22 but the verification method used couldn't confirm the resulting session — still open.
- `scripts/ollama/Modelfile.dob-fast` / `Modelfile.dob-deep` are mid-iteration locally (base swapped to `qwen3:8b`, not yet committed) — check `git diff` before assuming the committed `qwen2.5-coder:7b` base is current.

## Space sync setup (per machine)

Add to `serverXR/.env.local` (gitignored):
```
LIVE_API_URL=https://di-studio.xyz/serverXR
LIVE_API_TOKEN=<editor-or-admin-token>
```
Then `npm run space:pull -- n000` or use the BetaHub buttons.

## Known fixes

→ **[docs/ai/known-fixes.md](docs/ai/known-fixes.md)** — check it before investigating any bug.
When you solve something that took >5 min, add a row there and update Last commit above.

## Deploy

```bash
git push origin dev                                                   # staging
git checkout main && git merge dev --no-edit && git push origin main && git checkout dev   # prod
gh run list --workflow publish-cpanel-prebuilt-v2.yml                 # monitor
```

## Validation

```bash
npm run lint && npm run build && npm run test -- --run && npm run test:server-contracts
```
