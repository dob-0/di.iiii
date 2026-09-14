## 2026-09-14 — Raw: one inside for every node (the workshop frame)

- Entering any node shows `InsideView` (`src/raw/components/inside/`) around the node's own scoped canvas: HEAD (back, name, kind, runs on — the only "where am I"; the scope marker is gone), SEE (by what it makes, `insidePreviewKind`), IN (inspector fields + live values + "from X" + a socket per input), OUT (live values + where each goes), MADE OF (computes/draws/window/door/shader/script).
- Custom Cube: a card standing inside a node can be wired into that node's own input (drop on the IN socket, or press it and pick). Document and runtime always allowed such edges; now the UI does. OUT feeds inner inputs the same way.
- `virtual:node-source` (same plugin as `virtual:node-anatomy`) serves the real slices lazily; whole component files are separate `?raw` chunks. Picture operators now have `computes` (topRuntime.js); window branches name their component file.
- Deleted: `topInside/*` (camera/shader/script moved to `inside/topSections.jsx`), `NodeAnatomyPanel.jsx`, `nodeSourceSlices.js`, the inspector's "Code — stored, not run" section (old `values.__code` data left in place, unread).
- `useNodeGraphScope.goToNode` rebuilds the scope path from a node's parentId chain.
- Not done: no Playwright walk (lead walks it after merge); the non-picture Script tab is a slot (`scriptProps`) waiting for workstream 7's runner; SEE's 3D view is the card renderer's 184x104 frame upscaled; dead `.raw-anatomy*`/`.raw-scope-marker*` CSS in raw.css and `getAnatomyDefaultFrame` in windowLayout.js left for their owners.
