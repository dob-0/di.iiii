# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev

---

## Last commit

`c6f64ee` — refactor(admin-ui): rebuild access/guest management on canonical /admin surface
**`dev` pushed to `origin/dev` → staging. `origin/main` at `e2a3172` (production di-studio.xyz). Local `main` still stale at `3d9bf89` — `git fetch` / fast-forward to clear.**

## Last session (2026-06-25)

- Login/space/access cleanup, backend-first (`2b7a217`): decoupled publish from visibility (linking a project no longer auto-flips `isPublic`); consolidated all space scope checks behind one `canAccessSpace()` in `authAccess.js` (HTTP + sockets); explicit `users.is_unrestricted` access model (guarded migration backfills legacy `spaces:"null"` rows, no cookie bump / no forced re-login); space `kind` (`normal|global|sandbox`) + settable `config.globalSpaceId` + guest provisioning (shared global space OR per-guest `sandbox-…`); reaper never deletes a `global` space.
- Two DB migrations (`v2_user_is_unrestricted`, `v3_space_kind_global`) dry-run-verified safe + idempotent on copies of `serverXR/data/di.db`; they auto-apply on server boot.
- First admin UI attempt was bespoke `ssh-*` and looked wrong; **reverted** it and rebuilt as `AdminAccessSection` on the canonical `/admin` Ops Graph page (`c6f64ee`), composed only from `preferences-*` components — zero new CSS. SpaceHub returned to its original design.
- New rule in memory: **admin/management UIs reuse the `preferences-*` design system** (`PreferencesShared.jsx`); never invent parallel styling.
- Validation green throughout: lint 0 errors, build ✓, 340 tests, server-contracts 21; live-verified guest modes + admin UI (desktop + mobile) against throwaway data copies.

Branch focus: `dev` → staging.di-studio.xyz, `main` → di-studio.xyz (production) at `e2a3172`.

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

- **Access/guest work needs human testing on staging** — admin UI lives at `/admin` → **Access** tab (admin-only; sign in as dob-0 to see People & Access). Guest global/sandbox modes set via that tab's `Set global` buttons. Not yet clicked-through by a human on staging.
- Local `main` is stale at `3d9bf89` (origin is `e2a3172`) — `git fetch` / fast-forward to clear. Throwaway `embed-portal-test-world` left in the local `main`-space DB — delete from Studio Hub if it's noise.
- **Audit follow-ups deferred this session** (none done, user's call): fix stale `scripts/e2e-smoke.mjs` (16 false-negative failures); add `test:server-contracts` + `test:schema-sync` to CI (schema-drift prod-503 guard); prune 5 parked branches (`chore/fork-sync-contract`, `feat/asset-optimization-and-agent-efficiency`, `feat/studio-workflows`, `feature/landing-pages`, `self-host`).
- WCC landing perf headroom: the always-on WebGL particle veil (700 pts) is the remaining throttled-fps cost — gate on mobile / `prefers-reduced-motion` if more is needed. No white-background button context exists in the WCC flow (it's red→black only), so the "visible on white" ask was covered by the solid red fill.
- **VR fly is unverified on hardware** — AR walk/joystick/fly were confirmed on a real Android phone (CDP), but the VR path (right-thumbstick-Y altitude, smooth locomotion) has only been built/lint/mount-checked; no headset here. Test on a real device and flag anything off.
- The `/api/users` admin endpoints are covered by automated tests only — no real OAuth round-trip has been confirmed end-to-end in this dev environment, even though GitHub/Google credentials ARE configured locally (`serverXR/.env.local`) and `/api/auth/providers` returns both `true`. A login was attempted 2026-06-22 but the verification method used couldn't confirm the resulting session — still open.
- `scripts/ollama/Modelfile.dob-fast` / `Modelfile.dob-deep` are mid-iteration locally (base swapped to `qwen3:8b`, not yet committed) — check `git diff` before assuming the committed `qwen2.5-coder:7b` base is current.
- **WCC hub project (`main`)** — created in the `wcc` space and wired into `WccExhibition.jsx` (`MAIN_PROJECT_ID`/`MAIN_DOC_IDS`/`ZoneGroup` at hub center). Currently has one placeholder cyan wireframe sphere. Needs real hub content/design. Edit via `/wcc/studio/projects/main`.

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
