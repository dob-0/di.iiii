# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev

---

## Last commit

`a623e57` — fix(deploy): prune old deploy-backups automatically, keep newest 5
(plus uncommitted working-tree changes from this session — see below)

## Last session (2026-06-23)

- Restored the inline "Enter Space" walk/fly mode on the landing page (`src/landing/LandingPage.jsx`) — pressing it now fades the UI and lets you walk (WASD)/fly (F, then Space-Q up, C-E down) right there, instead of navigating away. This was the original behavior (`ee706c9`) until a later commit (`d9cdc0f`) replaced it with navigation; brought back per explicit request.
- Found + fixed a real bug: the landing/Studio-Hub 3D background (`GridFloorBackground.jsx`) was hardcoded to a fixed `test-file-project` regardless of what's actually linked/published to the `main` space — editing the project Studio Hub shows as linked to `main` had zero visible effect. Now it looks up `main`'s real `publishedProjectId` at runtime and falls back to the old constant only if that lookup fails.
- That fix surfaced a second, pre-existing bug: `useLiveProjectDocument` (in `LiveProjectScene.jsx`) had no guard against a stale project's document fetch resolving *after* a newer `projectId` had already taken over, silently overwriting the correct content with the wrong project's. Fixed by tracking the active `projectId` in a ref and dropping any late response that doesn't match it.
- Also fixed: legacy-imported projects (`source: "legacy-import-studio"`) store assets with an empty `url` field; the registry that normally fills it in (`registerAssetSources`) only ever runs inside Studio's own editor hook, never in the public/live viewer path. `LiveProjectScene`'s `assetMap` now falls back to `buildProjectAssetUrl(projectId, assetId)` so media actually streams outside Studio too (landing page, WCC, etc.).
- All three verified live via Playwright (real browser, real network trace, real screenshot) — see new golden rule below.
- Added a golden rule (`docs/ai/golden_rules.md`): code passing lint/build/tests is not "done" for UI/data-flow changes — drive it in a real browser and look at the result before reporting success. Playwright + Chromium are already installed in this repo, nothing to vendor.
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
