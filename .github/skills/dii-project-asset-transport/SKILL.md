---
name: dii-project-asset-transport
description: 'Work on asset upload, restore, media optimization, and project asset import. Use when changing the asset pipeline hook, shared media objects, server asset routes, project import paths, or media optimization preferences.'
argument-hint: 'Describe the asset upload, restore, or import change'
---

# dii Project Asset Transport

## When to Use
- You are changing how assets are uploaded to the server or stored locally.
- A bug involves asset restore, shared media objects, or upload progress.
- You are adding a new asset type or changing accepted mime types.
- You are working on project import that converts an archive or legacy format into a project document.
- Media optimization behavior or batch processing needs to change.

## Outcome
Make the smallest change that keeps the asset pipeline reliable: upload succeeds, restore falls back gracefully, and server and client stay in agreement about asset paths.

## Procedure
1. Start in src/hooks/useAssetPipeline.js for upload and shared media object logic.
2. Determine whether the change affects:
   - upload to server: check useAssetPipeline and serverXR/src upload routes
   - local asset store: check src/storage/assetStore.js
   - restore from remote: check src/hooks/useAssetRestore.js
   - project import: check src/project/import/
   - media optimization: check useAssetPipeline batch/manual flows
3. Check serverXR/src for corresponding upload route and asset streaming behavior when server-side changes are needed.
4. If the change adds a new asset type, confirm it is accepted in both the upload validation and the local asset type helpers.
5. Add or update a test that covers the happy path and the failure path.
6. Confirm upload errors do not create orphaned shared media objects.

## Asset Path Contract
- server assets are served under serverAssetBaseUrl + relative path
- local assets use IDB-backed assetStore keyed by a content-derived ID
- shared media objects link a server path to one or more scene object refs
- upsertRemoteAssetEntry is the canonical way to register a new server asset into the manifest

## Upload Flow
1. File is accepted and validated locally.
2. File is uploaded to serverXR via the upload route.
3. On success, a shared media object is created or updated.
4. The scene object references the shared media object ID.
5. On failure, the shared media object is not created and the scene is not modified.

## Restore Flow
1. Scene load detects asset refs that have no local blob.
2. Restore loop fetches from server URL candidates.
3. On success, the blob is saved to local assetStore.
4. On failure, the ref is preserved but the asset is shown as unavailable.

## Project Import Flow
- src/project/import/projectImportAssets.js handles asset extraction from archives
- src/project/import/importLegacyScene.js handles older scene format conversion
- imports produce a normalized project document plus an asset manifest
- after import, assets should be re-uploaded to the server if the project is being saved remotely

## Repo Anchors
- Asset pipeline: ../../src/hooks/useAssetPipeline.js
- Asset restore: ../../src/hooks/useAssetRestore.js
- Asset store: ../../src/storage/assetStore.js
- Project import: ../../src/project/import/
- Server upload routes: ../../serverXR/src/AGENTS.md
- Asset type helpers: ../../src/utils/mediaAssetTypes.js
- Useful tests:
  - ../../src/hooks/useAssetPipeline.test.jsx
  - ../../src/hooks/useAssetRestore.test.jsx
  - ../../src/project/import/projectImportAssets.test.js

## Validation
- npm run test
- npm run test:server-contracts when server upload routes changed
- npm run build

## Completion Checks
- Upload failure does not create orphaned shared media objects.
- Restore falls back correctly when a server asset is unavailable.
- New asset types are accepted in both upload validation and local helpers.
- Import produces a normalized document that loads correctly.
- Progress reporting is accurate and resets after completion.
