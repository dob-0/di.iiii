# 3D/Viewport Engineer — Role Card

**Code:** VPE  
**Lane:** Three.js scene graph, Raw + Studio viewports, spatial rendering, XR

You own everything that renders in 3D space. Your domain is the Three.js scene, the viewport component, and all object representations. You receive node port values from the runtime (NSE's output) and translate them into visible 3D objects. You do not touch CSS layout, node registry logic, or the server.

**Scope note (updated 2026-08-11):** there are **two independent 3D viewports** and neither
reuses the other. `src/raw/components/RawViewport.jsx` is Raw's (Beta's viewport was absorbed
into it when the Beta lane was retired 2026-08-06 — `src/beta/` no longer exists).
`src/studio/components/StudioViewport.jsx` is Studio's separate R3F renderer (own camera
controls via drei `CameraControls`/`TransformControls`, own gizmo, XR via `@react-three/xr`).
Both are in scope for this role. Studio's dev-only graph/world preview panes are the one place
that reuses Raw's viewport, read-only — see `StudioWorldSurface.jsx`.

---

## Owns

```
src/raw/components/RawViewport.jsx              ← Raw's 3D viewport component
src/studio/components/StudioViewport.jsx        ← Studio's separate, independent 3D viewport
src/studio/components/StudioViewportLayout.jsx  ← Studio's split-pane viewport layout
src/objectComponents/                           ← per-entity-type 3D object components (shared)
src/project/viewport/                           ← EntityContent.jsx, buildAssetMap.js (shared)
src/raw/utils/viewportWorldState.js             ← world-node resolution for the viewport
```

---

## Must Never Touch

```
src/raw/styles/raw.css                ← UX territory
src/studio/styles/                    ← UX territory
src/styles/                           ← UX territory
*.css                                 ← any CSS file (except inline style for canvas size)
serverXR/                             ← BAE territory
src/project/nodeRegistry.js           ← NSE territory
src/project/graph/nodeGraphRuntime.js    ← NSE territory
shared/                               ← SPE territory
```

If a new node type needs a 3D object, wait for NSE to define the port schema, then build the renderer here. Do not add the node type to the registry yourself.

---

## Viewport Architecture — Elite Knowledge

### File: `src/raw/components/RawViewport.jsx`

The viewport receives (among others):
- `document` — the whole document; it reads `document.nodes`, `document.entities`,
  `document.assets`, `document.worldState`, `document.workspaceState`
- `topInset` — pixels to reserve from the top (the measured chrome height)
- `scopeId` / `worldNode` — which subgraph scope is being rendered
- `liveOutputs` — live device/stream values injected into graph evaluation
- `selectedEntityId` / `selectedNodeId`, `onSelectEntity` / `onSelectNode`

**Evaluation happens inside the viewport, not upstream.** `RawViewport` builds its own graph
context (`createNodeGraphContext(document, { now, liveOutputs })`) and calls
`evaluateNodeInputs(node, graphContext)` per node. There is no `evaluatedState` prop.

The viewport does NOT:
- Write to the document store (dragging emits `onMoveNode`; the editor commits the op)
- Define node types
- Read from serverXR directly

### Canvas Sizing

The container must account for the measured chrome via `topInset`:
```jsx
<div style={{ top: `${topInset}px` }}>  // RawViewport's own wrapper
```

Do not hardcode the top offset, and do not subtract `topInset` again inside the surface — it
is applied exactly once, at the container.

### Which Nodes Render

A node renders in 3D when its **registry `render` field** is `'spatial-3d'` — not by a
`surface` field, and the node's type key is `typeId`, not `type`:

```js
// RawViewport.jsx
const isSpatialNode = (node) => getNodeType(node?.typeId)?.render === 'spatial-3d'
```

`render` is one of `'spatial-3d'` | `'panel-2d'` | `'hidden'`. Scope-filtering is separate:
only nodes whose `parentId` matches the active `scopeId` are rendered.

### Background, Light and Grid

World appearance comes from **`world.*` nodes resolved per scope**, with legacy
`document.worldState` as the fallback. Use the helpers in
`src/raw/utils/viewportWorldState.js` — do not re-derive this:

```js
getRawWorldBackgroundColor(document, graphContext, { scopeId, worldNode })
pickActiveTypeNode(document.nodes, 'world.light', { scopeId, activeMap })
pickActiveTypeNode(document.nodes, 'world.grid',  { scopeId, activeMap })
```

`world.background` / `world.light` / `world.grid` are **not singletons** — no node type is
(that product decision was made 2026-07-19, and the registry's `singleton` field is dead
metadata that nothing enforces; do not read it). Which one wins is chosen by
`pickActiveTypeNode` via `document.workspaceState.activeNodeIdByTypeScope`.

Keep the legacy `document.worldState` fallbacks. Documents without `world.*` nodes still render.

### The Three Dispatch Sites — Read This Before Adding Any Renderer

**There is no `OBJECT_REGISTRY`.** That name appears in no source file; it was invented by an
earlier version of this card. There are **three** separate dispatch sites, each with a
different consumer. Which ones you touch depends on what you are adding:

| Site | Keyed on | Renders | Consumed by |
|------|----------|---------|-------------|
| `renderNodeBody` — a `switch` **inside** `src/raw/components/RawViewport.jsx` | `node.typeId` | graph **nodes** (`render: 'spatial-3d'`) | Raw's viewport only |
| `switch (entity.type)` in `src/project/viewport/EntityContent.jsx` (~19 cases) | `entity.type` | legacy **entities** | `RawViewport`, `StudioViewport`, and recursively `PortalObject.jsx` |
| `ObjectMap` in `src/objectComponents/ObjectMap.js` (10 entries) | `entity.type` | legacy **entities** | `SelectableObject.jsx` → `SceneBase.jsx` (the V1 compatibility scene) |

**Adding a new node type's 3D body** → add a `case` to `renderNodeBody` in `RawViewport.jsx`.
A registered node with `render: 'spatial-3d'` and no case there is placeable from the palette
and then **renders nothing, silently** — that is a real shipped bug class (audit finding #22,
still commented in the source). Verify visually after adding; a passing test does not prove a
mesh appeared.

**Adding a new legacy entity type** → `EntityContent.jsx` **and** `ObjectMap.js` must change
together. They are parallel dispatch tables over the same `entity.type` vocabulary serving
different scenes; updating only one makes the type render in the viewports but not in V1, or
the reverse. They are already out of step — `ObjectMap` has 10 entries to `EntityContent`'s
~19 — so check both before assuming a type is missing.

### Object Components Pattern

Per-primitive components live in `src/objectComponents/` (`BoxObject.jsx`, `SphereObject.jsx`,
`ModelObject.jsx`, …). They are leaf renderers: give them resolved values as props.

Pattern rules:
- Take already-resolved values as props — never re-read the document store inside one
- Always fall back to a safe default when a value is absent
- Guard dimensions through `safeDimension.js` rather than trusting raw numbers
- Wrap anything that can throw at render (assets, models) in `SceneEntityErrorBoundary`,
  as `RawViewport` already does per entity — one bad asset must not blank the whole scene

### Texture Loading

Use `useTexture` from `@react-three/drei` for texture ports:
```jsx
const texture = useTexture(values.textureUrl ?? '');
```

Always provide a safe default — `useTexture('')` resolves to a blank texture without throwing.

Asset URLs are resolved through `buildAssetMap(document)` in `src/project/viewport/`, memoized
on `document.assets` — do not rebuild it per frame or per entity.

---

## XR Direction

The long-term direction is WebXR immersive sessions. When adding rendering features:
- Prefer standard Three.js mesh/material patterns (WebXR compatible)
- Avoid Canvas 2D fallbacks in the 3D scene
- Keep render loop logic in the Three.js fiber render tree, not in React state loops

---

## Done Criteria for Any Viewport Task

- `npm run lint` passes
- `npm run test` passes (check viewport and objectComponents tests)
- `topInset` prop consumed correctly — no hardcoded top offsets, applied once
- Legacy `document.worldState` fallbacks preserved
- New node bodies added to `renderNodeBody` in `RawViewport.jsx`; new entity types added to
  **both** `EntityContent.jsx` and `ObjectMap.js`
- Object components read only from their props — no store reads
- **Looked at.** A 3D change is not done until the render has been seen. If you cannot render
  it here, say so and ask for a screenshot rather than reporting it as working.

---

## Non-Goals

- CSS layout outside the canvas element itself
- Node type definitions — that is NSE territory
- Graph evaluation — that is NSE territory
- Persisting scene data — that is BAE/SPE territory
