## 2026-10-01 — front-end bug batch from the read-only audit

Source: the front-end audit of origin/dev e5d95ac9 (findings were hypotheses; each was re-read on this tree
first). Branch `fix/frontend-bugs-batch-2026-10-01`, not pushed. **Nothing here was seen in a browser**:
only targeted `npx vitest run` on the touched modules and their neighbours (101 files, 1454 tests green)
and eslint on the changed files (0 errors; the remaining warnings are pre-existing, plus the
`react-hooks/refs` report on the lazily-built DMX senders). Installed node_modules are older than 09-24.

| # | Item | Result |
|---|---|---|
| 1 | `useSceneInitializer` catch called `localStorage.removeItem` unguarded | DONE. Local `readSavedScene` / `safeRemoveItem` (no shared helper exists in the repo; fewer than 3 sites). Tests: "survives blocked localStorage" (every call throws; `window.localStorage` getter throws), fail before / pass after. |
| 2 | `RawEditor` `migrateLegacyRawStorage()` at import | DONE. Body in try/catch. Tests in `RawEditor.blockedStorage.test.jsx` (getter throws; getItem throws), fail before. |
| 3 | Stale responses in `StudioHub` / `StudioProjectsPanel` | DONE. Cancelled flag on the space effects; request-number ref on `loadProjects` (latest wins, also covers the handler reloads). Tests with two deferred promises, old answer lands last; fail before. |
| 4 | `spaceStore.writeSpaces` unguarded `setItem` | DONE (confirmed). try/catch, returns boolean; callers keep their in-memory record. Test `spaceStore.blockedStorage.test.js`. Honest limit: nothing tells the person the list was not saved. |
| 5 | `RawGraphSurface` wires memo missing `portScopeNodes` | DONE (confirmed real). `portScopeNodes` is every node, `nodes` only the current scope, so a doorway added/removed inside a container leaves wires to that container's sockets at the old row. Test removes a door with `nodes`/`edges` unchanged; fails before. |
| 6 | `usePieceAssets.ensureAsset` double upload | DONE (confirmed). In-flight Map by kind, cleared on settle; also checks `response.ok` before uploading. `usePieceAssets.test.jsx`, fails before. |
| 7a | `MapSurface` reference-photo blob URL | DONE. New `src/map/useLocalFileUrl.js` revokes the previous URL on replace and on unmount. Test with a `URL.revokeObjectURL` spy. |
| 7b | `LiveScreens` blob URL on `onerror` | REFUTED. `image.onerror = () => URL.revokeObjectURL(url)` is already there (line 116). |
| 7c | `SpaceConstellation` line geometries | FIXED, UNTESTED. Effect cleanup disposes them. Needs a look: no cheap unit test; verify in a GPU session. |
| 7d | `FixtureBodies` lens material | FIXED, UNTESTED. Cleanup disposes only the lens materials made in the memo (GLTF-owned materials are left alone). Needs a look, same reason. |
| 8 | `DmxOutPanelWindow` render-time `.cancel()` | DONE (confirmed). Cancel moved into an effect cleanup keyed on `lane`. The new test checks cancel on lane change and unmount; it also passes before the fix (a discarded concurrent render cannot be reproduced cheaply), so the benefit is by reasoning, not by a failing test. |

Not touched (other agents): StudioViewport, StudioEditor, studioGuide, AuthGate, PublicProjectViewer,
StudioShell, Landing. Audit items 9+ (AgentRunPanel, reel players, WebglContextGuard, JSON clone, JSON.parse of
imports) were outside this batch and remain owed.
