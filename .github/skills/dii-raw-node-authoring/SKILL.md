---
name: dii-raw-node-authoring
description: 'Build or debug the node-first editor lane (src/raw). Use when working on node types, the node palette, canvas window layout, local workspace state, node-lane routing, or experimental canvas interactions that should not yet ship in Studio.'
argument-hint: 'Describe the node or canvas feature'
---

# dii Node Authoring

The lane this skill used to describe was `src/beta/`, deleted 2026-08-06 with
its role absorbed into `src/raw/`. Every step below now names a real path.

## When to Use
- You are adding a node type, palette behavior, or canvas interaction.
- A bug exists in the node hub, editor, window layout, or the local workspace store.
- You are deciding whether a behavior belongs on the canvas or is ready for Studio.
- You need to understand local workspace state and how it meets shared project sync.

## Outcome
Make the smallest change that advances node-first thinking without forking shared logic from `src/project`.

## Key Principle
The node lane is the proving ground, not the main shipped surface. When a pattern is stable enough to ship, move it to Studio or `src/project` before promoting it.

## Procedure
1. Start in `src/raw/AGENTS.md` to confirm the behavior belongs on this surface.
2. Check whether the shared layer in `src/project` already owns the behavior you need.
3. If shared ownership is needed, prefer `src/project` over forking the logic.
4. If the behavior is genuinely canvas-side, add it in `src/raw`.
5. Use `src/raw/utils/localWorkspaceStorage.js` for local workspace state.
6. Use the node registry in `src/project/nodeRegistry.js` for node type definitions.
7. Keep canvas interactions in `src/raw/components/`.
8. Do not push schema changes into lane-only state.
9. Validate with `npx vitest run src/raw`, then the broader suite to confirm shared layers were not broken.

## The Surfaces
- `src/raw/RawApp.jsx` and `src/raw/BlankNodeWorkspaceApp.jsx` are the entrypoints
- `src/raw/components/RawEditor.jsx` is the editor shell; `RawGraphSurface.jsx` is the canvas
- `src/raw/components/NodePalette.jsx` owns the node creation palette
- `src/raw/components/RawViewport.jsx` is the 3D viewport
- `src/raw/utils/localWorkspaceStorage.js` owns local workspace state
- `src/raw/utils/windowLayout.js` owns window layout; `src/raw/utils/rawGuide.js` owns help content
- `src/raw/styles/raw.css` owns the lane's styles
- `src/project/import/` is the shared import path — there is no lane-only importer

## Node Registry Pattern
- Node definitions live in `src/project/nodeRegistry.js` because they are shared across lanes
- `NODE_TYPES` is an OBJECT keyed by type id, not an array; `getNodeType(typeId)` looks one up and `listNodeTypes({ category, query, runtime })` filters
- A definition carries `id`, `label`, `category`, `runtime`, `inputs`, `outputs`, `defaultValues`, `render` — there is no `surface` field
- `singleton` is a vestigial always-false key. **Do not set it true**: no node type is a singleton anywhere, by owner decision 2026-07-19 (`docs/ai/known-fixes.md`) — do not re-add without asking
- Keep node definitions data-only and free from React dependencies

## Window Layout
- Layout state controls panel visibility and split behavior
- Changes to its shape belong in `src/raw/utils/windowLayout.js` (`DEFAULT_RAW_WORKSPACE_TOP` is the 64px top inset, passed to components as the `topInset` prop)
- The layout is stored locally, not persisted as a project document field

## Graduation Criteria: canvas to Studio
A pattern is ready to graduate when:
- it has no remaining placeholder branches or research flags
- it has test coverage
- it does not depend on lane-only hacks to function
- a decision was made that it should ship to all users in Studio

## Repo Anchors
- Node lane guide: ../../src/raw/AGENTS.md
- Shared project guide: ../../src/project/AGENTS.md
- Node registry: ../../src/project/nodeRegistry.js
- Studio lane: ../../src/studio/AGENTS.md

## Validation
- `npx vitest run src/raw`, then `npm run test`
- `npm run build`

## Completion Checks
- Change is in `src/raw` unless it was intentionally moved to a shared layer.
- No shared project sync logic was forked into the lane.
- Node definitions that may become shared are in `src/project/nodeRegistry.js`.
- Schema truth was not pushed into lane-only state.
