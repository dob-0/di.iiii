# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev

---

## Last commit

`adcfd7f` — fix: hide account button in studio editor to unblock axis gizmo + docs: elite-debug.md + z-index golden rule
(recent commits: studio UI overlap fixes — bottom toolbar removed, panel defaults spread, cluster repositioned, account button hidden in editor to free gizmo area.)

## Last session (2026-06-20)

- Audited all v1 legacy group code: `useSelectionGroups`, `useSelectionGroupActions`, `OutlinerPanel` groups section, wiring through `useAppState`/`useAppEditorActions`/`useAppContextValues`/`EditorLayout`/`EditorLayoutContainer`.
- V1 "group" was localStorage-only selection-recall (named bookmark of object IDs), not a scene hierarchy — `window.prompt()`/`alert()` dialogs, no schema representation.
- Confirmed zero of this group logic exists in `src/studio/` — it was never ported.
- Identified the schema already supports hierarchy: `parentId` on nodes + `deleteNode` cascade (line 694 `projectSchema.js`).
- Decision pending: two concepts to bring into Studio — (1) structural `group` node via `parentId` + node registry entry; (2) named selection recall in workspaceState. Structural grouping is the higher-value path.
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
- WCC landing page EN/ՀՅ language toggle: switch lives in `WccExperience`, passed down as a controlled prop to both `LandingPage` and `WccExhibition` so the chosen language persists across the landing→3D-scene transition instead of resetting.

## What is broken / open

- The `/api/users` admin endpoints are covered by automated tests only — no real OAuth round-trip exercised (GitHub/Google aren't configured in this dev environment).
- `scripts/ollama/Modelfile.dob-fast` / `Modelfile.dob-deep` are mid-iteration locally (base swapped to `qwen3:8b`, not yet committed) — check `git diff` before assuming the committed `qwen2.5-coder:7b` base is current.
- PR #18's `src/wcc/` refactor (drop `WccExhibition.jsx`, render the exhibition via the shared `PublicProjectViewer`/Studio-project pipeline instead) was held out of the merge — it has no equivalent yet for the EN/ՀՅ caption toggle baked into `WccExhibition.jsx`. Needs a decision from whoever owns WCC before it lands.

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
