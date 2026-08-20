# The surface axis retires; selection lives in its scope (plan PR 1.5)

## What was wrong

Selection visibility was filtered by node TYPE against a retired
World/View/Graph "surface" axis. `activeSurface` defaults to 'world' in every
document, so selecting a panel node (Text, Image, Monitor) produced NO
inspector and NO Delete — the type filter ate it. And because navigation never
cleared `selectedNodeId`, a red Delete FAB stayed armed for a node invisible
in the current scope. The axis itself survived only as vestige: rawGuide and
the Help dialog taught three switchable surfaces that no longer exist.

## What changed

- One predicate replaces the type filter: `isNodeInScope(node, scopeId)`
  (useNodeGraphScope.js) — selection is visible only in the scope where the
  node stands; entities count at root only.
- Scope walks clear the selection (handleEnterNode/handleNavigateToScope),
  so the stale id never travels.
- Keyboard delete in RawEditor now serves OBJECTS only — node deletion is
  RawGraphSurface's own scope-checked handler; both firing double-opped.
- `activeSurface` is gone: schema default + clamp removed, normalize sheds
  the key (mirrored in shared/projectSchema.cjs — the ESM/CJS sync test
  caught the first attempt). No migration: it was UI state.
- Deleted nodeSurfaceFilters.js + surfaceWorkflow.js (+tests). NodePalette
  lost its surface filter (full palette everywhere). rawGuide trimmed to ONE
  truthful section (make/wire/enter/Room); the Help dialog lost the three
  surface diagrams and its surface prop. Full teach rewrite waits for the
  naming wave's words.
- Dead code out: workflowRef/workflowHeight (measured a ref never attached).

## Verified

By eye on the local build (screenshots read): a selected Note panel shows
inspector + Delete (previously nothing); a stale foreign-scope selection
shows no Delete; entering a Geo clears the stored selection to null. Full
suite 2439/2439 (schema CJS mirror synced), lint below baseline, build,
anatomy, wiki checks green.
