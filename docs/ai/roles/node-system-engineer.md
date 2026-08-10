# Node System Engineer — Role Card

**Code:** NSE  
**Lane:** Node graph model, port system, graph runtime, inspector sections

You own the node graph data model — what nodes exist, what ports they have, how they connect, how the runtime evaluates them. You do not touch CSS, layout, Three.js scene internals, or the server. Your changes define the contract that the UI and viewport consume.

---

## Owns

```
src/project/nodeRegistry.js           ← canonical node and port type definitions
src/project/graph/nodeGraphRuntime.js    ← graph evaluation and node execution
src/project/graph/nodeInspectorSections.js← inspector field definitions per node type
src/project/graph/nodeSurfaceFilters.js  ← which node types appear on which surface
src/project/graph/nodeGraphAuthoring.js  ← node/edge authoring operations
src/project/graph/useGraphClock.js       ← the graph clock (Time node)
src/raw/utils/surfaceWorkflow.js      ← which workflow actions belong to each surface
src/raw/utils/rawGuide.js             ← Raw help content (surface-aware)
```

---

## Must Never Touch

```
src/raw/styles/raw.css                     ← visual identity — UX territory
src/styles/                                ← shared styles — UX territory
*.css                                      ← any CSS file
serverXR/                                  ← backend — BAE territory
shared/                                    ← schema contracts — SPE territory
src/shared/                                ← schema contracts — SPE territory
src/raw/components/RawViewport.jsx         ← 3D rendering — VPE territory
src/studio/components/StudioViewport.jsx   ← 3D rendering — VPE territory
src/project/viewport/                      ← entity rendering — VPE territory
src/objectComponents/                      ← 3D objects — VPE territory
```

If a node type requires a new visual representation in the viewport, write the data model here and hand off to VPE for the rendering.

---

## Node Registry — Elite Knowledge

### File: `src/project/nodeRegistry.js`

This is the source of truth for all node types. Every node type must be registered here.

**Corrected 2026-08-11 — read this before trusting any older doc.** An earlier version of this
card, and a skill that copied it, documented `NODE_DEFINITIONS`, `getNodeDefinition()`,
`filterNodeDefinitions()`, and node fields `surface` / `family` / `defaultParams`. **None of
those have ever existed.** Checked directly against `src/project/nodeRegistry.js`. If you see
them anywhere, the doc is wrong, not the code.

The registry actually exports:

```js
NODE_TYPES              // OBJECT keyed by type id — not an array
NODE_CATEGORIES         // array of { id, label, color }
PORT_TYPES              // object keyed by port type id
UNIMPLEMENTED_NODE_TYPES  // Set of type ids that are authoring-only
getNodeType(typeId)     // lookup — NOT getNodeDefinition
getPortType(typeId)
getCategoryColor(categoryId)
arePortsCompatible(fromType, toType)
isNodeTypeImplemented(typeId)
listNodeTypes({ category, query, runtime, includeUnimplemented })
createNode(typeId, options)
createEdge(fromNodeId, fromPort, toNodeId, toPort, options)
getNodeInputs(node) / getNodeOutputs(node)
```

### Node Definition Shape

```js
'value.color': {
  id: 'value.color',        // matches the object key — namespaced, namespace.name
  label: 'Color',           // display label
  category: 'source',       // must match an id in NODE_CATEGORIES
  runtime: 'any',           // 'any' | 'web' (browser APIs) | 'local' (native drivers/USB)
  singleton: false,         // DEAD metadata — enforced nowhere. Do not read it.
  inputs: [],               // NOT ports.in
  outputs: [                // NOT ports.out
    { id: 'out', type: 'color', label: 'Color' },
  ],
  defaultValues: { value: '#5fa8ff' },   // NOT defaultParams
  render: 'hidden',         // 'spatial-3d' | 'panel-2d' | 'hidden' — NOT `surface`
}
```

Optional: `authoringOnly: true` — placeable and editable but computes/renders nothing yet.
It is a cosmetic palette hint only and **never gates creation**.

**There is no `surface` field on a node type.** Surface routing is derived from `render` (see
below). `singleton` is dead metadata from a product decision on 2026-07-19 that no node type
is a singleton; it survives as an unused `false` on existing types rather than being stripped
everywhere. Never branch on it.

### Registry Size — Derive It, Never Quote It

`docs/roadmaps/NODE_BACKLOG.md`, `docs/raw/USER_MANUAL.md` and
`docs/architecture/RAW_WORKSPACE.md` state the registry size **inconsistently** (49/27, 30/20,
54/22 — all three are wrong). No number is maintained anywhere, so do not copy one and do not
add a fourth. Compute it:

```js
Object.keys(NODE_TYPES).length          // total registered
UNIMPLEMENTED_NODE_TYPES.size           // authoring-only
listNodeTypes().length                  // implemented (excludes unimplemented by default)
```

As of 2026-08-11 that is **56 total / 37 implemented / 19 unimplemented**, across 10
categories. Re-derive rather than trusting that line — it goes stale the next time someone
adds a node.

### Port Types

The nine port types in `PORT_TYPES` — this list is exhaustive:

| Type id | Value shape | Notes |
|---------|-------------|-------|
| `number` | float | |
| `vec3` | `[x, y, z]` array | **`vec3`, not `vector3`** |
| `color` | CSS color string | `#rrggbb` |
| `boolean` | bool | |
| `string` | string | |
| `geometry` | geometry payload | |
| `texture` | texture payload | |
| `signal` | trigger/stream | |
| `any` | anything | the compatibility wildcard |

There is **no `asset` or `image` port type**. Asset references travel as `string` values;
picking an asset is an inspector concern, not a port type. Each entry carries a `color` used
as the wire color on the graph canvas.

### Adding a New Node Type

1. Add an entry to `NODE_TYPES` keyed by its namespaced id, with `id`, `label`, `category`,
   `runtime`, `inputs`, `outputs`, `defaultValues` and `render`
2. If it computes nothing yet, add it to `UNIMPLEMENTED_NODE_TYPES` — otherwise it appears in
   the palette as if it works
3. If it needs inspector fields beyond the auto-derived port controls, extend
   `nodeInspectorSections.js`
4. Surface placement follows from `render` — verify against `nodeSurfaceFilters.js` (below)
5. If it renders in 3D, hand off to VPE with the port schema. A `render: 'spatial-3d'` type
   with no case in `renderNodeBody` (inside `RawViewport.jsx`) is placeable and **renders
   nothing, silently** — do not ship the registry half alone
6. Add a test in `nodeRegistry.test.js`

### Surface Routing for Nodes

Derived from `render` and `category` — there is no `surface` field on a node type:

```js
// nodeSurfaceFilters.js — operates on TYPES, not node instances
matchesNodeTypeSurface(type, surface)
filterNodeTypesForSurface(types, surface)

// graph  → every type (the graph shows everything)
// view   → type.render === 'panel-2d'
// world  → type.render === 'spatial-3d' || type.category === 'world'
```

Note the asymmetry: a type reaches the World surface either by rendering in 3D **or** by being
in the `world` category (that is how `world.light` / `world.grid`, which are not themselves
meshes, appear there).

### Inspector Sections

`nodeInspectorSections.js` exports one function, `deriveNodeInspectorSections(node)`. Fields
are **derived from the node's ports**, not declared per type — `portToInspectorField` maps a
port's `type` to a control (`color` → color picker, `boolean` → checkbox, `vec3` → vec3 input,
`geometry`/`texture`/`signal` → a connection-only row, and so on).

Per-type special-casing happens inside that mapping. The asset picker is the example:

```js
// nodeInspectorSections.js
if (node?.typeId === 'view.image' && port.id === 'src') {
    return { label, path, type: 'asset', portType: 'texture', assetKind: 'image' }
}
```

Two things that section also does, which are easy to break:
- Every node type gets a **Code** section (`values.__code`, product decision 2026-07-19). It
  is deliberately **inert** — nothing reads or executes it. Do not wire it up to anything.
- `component: 'values'` on a section/field is **load-bearing routing**, not decoration. It
  points reads and writes at the node's single shared `values` object. Removing it as
  "redundant" breaks editing in that section.

Do not put field-derivation logic in the component that renders the inspector — it belongs here.

---

## Graph Runtime — Elite Knowledge

### File: `src/project/graph/nodeGraphRuntime.js`

The runtime evaluates the node graph: given a document with nodes and edges, it produces output values for each node's output ports.

Execution model:
- Topological sort of the graph (edges define dependency order)
- Evaluate each node using its input port values
- Output port values are passed to downstream nodes

Evaluation is driven by the **consumer**, not pushed from the editor: a viewport builds a
context with `createNodeGraphContext(document, { now, liveOutputs })` and calls
`evaluateNodeInputs(node, context)` per node it is about to render. It does not write to the
document.

Two seams that are easy to get wrong:
- **`liveOutputs` is real.** It is the channel that carries live data (webcam, mic, keeper,
  MIDI) into evaluation. Any claim that "no live stream ever reaches the graph" is out of date.
- **The clock.** `useGraphClock(hasClockNode(nodes))` supplies `now`, and the per-pass output
  cache is deliberately rebuilt every frame while a Time node exists. Memoizing the context
  across ticks freezes the clock at its first sample.

### Rules for Runtime Changes

- Never write evaluation output back to the document store — evaluation is read-only
- Evaluation must be pure: same inputs → same outputs, no side effects
- Never add synchronous I/O (file reads, network) to the evaluation loop
- New node types must have a corresponding evaluator branch, or be listed in
  `UNIMPLEMENTED_NODE_TYPES`

---

## Done Criteria for Any Node System Task

- `npm run lint` passes
- `npm run test` passes — specifically `nodeRegistry.test.js` and `nodeGraphRuntime.test.js`
- All new node types have entries in `NODE_TYPES`, keyed by their own `id`
- Anything that does not compute yet is in `UNIMPLEMENTED_NODE_TYPES`
- All new port types are added to `PORT_TYPES` and to the Port Types table above
- No logic forked into `RawEditor.jsx` or `RawViewport.jsx` — it belongs here
- Inspector field derivation lives in `nodeInspectorSections.js`, not in components
- No node count quoted in a doc or comment — derive it from `NODE_TYPES`

---

## Non-Goals

- Visual styling of node cards — that is UX territory
- Viewport rendering of new node types — that is VPE territory
- Persisting graph state — that is BAE/SPE territory
- Schema migration — that is SPE territory
