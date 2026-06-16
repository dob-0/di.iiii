---
name: dii-space-publish-presentation
description: 'Work on space publishing, live project pointers, presentation canvas, and the public space viewer. Use when changing how projects are published to a space, how the live pointer works, how the public viewer loads a published scene, or how the presentation surface behaves.'
argument-hint: 'Describe the publish, live pointer, or presentation change'
---

# dii Space Publish and Presentation

## When to Use
- You are changing how a project is published as the live experience for a space.
- A bug involves the live pointer, the public space viewer route, or publish state.
- The presentation canvas or PresentationSurface overlay behavior needs to change.
- The StudioPresentationSurface or the public `/<space>` viewer route needs work.
- You need to understand who owns publish authority (answer: serverXR).

## Outcome
Make the smallest change that keeps publish state correct, the live pointer durable, and the public viewer reliably rendering the right scene.

## Core Concepts
- each space has an optional `publishedProjectId` live pointer stored in serverXR
- when a space has a live pointer, `/<space>` shows the published scene as a pure viewer
- when a space has no live pointer, `/<space>` falls back to the legacy V1 editor
- publishing is a privileged write: only editor credentials for the correct space can set it
- unpublishing / changing the live pointer should clear stale presentation state on the client

## Publish Flow
1. Editor (Studio or Beta) calls the serverXR PATCH /api/spaces/:id endpoint with `publishedProjectId`.
2. serverXR validates the project belongs to the space and the caller has write permission.
3. On success, the space record is updated and the live pointer changes immediately.
4. The public `/<space>` route reads this live pointer on next load.
5. Active sessions may receive the update via SSE or Socket.IO presence events.

## Unpublish / Delete Flow
1. Before deleting a published project, the live pointer must be cleared first.
2. Studio enforces this in StudioHub — clear live pointer, then delete.
3. Skipping this leaves a dangling live pointer pointing to a deleted project.

## Presentation Canvas
- src/components/PresentationCanvas.jsx owns the viewer-mode canvas
- it is read-only: no gizmos, no selection, no editor controls
- it loads a scene from a project document and renders it
- src/studio/components/StudioPresentationSurface.jsx wraps it for Studio's presentation overlay
- the public `/<space>` route uses SpaceSurfaceApp which composes PresentationCanvas when a live pointer exists

## Client Route Ownership
- src/SpaceSurfaceApp.jsx: gate that decides viewer vs. legacy fallback
- src/project/: shared viewer and project document loading
- src/studio/components/StudioPresentationSurface.jsx: Studio's in-editor presentation overlay
- src/studio/components/StudioHub.jsx: where publish and unpublish actions live in the Studio UI

## serverXR Ownership
- serverXR is authoritative for publish state
- client cannot set publishedProjectId without going through the PATCH /api/spaces/:id route
- the server rejects publishing a project that belongs to a different space (ownership check)
- read-only space routes are not blocked by auth, but write routes require valid session

## Repo Anchors
- Space surface gate: ../../src/SpaceSurfaceApp.jsx
- Presentation canvas: ../../src/components/PresentationCanvas.jsx
- Studio hub (publish UI): ../../src/studio/components/StudioHub.jsx
- Studio presentation: ../../src/studio/components/StudioPresentationSurface.jsx
- serverXR space routes: ../../serverXR/src/AGENTS.md
- Surface map: ../../docs/architecture/PROJECT_SURFACES.md
- Useful tests:
  - ../../src/studio/components/StudioHub.test.jsx
  - ../../src/studio/components/StudioPresentationSurface.test.jsx
  - ../../src/SpaceSurfaceApp.test.jsx
  - ../../src/components/PresentationCanvas.test.jsx

## Validation
- npm run test
- npm run test:server-contracts (when server publish routes changed)
- npm run build

## Completion Checks
- Unpublish clears the live pointer before any delete operation.
- Publish is enforced through the serverXR PATCH route, not client-side state alone.
- PresentationCanvas remains read-only (no gizmos, selection, or editor tools).
- Server rejects cross-space publish attempts.
- Public viewer route renders the correct scene when a live pointer exists.
