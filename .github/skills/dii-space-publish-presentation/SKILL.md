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
1. Editor (Studio or Raw) calls the serverXR PATCH /api/spaces/:spaceId endpoint with `publishedProjectId`.
2. serverXR validates the caller has write permission (requireSpaceOwnerOrAdminWrite) and that the project exists in this space — a project from another space is rejected 404, not 403.
3. On success, the space record is updated and the live pointer changes immediately.
4. The public `/<space>` route reads this live pointer on next load.
5. Active sessions may receive the update via SSE or Socket.IO presence events.

## Unpublish / Delete Flow
1. Deleting a published project must never leave the live pointer aimed at a deleted project.
2. Studio (StudioHub, StudioProjectsPanel) deletes first, then clears the pointer if the deleted project was live — deliberate, so a failed delete cannot silently unpublish a space that still has its project.
3. RawHub still clears the pointer first, then deletes.
4. When a delete succeeds but clearing the pointer fails, surface it — do not report the delete as clean.

## Viewer And Presentation Surfaces
- src/project/components/PublicProjectViewer.jsx is what `/<space>` renders when a live pointer exists; it composes PublicProjectSceneSurface.jsx for the scene
- the same viewer serves the direct project link `/<space>/p/:projectId` — any project of the space, not only the published one
- viewer surfaces are read-only and chrome-free: no gizmos, no selection, no editor controls, no project switcher on public faces (owner call 2026-08-07)
- src/studio/components/StudioPresentationSurface.jsx is Studio's in-editor presentation overlay; it composes StudioViewport plus buildPresentationPreviewDocument and a sandboxed iframe for code pages — it does not use PresentationCanvas
- src/components/PresentationCanvas.jsx is the V1 editor's canvas (used by src/components/EditorLayout.jsx), not the published-project path

## Client Route Ownership
- src/SpaceSurfaceApp.jsx: gate that decides viewer vs. legacy V1 fallback
- src/project/: shared viewer and project document loading
- src/studio/components/StudioPresentationSurface.jsx: Studio's in-editor presentation overlay
- src/studio/components/StudioHub.jsx and StudioProjectsPanel.jsx: where publish, unpublish, and delete actions live in the Studio UI
- src/raw/components/RawHub.jsx: the same actions in Raw

## serverXR Ownership
- serverXR is authoritative for publish state
- client cannot set publishedProjectId without going through the PATCH /api/spaces/:id route
- the server rejects publishing a project that belongs to a different space (ownership check)
- read-only space routes are not blocked by auth, but write routes require valid session

## Repo Anchors
- Space surface gate: ../../src/SpaceSurfaceApp.jsx
- Public viewer: ../../src/project/components/PublicProjectViewer.jsx
- Studio hub (publish UI): ../../src/studio/components/StudioHub.jsx
- Studio presentation: ../../src/studio/components/StudioPresentationSurface.jsx
- serverXR space routes: ../../serverXR/src/routes/spaceRoutes.js and ../../serverXR/src/AGENTS.md
- Surface map: ../../docs/architecture/PROJECT_SURFACES.md
- Useful tests:
  - ../../src/studio/components/StudioHub.test.jsx
  - ../../src/studio/components/StudioPresentationSurface.test.jsx
  - ../../src/SpaceSurfaceApp.test.jsx
  - ../../src/project/components/PublicProjectViewer.test.jsx

## Validation
- npm run test
- npm run test:server-contracts (when server publish routes changed)
- npm run build

## Completion Checks
- Deleting a live project leaves no dangling live pointer, and a failed pointer clear is reported.
- Publish is enforced through the serverXR PATCH route, not client-side state alone.
- The public viewer remains read-only (no gizmos, selection, or editor tools).
- Server rejects cross-space publish attempts.
- Public viewer route renders the correct scene when a live pointer exists.
