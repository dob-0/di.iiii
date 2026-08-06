# Recursive Node Core

Ground truth as of 2026-07-19 (updated when the singleton system was removed
and the `raw` lane forked from Beta; originally written after this file was
found to be a dead link from `AGENTS.md`/`README.md`/`ORIENTATION_MAP.md` for
an unknown period — see `docs/ai/audit-2026-07-17.md`). Source of truth is
always the code below, not this doc; re-verify before trusting a specific
claim here if it's been a while.

## The two type systems in one document

A project document (`src/shared/projectSchema.js` / `shared/projectSchema.cjs`)
holds two parallel, non-overlapping type systems that never reference each
other:

- **`entities[]`** — scene objects (box/sphere/model/light/portal/...),
  normalized by `normalizeEntity` with rich per-type component defaults. This
  is the older, non-node-graph object model, still load-bearing for Studio's
  own viewport and V1.
- **`nodes[]` / `edges[]` / `templates[]`** — the node graph. Node *instance*
  shape is `{id, typeId, label, values, graphX, graphY, runtimeId, assetRef,
  parentId}`; type *metadata* (ports, category, render surface, an
  `authoringOnly` cosmetic hint) lives entirely in `src/project/
  nodeRegistry.js`, looked up by `typeId`. The schema layer does not import
  the registry — normalization never validates `typeId` against it (see
  "What's enforced" below). The registry still carries a `singleton` field on
  ~33 types but it's dead metadata as of 2026-07-19 (see "Nesting" below) —
  do not read it.

## Recursion: nodes inside nodes

`parentId` on a node points at another node's id (or is empty for a
document-root node). This is the entire recursion mechanism — there is no
separate "container" node type. `src/project/graph/useNodeGraphScope.js`
walks this as a navigation stack (`navStack`, `[null]` = document root);
entering a node pushes its id, so "the graph inside node X" is just every
other node whose `parentId === X`.

**Node 0** (`universe.node0`) is an ordinary node type, not a special root
(product decision 2026-07-17, reversing an earlier audit fix that had made it
a document-wide singleton). The true document root is `currentScopeId === null`
in `useNodeGraphScope` — a plain, always-available scope you can place any
node directly into, same as any node's interior. Node 0 is not auto-created,
not auto-entered on load, not a singleton, and not undeletable; it's just a
node type you can place (like any other) if you want a node literally called
"Node 0". See `docs/ai/known-fixes.md` for the full history of this reversal.

## Nesting: no node type is a singleton

Product decision 2026-07-19 generalizes the Node 0 reversal above to every
remaining former singleton (`time`, `source.ar`, `universe.world`,
`world.light`, `world.background`, `world.grid`): none of them are enforced
as singletons anymore, anywhere. `SINGLETON_TYPE_IDS`/`SCOPE_SINGLETON_TYPE_IDS`/
`getSingletonDedupKey` were deleted outright from `src/shared/projectSchema.js`
and `shared/projectSchema.cjs` (not just unused — gone, so nobody accidentally
re-enforces them). Any number of any node type can exist in one scope now;
`createNode` never silently drops a duplicate.

This follows a deliberate design (a multi-tool research pass across
TouchDesigner, Houdini, Blender, Nuke, Unreal Blueprints, vvvv, Resolume,
Cables.gl, Max/MSP, VCV Rack, QLab, and Ableton informed it), not just "fewer
restrictions": **hierarchy is the connection**. Being a sibling inside a
scope (via `parentId`) is itself the meaningful relationship — no wire
needed — the same pattern Kantan Mapper (a shipped TouchDesigner tool) uses
for its list of mapping shapes: adding a shape is adding a child, full stop.

For the few scope-repeatable types where exactly one result is genuinely
needed (a World's active Light/Background/Grid, or which World is "the" live
one for a scope), the answer isn't a schema-level restriction — it's an
explicit **active marker**, stored in `workspaceState`:

- `liveWorldNodeIdByScope` — pre-existing, `universe.world`-specific, keyed by
  scopeId. Set via the World panel's own live toggle; read by
  `StudioWorldSurface.jsx` and (in the `raw` lane) `RawEditor.jsx`'s
  `worldNode` lookup.
- `activeNodeIdByTypeScope` — added 2026-07-19, generalizes the same idea to
  `world.light`/`world.background`/`world.grid`. Keyed by `` `${typeId}::${scopeId}` ``.
  Set via a small ● toggle on the node's graph card (`raw`'s
  `RawGraphSurface.jsx`); read by `RawViewport.jsx` and
  `viewportWorldState.js`'s `pickActiveTypeNode` helper. Both maps default to
  the first-created candidate when nothing's been explicitly marked.

Beta was not given this active-marker mechanism (kept as the original
sketch — its `worldNode`/`lightNode`/`gridNode` lookups just pick the first
sibling via `.find()`, which is fine now that a duplicate isn't blocked, just
not the "correct" pick when there's more than one).

## Evaluation

`src/project/graph/nodeGraphRuntime.js` walks the graph per render pass via
`evaluateNodeOutput`/`evaluateNodeInput`, memoized per-pass (`outputCache`,
keyed `${nodeId}:out:${portId}`, added 2026-07-17 — see known-fixes.md #23)
to avoid recomputing a shared upstream node once per downstream consumer.

**Only two node families actually compute anything:** `value.*` (returns its
stored value) and `math.add/subtract/multiply/divide/mod/pow/sin/mix/clamp`.
Every other registered type — `source.*`, `device.*`, `stream.*`, most of
`universe.*` — falls through to a static passthrough (`node.values?.[portId]`)
with no real runtime behavior. This includes `time`, which advertises
`elapsed/sin/cos/beat` outputs but has no clock/frame driver anywhere in the
runtime — a `time` node is inert today. Treat any of those types as
authoring/metadata declarations, not live computation, until this changes.

Cycle protection is a `stack` Set of `id:in/out:port` keys threaded through
recursive calls; re-entry returns the node's stored/default value rather
than infinite-looping.

Consumers of this runtime today: `src/beta/*`
(`BetaViewport`/`BetaEditor`/`viewportWorldState`) and, since 2026-07-19,
`src/raw/*` (`RawViewport`/`RawEditor`/`viewportWorldState`) — a lane
forked from Beta, see "The `raw` lane" below. Studio's own viewport does
not evaluate the graph — Studio's dev-only graph/world preview panes
(`StudioGraphSurface.jsx`/`StudioWorldSurface.jsx`) reuse Beta's components
read-only, gated off in production builds.

## What normalization enforces vs. what's just convention

**Enforced** by `normalizeProjectDocument`: numeric coercion + clamps on
window/grid/camera/render settings; enum whitelists (presentation mode,
`activeSurface`, XR default mode, tone mapping, reference mode); edges are
dropped unless both endpoints exist; `selectedNodeId` is nulled if it
doesn't resolve. (Singleton dedup used to be enforced here too — removed
2026-07-19, see "Nesting" above.)

**Not enforced** — real, convention-only gaps worth knowing before assuming
otherwise:

- `node.typeId` is never checked against the registry's `NODE_TYPES` — a
  node with a garbage or removed `typeId` persists silently.
- `node.values` is entirely unchecked — no per-port type/range/default
  coercion from the registry is applied at normalization, unlike entity
  components.
- Edge `fromPort`/`toPort` are free strings — no check that the port exists
  on its node or that `arePortsCompatible` would actually allow the wiring.
- `parentId` is never validated to reference an existing node — only
  `selectedNodeId` gets that treatment. A dangling parent scope survives
  normalization; cleanup is left to `useNodeGraphScope.js`.

## Newer additions a stale reading of this doc would miss

- **`configInputs`** — a config channel distinct from ports, living in
  `node.values` but never evaluated by the runtime (the inspector merges
  `type.inputs` + `type.configInputs`; `getNodeInputs` does not).
- **`node.null`'s dynamic per-instance ports** (`values.portDefs`), handled
  specially in port-listing helpers.
- **No singletons, active markers instead.** See "Nesting" above — replaces
  what used to be here about per-scope singleton dedup.
- **Universal code panel** (`src/project/graph/nodeInspectorSections.js`,
  2026-07-19). Every node type — not just `node.null` — gets an inspector
  "Code" section, stored under a reserved `values.__code` key (distinct from
  `node.null`'s real, load-bearing `values.body`). Fully inert: nothing
  reads or executes `values.__code` anywhere, it's storage/display only.
  Wiring note: the section's own `id` ('code') differs from the Ports
  section's ('values') for React-key/labeling purposes, so it routes reads
  and writes back to the shared `node.values` object via `component:
  'values'` on the section and its field — the same mechanism the
  `worldState` inspector section already used for its own fields.

## The `raw` lane

`src/raw/` (routes at `/open/raw`) was forked from Beta on 2026-07-19 — the
first lane forked from another lane rather than built from scratch (no prior
graduation/retirement policy existed for experimental lanes before this; see
`docs/architecture/PROJECT_SURFACES.md`). It carried the same node registry,
`useNodeGraphScope.js`, and `nodeGraphRuntime.js` as Beta, with three real
differences at fork time: no singleton/blocked-create warning (nothing left
to block, see "Nesting" above), the active-marker mechanism for
World/Light/Background/Grid (see "Nesting" above), and a scope-filtered edge
list passed to its graph surface (Beta passed the document's full,
unfiltered edge list — a latent inconsistency `raw` didn't carry forward).
Beta was retired 2026-08-06 (see `docs/architecture/PROJECT_SURFACES.md`'s
"Beta retired, absorbed into Raw") — Raw is now the sole node-first lane,
and those three points are history, not an ongoing diff against a lane that
no longer exists.

## CJS/ESM mirror status

`shared/projectSchema.cjs` and `src/shared/projectSchema.js` were diffed
directly as part of the 2026-07-17 audit and are behaviorally identical —
every apparent difference is cosmetic (module syntax, `Set` vs array+derived-
set for `ENTITY_TYPES`). `serverXR/src/schemaSync.test.js` round-trips
representative documents/op-batches through both and is the regression guard
against future drift. The 2026-07-19 singleton removal and
`activeNodeIdByTypeScope` addition were made identically in both files in the
same change; `schemaSync.test.js` was updated to assert free nesting (was:
"universe.world is treated as a singleton") rather than deleted.
