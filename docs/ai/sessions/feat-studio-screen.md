# feat/studio-screen — the door between the 3D room and the deck (2026-11-10)

Owner (a VJ): the 3D space and the VJ chain have a "logical gap". A read-only trace found the engine
(plane + components.surface + `network` surface = deck) but no door. This branch is the door.

## What it does
1. **Screen** in Studio's Create panel (`LibraryPanel.jsx`, entry `SCREEN_ENTRY` in `project/entityPalette.js`).
   `StudioEditor.handleCreateEntity('screen')` -> `studio/utils/screenOps.js buildScreenOps`: a 16:9 plane
   (3.2 x 1.8, standing, bottom edge at the view point) named "Screen", bound to the first `network`
   surface; else a new surface (kind network, ref = first `vj.deck`, else first `top.out`); with neither, an
   unbound plane. Surface + plane go in ONE ops batch = one Ctrl+Z (useOpHistory batches).
2. Inspector (plane): "Shows" select, option "Name — source" (`screenSurfaceOptions`), buttons "Open in
   Projection" (`buildMapPath`) and "Open the deck" (`buildPerformPath` preset `vj`, from=studio).
   Inspector (file video): section "Live deck", "Show the live deck here instead" = `buildVideoToScreenOps`
   (new plane at the same transform + deleteEntity of the video, one batch; Undo restores the video).
   The buttons reach the Inspector through `ScreenActionsContext` (StudioShell.jsx is not touched).
3. "Edit in Nodes" passes the node id: `StructurePanel` calls `onEditInNodes(row.id)`; `StudioEditor`
   opens `/{space}/raw/projects/{id}?node=<id>` (the bar's Nodes button still opens the bare path).
   **RawEditor does not read `?node=` yet** (another agent holds that file; see the change below).
4. Words: map source kind "Project" -> "3D scene" (`map/MapInspector.jsx:9`). No test baseline names it.

## Not done / open
- Screens stay dark in Play and in the `project` stage source (needs a measured GPU cost first).
- Nothing was seen in a browser; only unit tests ran.
- RawEditor: read `?node=` (below).

## RawEditor change (for the agent holding it)
On load, read `new URLSearchParams(window.location.search).get('node')`; if a node with that id exists in the
document, select it and centre the canvas on it, then drop the param:
```js
const wantedNode = new URLSearchParams(window.location.search).get('node')
useEffect(() => {
    if (!wantedNode || !document?.nodes?.some((n) => n.id === wantedNode)) return
    selectNode(wantedNode); focusNode?.(wantedNode)   // use RawEditor's own select/center helpers
    const q = new URLSearchParams(window.location.search); q.delete('node')
    window.history.replaceState(null, '', `${window.location.pathname}${q.size ? `?${q}` : ''}`)
}, [wantedNode, document?.nodes])
```

## Tests
`src/studio/utils/screenOps.test.js`, `StudioInspector.test.jsx` (screen rows), `panels/LibraryPanel.test.jsx`,
`StructurePanel.test.jsx` (node id). Wiki: map article paragraph, `updated` 2026-11-10.
