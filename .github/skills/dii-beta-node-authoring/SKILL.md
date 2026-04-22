---
name: dii-beta-node-authoring
description: 'Build or debug the Beta experimental editor lane. Use when working on node-first authoring, the node palette, Beta workspace layout, Beta project state, Beta routing, or experimental canvas interactions that should not yet ship in Studio.'
argument-hint: 'Describe the Beta node or editor feature'
---

# dii Beta Node Authoring

## When to Use
- You are adding an experimental node type, palette behavior, or canvas interaction to Beta.
- A bug exists in the Beta hub, editor, workspace layout, or local project store.
- You are deciding whether a new behavior belongs in Beta or is already ready for Studio.
- You need to understand the Beta project store and how it interacts with shared project sync.

## Outcome
Make the smallest experimental change that advances node-first thinking without forking shared logic from src/project.

## Key Principle
Beta is the proving ground, not the main shipped surface. Work here is disposable research by design. When a Beta pattern is stable enough for shipping, move it to Studio or src/project before promoting it.

## Procedure
1. Start in src/beta/AGENTS.md to confirm the behavior is intentionally experimental.
2. Check whether the shared layer in src/project already owns the behavior you need.
3. If shared ownership is needed, prefer src/project over forking the logic in Beta.
4. If the behavior is genuinely experimental, add it in src/beta.
5. Use the Beta project store for local project state.
6. Use the node registry in src/project/nodeRegistry.js for node type definitions that may eventually become shared.
7. Keep Beta canvas interactions in src/beta/hooks and components.
8. Do not push schema changes directly into Beta-only state.
9. Validate with the Beta test suite, then run the broader test suite to confirm shared layers were not broken.

## Beta-Specific Surfaces
- src/beta/BetaApp.jsx and BlankNodeWorkspaceApp.jsx are the Beta entrypoints
- src/beta/components/NodePalette.jsx owns the node creation palette
- src/beta/state/ owns local Beta project store
- src/beta/hooks/ owns Beta sync hooks built on shared project sync
- src/beta/utils/ owns Beta routing, window layout, and local workspace storage
- src/beta/import/ is the Beta import path

## Node Registry Pattern
- Node definitions live in src/project/nodeRegistry.js because they are shared across lanes
- Use filterNodeDefinitions and getNodeDefinition from the registry
- Define new node types with id, label, surface, family, and defaultParams
- Keep node definitions data-only and free from React dependencies

## Beta Workspace Layout
- windowLayout state controls panel visibility and split behavior
- changes to windowLayout shape belong in src/beta/utils/windowLayout.js
- the layout is stored locally, not persisted as a project document field

## Graduation Criteria: Beta to Studio
A Beta pattern is ready to graduate when:
- it has no remaining placeholder branches or research flags
- it has test coverage
- it does not depend on Beta-only hacks to function
- a decision was made that it should ship to all users in Studio

## Repo Anchors
- Beta guide: ../../src/beta/AGENTS.md
- Shared project guide: ../../src/project/AGENTS.md
- Node registry: ../../src/project/nodeRegistry.js
- Studio lane: ../../src/studio/AGENTS.md

## Validation
- npm run test (including Beta-specific tests)
- npm run build

## Completion Checks
- Change is in src/beta unless it was intentionally moved to a shared layer.
- No shared project sync logic was forked into Beta.
- Node definitions that may become shared are in src/project/nodeRegistry.js.
- Schema truth was not pushed into Beta-only state.
