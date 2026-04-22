---
name: dii-media-content-creation
description: 'Work on media types, asset handling for creative content (images, video, audio, 3D models, fonts), and the scene authoring workflow as a content creator. Use when adding media to a scene, optimizing assets for the platform, building workflows for multimedia artists, or debugging media playback and asset display in the editor.'
argument-hint: 'Describe the media type, asset workflow, or content creation issue'
---

# dii Media Content Creation

## When to Use
- A multimedia artist needs to add images, video, audio, 3D models, or fonts to a scene.
- Media playback or display is broken in the editor or the public viewer.
- An asset format is not being accepted, optimized, or served correctly.
- You are building or improving the upload UX for creative content workflows.
- Media variants or alternate sources for a scene object need to change.

## Outcome
Make media reliably uploadable, displayable, and playable across the editor, XR view, and public presentation surface.

## Supported Media Types
- Images: common web formats (jpg, png, webp, gif, svg) used as image planes in the scene
- Video: mp4, webm as video texture or billboard surface with play/pause/loop control
- Audio: mp3, ogg, wav as positional or ambient audio objects in the scene
- 3D Models: glTF (.gltf/.glb) as ModelObjects in the scene
- Fonts: loaded via Text3DObject for extruded 3D text rendering

## Upload Workflow (Creator Perspective)
1. Open the Asset Panel in the editor.
2. Drag or select files to upload.
3. Files are validated, uploaded to serverXR, and registered as shared media objects.
4. The media object appears in the asset panel and can be dragged into the scene.
5. Dragging to the scene creates a new object with the asset ref set.
6. The asset is cached locally for offline editing.

## Upload Workflow (Code Path)
- src/hooks/useAssetPipeline.js handles upload, validation, shared media object creation
- src/AssetPanel.jsx and src/MediaPanel.jsx own the panel UI for media management
- src/objectComponents/ renders the media in the scene
- media optimization can be triggered before upload for large files

## Media Variants
- a single scene object can have multiple media sources (variants)
- variants allow language/quality/version alternates for the same object
- InspectorMediaVariants.jsx owns the variant editing UI

## Video in the Scene
- VideoObject renders a video texture on a plane
- play/pause/loop are scene-level properties stored in the object state
- autoplay is gated by browser policy and requires a user gesture or muted start
- VideoObject.test.jsx covers the core playback control behavior

## Audio in the Scene
- AudioObject renders a positional audio source
- volume, loop, and spatial parameters are stored as object properties
- audio plays only when the scene is in playback mode, not in edit mode

## 3D Models
- ModelObject loads glTF/glb via Three.js GLTFLoader
- models must be valid glTF 2.0 with embedded or relative textures
- large models should be optimized before upload (Draco compression, texture atlasing)
- the asset ref is resolved through assetSources at render time

## Fonts for 3D Text
- Text3DObject uses typeface.js format fonts
- fonts are loaded from the /public/fonts/ directory
- adding a new font requires placing the typeface.js file in public/fonts/ and registering it in the text object config

## Repo Anchors
- Asset panel: ../../src/AssetPanel.jsx
- Media panel: ../../src/MediaPanel.jsx
- Asset pipeline hook: ../../src/hooks/useAssetPipeline.js
- Object components: ../../src/objectComponents/
- Media asset types: ../../src/utils/mediaAssetTypes.js
- Media inspector: ../../src/components/inspector/InspectorMediaSection.jsx
- Media variants: ../../src/components/inspector/InspectorMediaVariants.jsx
- Font assets: ../../public/fonts/
- Useful tests:
  - ../../src/hooks/useAssetPipeline.test.jsx
  - ../../src/objectComponents/VideoObject.test.jsx

## Validation
- npm run test
- npm run build

## Completion Checks
- New media type is registered in mediaAssetTypes.js.
- Upload failure does not create orphaned objects in the scene or the asset manifest.
- Media renders correctly in both the editor and the public presentation viewer.
- VideoObject autoplay behavior respects browser policy.
- 3D models resolve textures correctly through the asset ref system.
