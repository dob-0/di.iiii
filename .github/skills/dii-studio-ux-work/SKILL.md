---
name: dii-studio-ux-work
description: 'Build or fix the Studio editor lane UI. Use when changing StudioShell, StudioHub, StudioEditor, StudioInspector, StudioViewport, StudioPresentationSurface, Studio routing, or Studio-only layout preferences.'
argument-hint: 'Describe the Studio UI or shell change'
---

# dii Studio UX Work

## When to Use
- You are adding or fixing a UI behavior in the shipped Studio editor.
- A bug exists in the Studio shell, hub, editor panels, inspector, or viewport.
- Studio routing needs to change between hub and project editor.
- Studio-only layout preferences need to be added or adjusted.
- A presentation surface or Studio-specific overlay behavior needs to change.

## Outcome
Make the smallest Studio-only change that advances the shipped product without pulling shared logic into a lane-specific shell.

## Procedure
1. Start in src/studio/AGENTS.md to confirm the change is Studio-specific.
2. Decide which Studio surface owns the behavior:
   - StudioShell: overall shell frame, panel layout, keyboard coordination
   - StudioHub: project listing, creation, delete, publish management
   - StudioEditor: editor scene, viewport, inspector composition
   - StudioInspector: selected node or object property editing
   - StudioViewport: three.js canvas, gizmo, and camera controls composition
   - StudioPresentationSurface: presentation overlay and iframe embedding
3. If the behavior should also work in Beta or the public viewer, move it down into src/project instead.
4. Use studioRouting.js for route path helpers and route decisions.
5. Use useStudioLayoutPrefs for layout preference persistence.
6. When Studio composes older shared hooks or components from src/hooks and src/components, prefer the shared version rather than forking it.
7. Write or update a focused test before touching adjacent surfaces.

## Studio Component Map
- StudioShell: main layout frame and panel coordination
- StudioHub: space and project management entry screen
- StudioEditor: full authoring view, composes viewport and inspector
- StudioInspector: property panel for selected objects and nodes
- StudioViewport: three.js render surface, controls, gizmos
- StudioPresentationSurface: presentation overlay, iframe embed, view controls
- src/studio/hooks/useStudioLayoutPrefs.js: persisted panel layout preferences
- src/studio/utils/studioRouting.js: route path builders for Studio surfaces

## Decision Checklist Before Editing
- Is this Studio-specific UX or should Beta or the viewer benefit too?
- Does this change shared sync, project state, or schema? If so, move to src/project or src/shared.
- Is this behavior already in a shared hook or component? Use the shared version.
- Is this a large orchestration change to StudioShell? Consider extracting by concern rather than adding another branch.

## Hotspot Awareness
- StudioShell.jsx is a known large orchestration file. Prefer extraction over addition when it grows.
- When the inspector grows, prefer new sub-components over widening the root inspector file.

## Repo Anchors
- Studio guide: ../../src/studio/AGENTS.md
- Shared project guide: ../../src/project/AGENTS.md
- Shared schema: ../../src/shared/AGENTS.md
- Architecture hotspots: ../../docs/roadmaps/PROJECT_DEVELOPMENT_FRAMEWORK.md
- Useful tests:
  - ../../src/studio/components/StudioHub.test.jsx
  - ../../src/studio/components/StudioPresentationSurface.test.jsx
  - ../../src/studio/hooks/useStudioLayoutPrefs.test.js
  - ../../src/studio/utils/studioRouting.test.js

## Validation
- npm run test
- npm run build

## Completion Checks
- Change is in src/studio, not duplicated into shared layers.
- Shared sync, schema, or viewer logic was not pulled into Studio.
- Hotspot files grew by extraction rather than addition when touched.
- Tests cover the changed Studio surface.
