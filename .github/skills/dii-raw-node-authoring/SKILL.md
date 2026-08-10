---
name: dii-raw-node-authoring
description: 'Build or debug the Raw experimental editor lane. Use when working on node-first authoring, the node palette, Raw workspace windows, Raw routing, or experimental canvas interactions that should not yet ship in Studio.'
argument-hint: 'Describe the Raw node or editor feature'
---

# dii Raw Node Authoring

## When to Use
- You are adding an experimental node type, palette behavior, or canvas interaction to Raw.
- A bug exists in the Raw hub, editor, graph surface, viewport, or window layout.
- You are deciding whether a new behavior belongs in Raw or is already ready for Studio.
- You need to understand how Raw uses the shared project store and sync.

## Outcome
Make the smallest experimental change that advances node-first thinking without forking shared logic from src/project.

## Key Principle
Raw is the sole experimental lane and the proving ground, not the main shipped surface — Studio still is (MANIFESTO non-negotiable #6). The landing page promotes Raw at `/open/raw`, which is promotion of an experiment, not a change of product lane. Beta was retired 2026-08-06 and its role was absorbed into Raw; `src/beta/` no longer exists.

## Procedure
1. Start in src/raw/AGENTS.md to confirm the behavior is intentionally experimental.
2. Check whether the shared layer in src/project already owns the behavior you need.
3. If shared ownership is needed, prefer src/project over forking the logic in Raw.
4. If the behavior is genuinely experimental, add it in src/raw.
5. Use the shared store (src/project/state/projectStore.js) and shared sync hooks — Raw has no project store of its own.
6. Use the node registry in src/project/nodeRegistry.js for node type definitions; it is shared across lanes.
7. Keep Raw window and canvas interactions in src/raw/components and src/raw/utils.
8. Do not push schema changes into Raw-only state.
9. Validate with the nearby Raw tests, then run the broader test suite to confirm shared layers were not broken.

## Raw-Specific Surfaces
- src/raw/RawApp.jsx routes between hub, projects, and editor; BlankNodeWorkspaceApp.jsx is the local, serverless workspace entrypoint
- src/raw/components/RawHub.jsx owns project listing, creation, delete, and the live pointer
- src/raw/components/RawEditor.jsx composes the windows, graph surface, viewport, and inspector
- src/raw/components/NodePalette.jsx owns node creation, filtered per surface via src/project/graph/nodeSurfaceFilters.js
- src/raw/components/RawGraphSurface.jsx and RawViewport.jsx are the two authoring surfaces
- src/raw/utils/ owns Raw routing, window layout, zen mode, surface workflow, and local workspace storage
- src/raw/director/ is the Director/edit-list research area

## Node Registry Pattern
- Node definitions live in src/project/nodeRegistry.js because they are shared across lanes
- Read types with getNodeType and listNodeTypes; create graph entities with createNode and createEdge
- Define a node type with id, label, category, runtime, singleton, inputs, outputs, defaultValues, and render
- Port compatibility is arePortsCompatible over PORT_TYPES; unimplemented types are flagged by isNodeTypeImplemented, which is a UI hint and never gates creation
- Keep node definitions data-only and free from React dependencies
- Do not re-add a singleton or scope restriction to any node type without checking with the user first (product decision 2026-07-19, docs/architecture/RECURSIVE_NODE_CORE.md)

## Raw Workspace Layout
- Raw windows are free-floating, not docked panels; geometry helpers live in src/raw/utils/windowLayout.js
- layout and zen preferences are stored locally (src/raw/utils/zenMode.js, localWorkspaceStorage.js), not as project document fields
- any raw-topbar change must survive 390-1440px: run `npm run check:toolbar-overlap`

## Graduation Criteria: Raw to Studio
A Raw pattern is ready to graduate when:
- it has no remaining placeholder branches or research flags
- it has test coverage
- it does not depend on Raw-only hacks to function
- a decision was made that it should ship to all users in Studio

## Cross-Lane Trap
Studio embeds RawGraphSurface.jsx and RawViewport.jsx directly (StudioGraphSurface.jsx, StudioWorldSurface.jsx) as read-only previews and passes no mutation handlers — a new required prop added in Raw breaks Studio's build.

## Repo Anchors
- Raw guide: ../../../src/raw/AGENTS.md
- Shared project guide: ../../../src/project/AGENTS.md
- Node registry: ../../../src/project/nodeRegistry.js
- Studio lane: ../../../src/studio/AGENTS.md
- Surface map: ../../../docs/architecture/PROJECT_SURFACES.md

## Validation
- npm run test (including the Raw tests under src/raw)
- npm run build
- npm run check:toolbar-overlap when raw-topbar changed

## Completion Checks
- Change is in src/raw unless it was intentionally moved to a shared layer.
- No shared project sync or store logic was forked into Raw.
- Node definitions that may become shared are in src/project/nodeRegistry.js.
- Schema truth was not pushed into Raw-only state.
- Studio's read-only graph and world previews still build.
