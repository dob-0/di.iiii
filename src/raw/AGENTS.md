# src/raw AGENTS

Short routing guide for AI agents working in `src/raw/`.

The sole experimental node-first lane. Originally forked from `src/beta/`
(2026-07-19, the first lane forked from another lane in this project — see
`docs/architecture/PROJECT_SURFACES.md`'s "On forking a new lane from
Beta") with three real differences at fork time: no singleton restrictions
anywhere (every node type nests freely — see
`docs/architecture/RECURSIVE_NODE_CORE.md`'s "Nesting"), a hierarchy-as-
connection active-marker toggle for scope-repeatable types, and a universal
"view as code" inspector section on every node type. Beta was retired
2026-08-06 (see `docs/architecture/PROJECT_SURFACES.md`'s "Beta retired,
absorbed into Raw") — Raw absorbed its role rather than the fork
graduating piecemeal.

## What This Area Owns

- the experimental Raw editor lane
- node-first and research-oriented editor workflows
- Raw hub/editor routing, local UX, and experimental state/services

## When To Edit Here

- edit here for intentionally experimental, research, or node-first behavior
- use this area when the change should affect Raw-specific UX or experimental editor flow
- move to `src/project/` if the change should also affect shared project sync, presence, or public viewing
- move to `src/shared/` if the change affects canonical schema/runtime truth

## Adjacent Systems To Check

- [../../AGENTS.md](../../AGENTS.md)
- [../../docs/ai/index.md](../../docs/ai/index.md)
- [../project/AGENTS.md](../project/AGENTS.md)
- [../shared/AGENTS.md](../shared/AGENTS.md)
- `../studio/` when deciding whether a behavior is experimental or mainline

## Do Not Assume

- do not treat `Raw` as the main shipped product lane — Studio still is (see `MANIFESTO.md`'s non-negotiable #6: the long-term direction is unifying Studio into Raw's node model, not a landing-page primacy switch ahead of that landing)
- do not fork shared project logic into Raw unless the behavior is intentionally experimental
- do not move canonical schema changes into Raw-only state or utilities
- do not re-add a singleton/scope-restriction mechanism to any node type without checking with the user first (product decision 2026-07-19, see `docs/architecture/RECURSIVE_NODE_CORE.md`)
- do not assume Studio's read-only graph/world previews (`StudioGraphSurface.jsx`, `StudioWorldSurface.jsx`) can be ignored when changing `RawGraphSurface.jsx`/`RawViewport.jsx`'s props — Studio wraps them directly and passes no mutation handlers, so a required prop added here breaks Studio's build

## Validation And Tests

- `npm run test`
- `npm run build`
- `npm run check:toolbar-overlap` — any `raw-topbar` change (dynamic center-slot state: hint pill vs. breadcrumb, both must survive 390–1440px without colliding with `.raw-topbar-right`)
- nearby tests:
  - `src/project/state/projectStore.test.js` (shared store; Raw consumes it directly)
  - `src/raw/utils/windowLayout.test.js`
  - `src/raw/utils/rawRouting.test.js`
  - `src/raw/utils/viewportWorldState.test.js` (active-marker pick logic)
  - `src/raw/components/RawGraphSurface.test.jsx` (active-marker toggle)
  - `src/project/graph/nodeInspectorSections.test.js` (universal code panel, shared)

## One-Line Summary

Use `src/raw/` for experimental node-first behavior, but keep shared document logic in `src/project/` and canonical schema truth in `src/shared/`.
