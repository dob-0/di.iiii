# Recursive Node Core

Ground truth as of 2026-07-17 (written after this file was found to be a
dead link from `AGENTS.md`/`README.md`/`ORIENTATION_MAP.md` for an unknown
period — see `docs/ai/audit-2026-07-17.md`). Source of truth is always the
code below, not this doc; re-verify before trusting a specific claim here
if it's been a while.

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
  parentId}`; type *metadata* (ports, category, render surface, singleton
  flag) lives entirely in `src/project/nodeRegistry.js`, looked up by
  `typeId`. The schema layer does not import the registry — normalization
  never validates `typeId` against it (see "What's enforced" below).

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

Consumers of this runtime today: only `src/beta/*`
(`BetaViewport`/`BetaEditor`/`viewportWorldState`). Studio's own viewport does
not evaluate the graph — Studio's dev-only graph/world preview panes
(`StudioGraphSurface.jsx`/`StudioWorldSurface.jsx`) reuse Beta's components
read-only, gated off in production builds.

## What normalization enforces vs. what's just convention

**Enforced** by `normalizeProjectDocument`: numeric coercion + clamps on
window/grid/camera/render settings; enum whitelists (presentation mode,
`activeSurface`, XR default mode, tone mapping, reference mode); edges are
dropped unless both endpoints exist; `selectedNodeId` is nulled if it
doesn't resolve; the two singleton dedup sets (`SINGLETON_TYPE_IDS`,
`SCOPE_SINGLETON_TYPE_IDS`).

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
- **Per-scope singletons.** `universe.world`/`world.light`/`world.background`/
  `world.grid` dedup per `parentId` (`typeId::parentId` key), not
  document-wide — a scope-relative distinction the registry's plain boolean
  `singleton` flag doesn't itself express.

## CJS/ESM mirror status

`shared/projectSchema.cjs` and `src/shared/projectSchema.js` were diffed
directly as part of the 2026-07-17 audit and are behaviorally identical —
every apparent difference is cosmetic (module syntax, `Set` vs array+derived-
set for `ENTITY_TYPES`). `serverXR/src/schemaSync.test.js` round-trips
representative documents/op-batches through both and is the regression guard
against future drift.
