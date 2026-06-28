# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev

---

## Last commit

`a1634e9` — fix(wcc/live-scene): beacon-in-view arrival + dismiss hint on first touch
**PROMOTED: `origin/main` = `a1634e9` — the FULL converged WCC exhibition (LiveProjectScene + portal composition + animation/atmosphere/hubDecor/title/spawn/hints) is LIVE on production di-studio.xyz, verified. Prod `main` project doc copied from staging (20 entities, 10 zone portals, beacon-in-view spawn). `dev` == `main`. (Note: `main` was found at `e771d38` pre-promote — possibly another session advanced it; fast-forward was clean.)**

## Last session (2026-06-29)

- **Prod**: shipped the WCC beacon hub + bilingual title + center look-up + animated control hints to production (commits up to `38bfe46`), via the **bespoke `WccExhibition`** renderer. (Earlier in session: doc-sync gate, deploy refactor — already on prod.)
- **Architecture convergence (staging only):** retired the bespoke ring renderer; `/wcc/scene` now renders via the shared **`LiveProjectScene`**, driven by the `main` project which **composes each artist project as a `portal` embed** (`WccExperience.jsx`). Layout/objects/world are now authored data tunable in Studio. Master `main` doc = 9 beacon + 10 zone portals; regen via `scratchpad/gen-master.mjs` → push with `scratchpad/push-hub.mjs`.
- **"Everything in Studio" — all shared, all Studio-tunable, all on staging:** per-object **animation** (`components.animation {mode,speed,amplitude}`, entityRegistry "Animation" section, shared `src/project/viewport/entityAnimation.js`, legacy fallback = old look) · **color transitions** (`worldState.atmosphereBlend`) · **floor decor** (`worldState.hubDecor` = centre ring + spokes + zone rings) · **billboard text** (`components.text.billboard` + `text.lines` for per-line styled titles) · **data-driven spawn** (`worldState.spawn`) · zone-aware nearest-label · per-zone portal **labels** · **animated movement hints** (WASD keys / ghost joystick, ported into LiveProjectScene). AmbientField particles already existed.
- Master `main` doc (regen `scratchpad/gen-master.mjs` → `scratchpad/push-hub.mjs`): beacon + bilingual title (lines) + 10 zone portals at ring **R=58** (spread to fix overlaps), each portal colour = artist bg (atmosphere), spawn = centre look-up.
- **Rule added** (`docs/ai/golden_rules.md`): new space capability → shared layer (projectSchema + CJS mirror + LiveProjectScene + entityRegistry/World panel), never per-space.
- Each step validated: lint 0 errors, `test:schema-sync` ✓, build ✓, tests green.

Branch focus: `dev` → staging (full converged exhibition), `main` → di-studio.xyz at `38bfe46` (beacon hub, bespoke renderer — pending promote).

## What works

- Beta editor: graph-first layout, node palette (all nodes, scrollable), undo/redo, outliner
- Beta topbar: hidden until Node 0 is placed (Node 0 is the seed that awakens the UI)
- World node (`universe.world`): panel window with embedded 3D scene, fullscreen mode, overlay mode (3D behind graph)
- Studio editor: project hub, 3D scene, inspector, assets, spaces, undo/redo (Ctrl+Z/Y), view-centred + double-click placement
- Portal object: a Studio entity that references another project (embed inline or act as a gateway); `portal` is the 14th type in the shared `EntityContent` renderer
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

- **WCC convergence — DONE + live on prod.** Mobile title fit + hint/joystick overlap fixed; retired `WccExhibition.jsx`/`scene.css` deleted. Remaining = pure curation: **user hand-tunes zone positions/facing** in `/wcc/studio/projects/main` (R=58 even ring is a placeholder; edits there persist on staging — re-copy staging→prod via `scratchpad/copy-staging-to-prod.mjs` when ready, or just edit prod's `main` directly).
- **VR fly unverified on hardware** — AR walk/joystick/fly confirmed on a real Android phone (CDP); the VR path (right-thumbstick-Y altitude, smooth locomotion) is only build/lint/mount-checked. No headset here — deferred (user's call).
- WCC landing perf headroom: the always-on WebGL particle veil (700 pts) is the remaining throttled-fps cost — gate on mobile / `prefers-reduced-motion` if more is needed.
- `origin/self-host` — intentionally **kept**: 1 unmerged commit (`b9baa30`) that strips contributor/auto-PR machinery for a clean self-host build. Not stale; do not prune.
- `scripts/ollama/Modelfile.dob-fast` / `dob-deep` may be mid-iteration locally (base → `qwen3:8b`) — `git diff` before assuming the committed `qwen2.5-coder:7b` base is current.
- Minor: throwaway `embed-portal-test-world` may linger in the local `main`-space DB — delete from Studio Hub if it's noise.

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
npm run lint && npm run build && npm run test -- --run && npm run test:server-contracts && npm run docs:wiki:check
```
