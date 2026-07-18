# src/seed AGENTS

Short routing guide for AI agents working in `src/seed/`.

A fork of `src/beta/` (2026-07-19, the first lane forked from another lane
in this project — see `docs/architecture/PROJECT_SURFACES.md`'s "On forking
a new lane from Beta"). Same node registry/scope model as Beta, but: no
singleton restrictions anywhere (every node type nests freely — see
`docs/architecture/RECURSIVE_NODE_CORE.md`'s "Nesting"), a hierarchy-as-
connection active-marker toggle for scope-repeatable types, and a universal
"view as code" inspector section on every node type. The two lanes are
otherwise independent forks, not shared components — Beta was deliberately
left untouched beyond removing its now-obsolete blocked-create warning.

## What This Area Owns

- the experimental Seed editor lane
- node-first and research-oriented editor workflows
- Seed hub/editor routing, local UX, and experimental state/services

## When To Edit Here

- edit here for intentionally experimental, research, or node-first behavior
- use this area when the change should affect Seed-specific UX or experimental editor flow
- move to `src/project/` if the change should also affect shared project sync, presence, or public viewing
- move to `src/shared/` if the change affects canonical schema/runtime truth

## Adjacent Systems To Check

- [../../AGENTS.md](../../AGENTS.md)
- [../../docs/ai/index.md](../../docs/ai/index.md)
- [../project/AGENTS.md](../project/AGENTS.md)
- [../shared/AGENTS.md](../shared/AGENTS.md)
- `../studio/` when deciding whether a behavior is experimental or mainline

## Do Not Assume

- do not treat `Seed` as the main shipped product lane
- do not fork shared project logic into Seed unless the behavior is intentionally experimental
- do not move canonical schema changes into Seed-only state or utilities
- do not re-add a singleton/scope-restriction mechanism to any node type without checking with the user first (product decision 2026-07-19, see `docs/architecture/RECURSIVE_NODE_CORE.md`)
- do not assume Beta and Seed share components — they're independent forks; a fix in one does not apply to the other unless deliberately ported

## Validation And Tests

- `npm run test`
- `npm run build`
- nearby tests:
  - `src/project/state/projectStore.test.js` (shared store; Seed consumes it directly)
  - `src/seed/utils/windowLayout.test.js`
  - `src/seed/utils/seedRouting.test.js`
  - `src/seed/utils/viewportWorldState.test.js` (active-marker pick logic)
  - `src/seed/components/SeedGraphSurface.test.jsx` (active-marker toggle)
  - `src/project/graph/nodeInspectorSections.test.js` (universal code panel, shared)

## One-Line Summary

Use `src/seed/` for experimental node-first behavior, but keep shared document logic in `src/project/` and canonical schema truth in `src/shared/`.
