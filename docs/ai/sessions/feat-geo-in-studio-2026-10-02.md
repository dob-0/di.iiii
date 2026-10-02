## 2026-10-02 — Studio stands inside a Geo

The owner's decision of 2026-10-02 ("edit inside the Geo", chosen from a sketch): a Geo made in
Nodes can be opened in Studio, and Studio then works inside it — Create puts things into it,
Objects lists what stands in it, the gizmo and the inspector edit them, and Nodes sees the same
nodes live. This overrides one rule of `di-atlas/decisions/2026-09-23-layers-what-inside-what.md`
(unit 5, "node-made things are read-only in Studio") for the inside of a Geo. Everything else in
units 5–8 holds: no new field, no new op, no migration, no restyle, addresses unchanged.

**What changed**
- `src/project/graph/geoScope.js` (pure, tested): the project's Geos, what stands in a Geo, the
  add-into-Geo op (ONE `createNode` with `parentId` = the Geo — the op Nodes' palette writes), "+ Geo",
  the gizmo's `updateNode` values patch, Studio-shaped inspector sections for a node.
- One renderer: `RawViewport.jsx` exports `NodeVisual`, `buildSpatialChildMap` (extracted from
  `SceneContent`, which now uses it), `resolveSpatialValues`, `pickAuthoredCameraNode`.
  `src/raw/components/GraphRoomNodes.jsx` draws a scope's nodes inside any Canvas with them;
  `src/studio/components/StudioGraphNodes.jsx` adds Studio's outline, pill and TransformControls.
- `StudioViewport` takes `graphRoom` (null for every caller but the editor, so the published
  viewer and the rig plot are untouched). Whole room: Nodes' things drawn read-only. Inside a Geo:
  the Geo's inside (as Nodes after "›"), Studio's own objects not drawn, nodes editable.
- Address: `?geo=<nodeId>` on the project's Studio address (`src/studio/utils/geoScopeAddress.js`).
  The router reads the path only, so every existing address is unchanged (tested).
- `StudioEditor`: Geo state from the address, switcher in the Create window (`GeoSwitcher`, existing
  `.scc-section`/`.insp-select`/`.scc-btn--xs`), panels fed node rows; group/duplicate/clipboard/
  visibility/lock off inside a Geo; Delete = `deleteNode`. Off on the open jam.
- Nodes: a Geo card's header has ↗ "Open … in Studio"; inside a Geo the ⋯ menu has the same.
- `GIZMO_SNAP`/`useSnapModifier` moved to `src/studio/utils/gizmoSnap.js` (one copy, two gizmos).

**Verified** on a throwaway stack (serverXR :4381 with a scratch DATA_ROOT, vite :5381, plus an
`origin/dev` copy of the client on :5382 for "before"), headless Chromium: two Geos made with Nodes'
palette, a cube in one, a sphere in the other; Studio whole room draws both; switcher → Geo 1
(address gets `?geo=`); Add box → document has a `geom.cube` with `parentId` = Geo 1; Edit mode,
drag of the gizmo's X arrow → x 0.375 → 1.329, nothing else changed; Nodes inside Geo 1 shows both
cubes at those places; switcher → Geo 2 lists the sphere; ↗ on a card lands on Studio with that
Geo. An objects-only project: pixel-identical to `origin/dev` at 1440×900 (0 differing pixels).
Phone 412×915 @2.6: room, Create sheet with the switcher, Objects sheet. Tests: geoScope 24,
geoScopeAddress 7, RawGraphSurface +2; each seen failing with the change undone.

**Open / limits**
- Studio's own objects (text, group, portal, image, spot/directional/ambient lights) cannot stand in
  a Geo; inside a Geo Create offers only node kinds and says so for the rest. Unit 8's
  object-inside-a-Geo is still unbuilt.
- The whole room keeps Studio's sky and lights; node Environment/Scene sky is not applied in Studio.
- The ↗ on a card is the header's 16px glyph button — small on a phone; the ⋯ menu entry is the
  phone path. A proper tap target would be a design decision.
- The name pill (`zIndexRange [900,0]`, same as an object's) can draw over a floating window.
- `world.light` was named in the brief; Nodes' palette retired it, so the lamp is `light.point`.
