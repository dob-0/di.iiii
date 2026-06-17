# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev

---

## Last commit

`ca23475` — fix npm audit: patch 8 of 11 vulnerabilities, pin postcss via override
(this session: closed remaining 3 — vite 6→8, @vitejs/plugin-react 4→6, vitest 4.0→4.1.9, pinned esbuild@0.28.1 explicitly; `npm audit` now reports 0 vulnerabilities)
Branch focus: `dev` → staging.di-studio.xyz, `main` → di-studio.xyz (production).

## What works

- Beta editor: graph-first layout, node palette (all nodes, scrollable), undo/redo, outliner
- Beta topbar: hidden until Node 0 is placed (Node 0 is the seed that awakens the UI)
- World node (`universe.world`): panel window with embedded 3D scene, fullscreen mode, overlay mode (3D behind graph)
- Studio editor: project hub, 3D scene, inspector, assets, spaces, undo/redo (Ctrl+Z/Y)
- Auth: session-cookie login, role-based access, 8 s timeout
- Deploy: push `dev` → staging.di-studio.xyz, push `main` → di-studio.xyz (via `publish-cpanel-prebuilt-v2.yml`)
- Docker: `docker compose up --build -d` runs full stack locally on port 8080 (Podman-compatible)
- Space sync: `npm run space:new/pull/push` CLI scripts + `SpaceSyncPanel` UI in BetaHub (↓ get latest / ↑ publish buttons)
- n000 space: pulled locally to `spaces/n000/scene.json` and `serverXR/data/spaces/n000/`

## What is broken / open

- Nothing currently known.

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
| CI `npm ci` ERESOLVE after bumping vite to 8 (local `npm install` looked fine) | `vite-plugin-restart`'s peerDependency caps at `vite@^7`; `npm ci` enforces strict peer resolution with no `--legacy-peer-deps` fallback like local installs can use | Inlined its ~20-line restart-on-`public/`-change logic directly as a plugin in `vite.config.js` and dropped the dependency — removes the peer conflict entirely instead of masking it | `vite.config.js` `package.json` |

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
