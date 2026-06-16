---
name: dii-xr-scene-authoring
description: 'Add or fix 3D/XR object components, scene canvas behavior, camera controls, gizmos, and XR-specific render paths. Use when working on object types (model, image, video, audio, text, geometry), scene initialization, Three.js/R3F integration, or the XR entry point.'
argument-hint: 'Describe the 3D object, scene, or XR behavior to build or fix'
---

# dii XR Scene Authoring

## When to Use
- You are adding a new 3D object type or fixing behavior in an existing one (model, image, video, audio, text, geometry).
- A bug exists in the scene canvas, camera controls, gizmos, or selection behavior.
- The XR (WebXR) render path needs a change.
- Scene initialization or scene base setup is broken.
- A transform, material, or media variant behavior needs to change.

## Outcome
Make the smallest, correct change to the 3D layer that keeps the scene deterministic and XR-compatible, without coupling object logic to editor shell state.

## Object Component Map
- src/objectComponents/ owns all object type implementations
  - BoxObject, SphereObject, CylinderObject, ConeObject — primitive geometry
  - ImageObject — image plane with texture and aspect handling
  - VideoObject — video texture with play/pause/loop controls
  - AudioObject — positional audio with Three.js PositionalAudioHelper
  - ModelObject — glTF/glb model loader with asset ref resolution
  - Text2DObject — flat billboard text
  - Text3DObject — extruded 3D text with font loading
  - ObjectMap — registry mapping scene object type strings to components
- src/xr/ owns the XR-specific scene and experience entry points
  - ExperienceXr.jsx — XR session wrapper and controller bindings
  - SceneContentXr.jsx — XR-specific scene content layout
- src/components/SceneCanvas.jsx — the main R3F canvas
- src/components/SceneBase.jsx — shared scene graph structure
- src/components/CustomOrbitControls.jsx — orbit camera with constraint config
- src/components/inspector/ — transform, media, and per-type property panels

## Procedure
1. Identify which object component owns the behavior.
2. Check whether the change is object-specific or shared across all objects.
3. Object-specific: edit the corresponding file in src/objectComponents/.
4. Shared scene behavior: edit SceneBase or SceneCanvas, not individual object files.
5. XR-specific behavior: edit src/xr/ files, not the desktop render path.
6. Inspector properties: edit the matching section in src/components/inspector/.
7. Confirm new object types are registered in ObjectMap.js.
8. Confirm asset-dependent objects resolve refs through the shared asset source helpers, not by constructing paths manually.

## Asset Ref Resolution Pattern
- scene objects reference assets by an asset ID, not by a URL
- use the assetSources helpers to resolve an ID to a URL for rendering
- do not hardcode /serverXR/ paths inside object components
- for new media types, confirm the mime type is registered in src/utils/mediaAssetTypes.js

## XR Considerations
- the XR path uses the same object components as desktop
- XR-specific layout changes belong in src/xr/
- do not add desktop-only gizmo or overlay behavior inside SceneContentXr
- test XR entry via the ExperienceXr wrapper when changing session startup

## Inspector Panel Pattern
- each property section is a separate component in src/components/inspector/
- add new property sections there, not inside individual object components
- InspectorTransformSection owns position, rotation, scale
- InspectorMediaSection owns asset selection and media source
- InspectorBasics owns name, visibility, and shared flags

## Repo Anchors
- Object components: ../../src/objectComponents/
- XR entry: ../../src/xr/
- Scene canvas: ../../src/components/SceneCanvas.jsx
- Inspector panels: ../../src/components/inspector/
- Asset source helpers: ../../src/services/assetSources.js
- Media asset types: ../../src/utils/mediaAssetTypes.js

## Validation
- npm run test
- npm run build

## Completion Checks
- New object type is in ObjectMap.js.
- Asset refs are resolved through assetSources, not hardcoded paths.
- XR-specific behavior is in src/xr/, not mixed into desktop canvas.
- Inspector properties are in src/components/inspector/, not inlined into the object component.
- Tests cover the changed component.
