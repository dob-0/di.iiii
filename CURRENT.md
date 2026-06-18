# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev (working directly on dev — SpaceHub, space creation, git-to-space deploy added)

---

## Last commit

`1b90867` — chore: add serena MCP server and custom subagents/commands
(this session: finished Present/Files panel split refactor (`f21255d`); set GitHub/Google OAuth client ID+secret env vars on both staging and production cPanel hosts — `GET /api/auth/providers` now returns `{github:true, google:true}` on both. No code change needed, was a pure ops/env gap. Separate GitHub OAuth apps exist per environment: `staging di`, `di-studio` (prod), `di-studio-local` (local dev).)
Branch focus: `dev` → staging.di-studio.xyz, `main` → di-studio.xyz (production).

## What works

- Beta editor: graph-first layout, node palette (all nodes, scrollable), undo/redo, outliner
- Beta topbar: hidden until Node 0 is placed (Node 0 is the seed that awakens the UI)
- World node (`universe.world`): panel window with embedded 3D scene, fullscreen mode, overlay mode (3D behind graph)
- Studio editor: project hub, 3D scene, inspector, assets, spaces, undo/redo (Ctrl+Z/Y)
- Auth: session-cookie login, role-based access, 8 s timeout; GitHub/Google OAuth sign-in live and configured on both staging and production (separate OAuth apps per env, client secrets set as cPanel Node env vars, not in repo)
- Deploy: push `dev` → staging.di-studio.xyz, push `main` → di-studio.xyz (via `publish-cpanel-prebuilt-v2.yml`)
- Docker: `docker compose up --build -d` runs full stack locally on port 8080 (Podman-compatible)
- Space sync: `npm run space:new/pull/push` CLI scripts + `SpaceSyncPanel` UI in BetaHub (↓ get latest / ↑ publish buttons)
- n000 space: pulled locally to `spaces/n000/scene.json` and `serverXR/data/spaces/n000/`
- Public spaces (new, on `feature/landing-pages`, uncommitted): any space can be marked `isPublic: true` (`PATCH /api/spaces/:id`) to skip the login gate for just that space. WCC's page is the existing Present → Code view (paste HTML/CSS/JS, can pull in three.js/gsap from a CDN) — no new schema/panel. Added one thing to the existing sandboxed-preview postMessage bridge: calling `window.diiEnterExhibition()` from inside the pasted page swaps it for the live 3D scene in place, no reload. A generic "Landing" schema/panel was tried and deliberately reverted as overkill for one page. See `docs/WCC_MERGE_PLAN.md`.
- Real per-space read access control (new, on `feature/landing-pages`, uncommitted): `GET` reads of spaces/projects now actually enforce `isAuthScopeAllowedForSpace` (mirrors the write-side check that already existed), with an `isPublic` bypass. `AuthGate` now takes a `requiredSpaceId` prop and shows an "Access restricted" panel instead of silently rendering for an authenticated-but-out-of-scope session. `GUEST_SPACES = ['main']` guest auto-login still works exactly as before — it's just no longer accidentally readable everywhere.
- Studio nav fixes (same branch): the control-cluster header was showing the *project* title labeled as "space name" — now shows the actual space label + project title. Added a "View live" button (opens the public `/<spaceId>` URL in a new tab, only when the project is live). `handleCopyShareLink`'s activity message now includes the actual URL. Studio Hub shows "Space: {label}" above the Projects heading so landing on bare `/studio` (which silently defaults to `main`) is no longer silent. All four manually verified live in a real browser (Playwright).
- User-scoped sign-in (new, on `feature/landing-pages`, uncommitted): OAuth (`GitHub`/`Google`) sign-ins used to hardcode `spaces: null` (= unrestricted access to every space) on every login. New `users.spaces` column defaults new accounts to `[]` (no access). New admin-only `GET /api/users` / `PATCH /api/users/:id { spaces: [...] }` lets dob-0 grant a signed-in account access to a specific space — same outcome as the `AUTH_IDENTITIES` env-var route, usable for a real account instead of a shared token. See `docs/WCC_MERGE_PLAN.md`. Self-serve "create your own space" onboarding and automated space↔git-repo mirroring were both explicitly deferred — not needed yet.

## What is broken / open

- `feature/landing-pages` branch is uncommitted local work — lint/build/full test suite/server-contracts all pass; the read-scope fix and Studio nav fixes were manually verified live (curl + Playwright browser). The new `/api/users` admin endpoints are covered by automated tests only (no real OAuth round-trip exercised — GitHub/Google aren't configured in this dev environment). Commit and do a manual Docker check before merging to `dev`.
- Known follow-up (not blocking): `GET /api/spaces` (the full space list) still has no scope check — it only returns metadata (ids/labels/flags), not content, but it does reveal which spaces exist to anyone authenticated for any space.

## Space sync setup (per machine)

Add to `serverXR/.env.local` (gitignored):
```
LIVE_API_URL=https://di-studio.xyz/serverXR
LIVE_API_TOKEN=<editor-or-admin-token>
```
Then: `npm run space:pull -- n000` or use the buttons in the BetaHub UI.

## Known fixes — check here before investigating

| Symptom | Root cause | Fix | File |
|---------|-----------|-----|------|
| White screen / TDZ crash in prod | `manualChunks` missing drei peer deps → circular chunk init order | All drei peer deps in `three-vendor`: `detect-gpu`, `maath`, `camera-controls`, `@monogrid/gainmap-js`, `@react-spring/three` | `vite.config.js` |
| Infinite loading / auth never resolves | No timeout on session fetch | `AbortController` 8 000 ms timeout | `src/hooks/useAuthSession.js` |
| 100+ cascade errors when backend is 503 | `requireAuth` stays false → `AuthGate` skips error screen | Error check moved before `!requireAuth` | `src/components/AuthGate.jsx` |
| Browser can escalate role when both cookie + bearer token are sent | Auth resolution prioritized token over session | Auth now prefers valid session cookie, then falls back to token | `serverXR/src/index.js` |
| Browser back/forward can be inconsistent after route changes | Mixed manual history mutations and router navigation caused divergent history ownership | Route through `appNavigate`; use router `navigate` when mounted and full page navigation fallback when not mounted | `src/utils/appNavigate.js` `src/hooks/useAppRoute.js` |
| Graph nodes stop at left edge while dragging | Drag clamped `x >= 0` | Allow overflow left, clamp top/right only | `BetaGraphSurface.jsx` `DesktopWindow.jsx` `windowLayout.js` |
| Staging serves old build after push | Actions workflow still running | Wait 2–3 min: `gh run list --workflow publish-cpanel-prebuilt-v2.yml` | `.github/workflows/` |
| `assetId is required` on upload | Dead `|| crypto.randomUUID()` fallback removed | SHA-256 must be computed before calling `buildProjectAssetMeta` | `serverXR/src/projectStore.js` |
| 503 after deploy (server crashes on start) | `shared/projectSchema.cjs` out of sync with `src/shared/projectSchema.js` | Always update both files together; CJS is what serverXR actually loads | `shared/projectSchema.cjs` |
| V1 `/main` objects not draggable | `interaction-mode` button excluded from desktop controls; UI hidden by default gives no affordance to switch to Edit mode | Removed `'interaction-mode'` from exclusion filter in `EditorLayoutContainer`; added it to `hiddenUiButtons` + `EditorOverlays` filter so "Mode: Edit/Navigate" button shows even when UI is hidden | `src/components/EditorLayoutContainer.jsx`, `src/hooks/useControlButtons.js`, `src/components/EditorOverlays.jsx` |
| 503 after deploy — SQLite OOM or build failure | CloudLinux LVE blocks WASM (`node-sqlite3-wasm` OOM), no C++ toolchain for `better-sqlite3` prebuilt | Use Node.js built-in `node:sqlite` (`DatabaseSync`) — zero deps, no WASM, works on Node 22.5+ and 24+ | `serverXR/src/db.js` |
| Beta canvas requires two double-clicks | `preventDefault` on `pointerdown` suppresses `dblclick` (Pointer Events spec); pan start fires on first click of a double-click | Added `event.detail >= 2` guard in `handleSurfacePointerDown`; `user-select: none` on surface CSS replaces the prevented default | `BetaGraphSurface.jsx` `beta.css` |
| Cursor shows wrong type across Beta editor | Multiple issues: I-beam on topbar spans, `grabbing` flash on single click, `crosshair` persists during node/window drag, input ports wrong cursor, window header buttons blocked by `preventDefault` | Added `isPanMoving` state (cursor only `grabbing` on actual drag movement); `cursor: default; user-select: none` on topbar; `draggingNodeId` in surface cursor; port `--in`/`--out` classes; `dragMode` state in DesktopWindow with button-target guard in `startDrag` | `BetaGraphSurface.jsx` `DesktopWindow.jsx` `beta.css` |
| Node 0 UI messy — duplicate "Node 0" shown in topbar AND scope bar below it | Scope bar (`← Exit \| Node 0`) was rendered inside the shell AND breadcrumb in topbar both showed Node 0, causing visual redundancy | Removed scope bar entirely; topbar breadcrumb (`◈ › Node 0`) is the single navigation source; `graphTopInset` simplified to `workspaceTop`; canvas hint updates to "Double-click to place your first node." when inside Node 0 | `BetaEditor.jsx` `BetaGraphSurface.jsx` `beta.css` |
| Vite 8 build fails: `Cannot find package 'esbuild'` in custom JSX-transform plugin | Vite 8 dropped its bundled esbuild (switched to rolldown/oxc by default); `transformWithEsbuild` now needs esbuild as an explicit dependency | Added `esbuild@0.28.1` (patched, outside vulnerable `0.17.0-0.28.0` range) as a direct devDependency | `package.json` `vite.config.js` |
| staging.di-studio.xyz/serverXR/api/health returns 503, no `lsnode` worker for `serverXR-staging` ever spawns | Staging's `.htaccess` had a stray manually-added `RewriteEngine On` / `RewriteRule ... 127.0.0.1:4001` block stacked below the CloudLinux Passenger markers (production's `.htaccess` has only the Passenger block); mod_rewrite intercepts the request before Passenger spawns the app, and nothing listens on raw TCP 4001 (CloudLinux Passenger-for-Node uses its own internal socket) | Removed the extra rewrite block so staging's `.htaccess` matches production's structure, then `touch serverXR-staging/tmp/restart.txt` | `~/staging.di-studio.xyz/serverXR/.htaccess` on the cPanel host (not in this repo) — deploy script only rewrites between the Passenger BEGIN/END markers, so any manual addition below them survives every redeploy |
| CI `npm ci` ERESOLVE after bumping vite to 8 (local `npm install` looked fine) | `vite-plugin-restart`'s peerDependency caps at `vite@^7`; `npm ci` enforces strict peer resolution with no `--legacy-peer-deps` fallback like local installs can use | Inlined its ~20-line restart-on-`public/`-change logic directly as a plugin in `vite.config.js` and dropped the dependency — removes the peer conflict entirely instead of masking it | `vite.config.js` `package.json` |
| 3D viewport collapses to a tiny sliver (canvas defaults to 300×150) on any route that renders `<StudioViewport>` outside the main Studio app shell — reproduced on the V1 public viewer (`/main`) | `studio.css` (which defines `.studio-viewport-shell { height: 100% }`) was only ever imported by `StudioApp.jsx`; consumers like `PublicProjectViewer.jsx` rendered the component without that stylesheet ever loading, so the wrapper had no height and the canvas fell back to its intrinsic default size | Moved the `studio.css` import into `StudioViewport.jsx` itself so the component is self-contained for any consumer | `StudioViewport.jsx` |
| Dragging (graph canvas, nodes, window headers/resizers, 3D viewport) selects page text; mobile pinch-zoom/native gestures fight with app-level drag/pan | No global `user-select` baseline; several drag surfaces (`.beta-window-header`, `.beta-window-resizer`, `.beta-graph-surface`, `.beta-graph-node-card`, `.studio-viewport-shell`) were missing `touch-action: none` | Added global `user-select: none` on `html/body/#root` with explicit `user-select: text` opt-in for `input`/`textarea`/`contenteditable`; added `touch-action: none` to the drag surfaces listed above | `base.css` `beta.css` `studio.css` |
| CI `npm test` randomly fails `BetaHub.test.jsx` with `ReferenceError: window is not defined` from inside react-dom — passes 100% of the time locally | `SpaceSyncPanel`'s `checkStatus()` fires a `fetch` on mount with no `AbortController`; if the component unmounts (test teardown) before it resolves, the `.catch` callback calls `setStatus` after jsdom's `window` is already torn down. Pure timing race — surfaces under CI's different scheduling, not local idle-machine timing | Gave `checkStatus` its own `AbortController` (same pattern already used by `run()`), aborted on unmount, ignore `AbortError` in the catch | `src/components/SpaceSyncPanel.jsx` |
| Adding a new SQLite column for an existing deployed DB | `CREATE TABLE IF NOT EXISTS` only covers fresh databases — SQLite has no `ADD COLUMN IF NOT EXISTS` | Added `ensureColumn(db, table, column, definition)` helper that checks `PRAGMA table_info` before `ALTER TABLE`, called after `db.exec(SCHEMA)` in `initDb` | `serverXR/src/db.js` |
| Public/unauthenticated space access was a single hardcoded `spaceId === 'wcc'` string check in `RootApp.jsx` | One-off special case instead of a real per-space flag — doesn't generalize (at the time, reads weren't auth-checked server-side at all, see next row) | Added real `isPublic` column on space metadata (`serverXR/src/spaceStore.js`, `db.js`), `useSpacePublicFlag` hook fails closed while loading, `RootApp.jsx` wraps with `AuthGate` unless the space is confirmed public | `serverXR/src/spaceStore.js` `src/hooks/useSpacePublicFlag.js` `src/RootApp.jsx` |
| The login wall never actually appeared for ANY space, public or not, once `REQUIRE_AUTH=true` was set | `GET /api/auth/session` auto-issues a "guest" session (role: editor, spaces: `GUEST_SPACES=['main']`) on every page load before a login form can render; `AuthGate` only checked `authenticated`, never which spaces the session was scoped to; and `GET` routes (`/api/spaces/:id`, `/scene`, `/api/projects/:id`, `/document`) had zero scope checks server-side at all — only writes were scoped (`requireWriteRole`). Net effect: anyone could browse (read-only) any space's full Studio editor regardless of `isPublic` | Added `requireReadRole` middleware mirroring `requireWriteRole` (same `isAuthScopeAllowedForSpace` check, GET/HEAD only, with an `isPublic` bypass via `loadSpaceMeta`); `AuthGate` gained a `requiredSpaceId` prop and shows an "Access restricted" panel instead of silently rendering when an authenticated session is out of scope | `serverXR/src/index.js` (`requireReadRole`) `src/components/AuthGate.jsx` `src/RootApp.jsx` |
| Every GitHub/Google sign-in got unrestricted editor access to every space, with no scoping step at all | `issueSessionAndRedirect` (`serverXR/src/routes/authRoutes.js`) hardcoded `spaces: null` on every OAuth session — `null` means "no restriction" per `isAuthScopeAllowedForSpace`. The `users` table had no `spaces` column to even restrict it | Added `users.spaces` column (default `'[]'` for new accounts via `ensureColumn`, real pre-existing SQL-NULL rows also parse to `[]` deny-all); `upsertUser` defaults new users to no access and never overwrites existing scope on repeat login; new admin-only `GET /api/users` / `PATCH /api/users/:id {spaces: [...] \| null}` lets an admin grant a specific account access to specific spaces, or `null` for unrestricted (own admin accounts); `issueSessionAndRedirect` now reads `user.spaces` instead of hardcoding `null`. **Action taken live:** the two real pre-existing accounts in the dev DB (dob-0/GitHub, Gevorg Grigoryan/Google) were granted `spaces: null` (unrestricted) via the new endpoint so normal OAuth sign-in keeps working as before — do the same on staging/prod DBs after deploying this | `serverXR/src/db.js` `serverXR/src/userStore.js` `serverXR/src/routes/authRoutes.js` `serverXR/src/routes/userRoutes.js` |
| Test for a sandboxed-iframe `postMessage` listener silently never fired the handler, even though the real code path worked | `waitFor` only waits for the DOM mutation (iframe appears) to be observable — it resolves *before* React's passive `useEffect`s (which attach the `message` listener) actually run, since those are scheduled after paint. Dispatching the event immediately after `waitFor` raced ahead of the listener being attached | Added an empty `await act(async () => {})` after the `waitFor` to flush pending effects before dispatching the test event; also had to stub `iframe.contentWindow` and `event.source` via `Object.defineProperty` (jsdom's real cross-document `contentWindow` identity isn't reliably comparable) — same pattern as `PresentationCanvas.test.jsx` | `src/project/components/PublicProjectViewer.test.jsx` |
| Sign-in popover on staging/production showed "No sign-in providers configured" — nobody could log in via OAuth | `GET /api/auth/providers` (`serverXR/src/routes/authRoutes.js`) just echoes `Boolean(process.env.GITHUB_CLIENT_ID)` / `GOOGLE_CLIENT_ID` (`serverXR/src/config.js`); the cPanel deploy workflow only pushes code, never sets host env vars — OAuth secrets had simply never been configured on either host | Not a code fix — registered/rotated OAuth app credentials per environment (GitHub: `staging di`, `di-studio`; Google: separate client per env) and set `GITHUB_CLIENT_ID/SECRET`, `GOOGLE_CLIENT_ID/SECRET`, `OAUTH_CALLBACK_BASE_URL`, `OAUTH_FRONTEND_URL` directly in each cPanel Node app's environment, then restarted | cPanel host env vars only — not in this repo. Code referenced: `serverXR/src/config.js`, `serverXR/src/routes/authRoutes.js` |

## Deploy

```bash
# staging  — push dev
git push origin dev

# production — merge dev → main
git checkout main && git merge dev --no-edit && git push origin main && git checkout dev

# monitor
gh run list --workflow publish-cpanel-prebuilt-v2.yml
```

## Validation

```bash
npm run lint && npm run build && npm run test -- --run && npm run test:server-contracts
```

**Rule:** When you solve something that took >5 min to find, add a row to Known fixes and update Last commit.
