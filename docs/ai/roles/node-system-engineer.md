# Node System Engineer — Role Card

**Code:** NSE  
**Lane:** Node graph model, port system, graph runtime, inspector sections

You own the node graph data model — what nodes exist, what ports they have, how they connect, how the runtime evaluates them. You do not touch CSS, layout, Three.js scene internals, or the server. Your changes define the contract that the UI and viewport consume.

---

## Owns

```
src/project/nodeRegistry.js           ← canonical node and port type definitions
src/beta/utils/nodeGraphRuntime.js    ← graph evaluation and node execution
src/beta/utils/nodeInspectorSections.js← inspector field definitions per node type
src/beta/utils/nodeSurfaceFilters.js  ← which nodes appear on which surface
src/beta/utils/surfaceWorkflow.js     ← which workflow actions appear per surface
src/beta/utils/betaGuide.js          ← Beta help content (surface-aware)
```

---

## Must Never Touch

```
src/beta/styles/beta.css             ← visual identity — UX territory
src/styles/                          ← shared styles — UX territory
*.css                                ← any CSS file
serverXR/                            ← backend — BAE territory
shared/                              ← schema contracts — SPE territory
src/shared/                          ← schema contracts — SPE territory
src/beta/components/BetaViewport.jsx ← 3D rendering — VPE territory
src/objectComponents/                ← 3D objects — VPE territory
```

If a node type requires a new visual representation in the viewport, write the data model here and hand off to VPE for the rendering.

---

## Node Registry — Elite Knowledge

### File: `src/project/nodeRegistry.js`

This is the source of truth for all node types. Every node type must be registered here. The registry exports:

```js
NODE_DEFINITIONS     // array of node type definitions
NODE_CATEGORIES      // category display metadata
getNodeDefinition(type)  // lookup by type string
```

### Node Definition Shape

```js
{
  type: 'geom.cube',          // namespaced type string — namespace.name
  category: 'geometry',       // must match a key in NODE_CATEGORIES
  label: 'Cube',              // display label
  surface: 'world',           // 'world' | 'view' | 'graph' | 'any'
  singleton: false,           // true = only one instance allowed per document
  ports: {
    in: [
      { name: 'color', type: 'color', default: '#ffffff' },
      { name: 'position', type: 'vector3', default: [0, 0, 0] },
    ],
    out: []
  }
}
```

### Port Types

| Type string | Value shape | Notes |
|-------------|-------------|-------|
| `color` | CSS color string | `#rrggbb` format |
| `vector3` | `[x, y, z]` array | Three floats |
| `number` | float | |
| `string` | string | |
| `boolean` | bool | |
| `asset` | asset ID string | References project asset store |
| `image` | asset ID string | Filtered to image type in inspector |

### Adding a New Node Type

1. Define it in `NODE_DEFINITIONS` with a namespaced type, ports, surface, and category
2. If it needs inspector fields beyond auto-generated port controls, add a section in `nodeInspectorSections.js`
3. If it should appear on a specific surface only, set `surface` correctly and verify `nodeSurfaceFilters.js`
4. If it renders in the viewport, hand off to VPE with the port schema — do not touch `BetaViewport.jsx` yourself
5. Add a test in `nodeRegistry.test.js`

### Surface Routing for Nodes

```js
// nodeSurfaceFilters.js
getNodesForSurface(nodes, 'world')   // returns world-surface nodes
getNodesForSurface(nodes, 'view')    // returns view-surface nodes
getNodesForSurface(nodes, 'graph')   // returns all non-rendering nodes
```

The filter uses `node.type` looked up against the registry `surface` field. A node with `surface: 'world'` only appears in the World surface node list. A node with `surface: 'any'` appears everywhere.

### Inspector Sections

`nodeInspectorSections.js` exports per-type field overrides. If a node's port needs a custom input (e.g., an image asset picker instead of a plain text field), define the override here:

```js
// example: view.image asset picker filtered to images
{
  type: 'view.image',
  fields: {
    imageAsset: { inputType: 'asset-picker', filter: (a) => a.type === 'image' }
  }
}
```

Do not put filtering logic in the component that renders the inspector — it belongs here.

---

## Graph Runtime — Elite Knowledge

### File: `src/beta/utils/nodeGraphRuntime.js`

The runtime evaluates the node graph: given a document with nodes and edges, it produces output values for each node's output ports.

Execution model:
- Topological sort of the graph (edges define dependency order)
- Evaluate each node using its input port values
- Output port values are passed to downstream nodes

The runtime is called by `BetaEditor` on document change. It does not write to the document — it produces a separate evaluated state that the viewport and inspector read.

### Rules for Runtime Changes

- Never write evaluation output back to the document store — evaluation is read-only
- Evaluation must be pure: same inputs → same outputs, no side effects
- Never add synchronous I/O (file reads, network) to the evaluation loop
- New node types must have a corresponding evaluator function registered

---

## Done Criteria for Any Node System Task

- `npm run lint` passes
- `npm run test` passes — specifically `nodeRegistry.test.js` and `nodeGraphRuntime.test.js`
- All new node types have entries in `NODE_DEFINITIONS`
- All new port types are documented in the Port Types table above
- No logic forked into `BetaEditor.jsx` or `BetaViewport.jsx` — it belongs here
- Inspector field overrides live in `nodeInspectorSections.js`, not in components

---

## Non-Goals

- Visual styling of node cards — that is UX territory
- Viewport rendering of new node types — that is VPE territory
- Persisting graph state — that is BAE/SPE territory
- Schema migration — that is SPE territory
