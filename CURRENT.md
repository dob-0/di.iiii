# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev

---

## Last commit

`99562a6` — refactor(deploy): promote production from origin/dev, not origin/staging
**`dev` pushed to `origin/dev` → staging (verified live, all green). `origin/main` at `a26d805` (production di-studio.xyz); `dev` is 2 tooling commits ahead. Local `main` = `a26d805` (in sync).**

## Last session (2026-06-28)

- **Doc-sync system** (`ef67c79`, `docs/ops/doc-sync-system.md`): consistency gate so user-facing doc surfaces can't drift, modeled on `docs:ai:check`. New `npm run docs:wiki:check` (pure `scripts/wiki-sync-lib.mjs` + `scripts/check-wiki-sync.mjs`, 8 tests) wired into CI + the Validation block.
- Fixed a latent bug: `WIKI_HIGHLIGHTS` used `.filter(Boolean)`, so a typo'd landing-highlight id silently vanished — now `WIKI_HIGHLIGHT_IDS` is checked and a bad id fails CI.
- Tier-2 Claude hooks in `.claude/settings.json`: run `docs:wiki:check` on `wikiContent.js` edits; remind to update the wiki when a user-facing surface (`src/{studio,beta,landing,project,wcc}`, serverXR routes) changes. (Tier 3 cloud agent documented, deliberately not built.)
- **Deploy refactor** (`99562a6`): production promotion now sources `origin/dev` (not vestigial `origin/staging`); staging handler drops the redundant double-push. Tested via `deploy production --dry-run`.
- Staging verified live: `/wiki` 200, spaces list filtered to public-only when logged out, `wcc` (public) 200, `n000` (restricted) 401, OAuth providers both `true`. Access/guest + OAuth round-trip confirmed passing by human earlier.
- Validation: lint 0 errors, build ✓, `docs:wiki:check` ✓, deploy-lib 4/4, CI green on both pushes.

Branch focus: `dev` → staging.di-studio.xyz, `main` → di-studio.xyz (production) at `a26d805`.

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

- **WCC hub project (`main`)** — created in the `wcc` space and wired into `WccExhibition.jsx` (`MAIN_PROJECT_ID`/`MAIN_DOC_IDS`/`ZoneGroup` at hub center). Currently one placeholder cyan wireframe sphere. Needs real hub content/design. Edit via `/wcc/studio/projects/main`.
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
