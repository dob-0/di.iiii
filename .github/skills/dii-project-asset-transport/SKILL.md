---
name: dii-project-asset-transport
description: 'Work on asset upload, restore, media optimization, and project import/export. Use when changing the asset pipeline hook, remote asset manifest entries, server asset routes, project bundle or legacy-scene import paths, or media optimization preferences.'
argument-hint: 'Describe the asset upload, restore, or import change'
---

# dii Project Asset Transport

## When to Use
- You are changing how assets are uploaded to the server or stored locally.
- A bug involves asset restore, the remote asset manifest, or upload progress.
- You are adding a new asset type or changing accepted mime types.
- You are working on project import/export — the `.studio.zip` bundle or the legacy scene archive.
- Media optimization behavior or batch processing needs to change.

## Outcome
Make the smallest change that keeps the asset pipeline reliable: upload succeeds, restore falls back gracefully, and server and client stay in agreement about asset paths.

## Procedure
1. Start in `src/hooks/useAssetPipeline.js` — upload, ingest, and media-optimization logic all live there.
2. Determine whether the change affects:
   - upload to server: `useAssetPipeline.js` (`uploadAssetToServer`, `ingestAssetFile`) plus `src/services/serverSpaces.js` and the serverXR space routes
   - local asset store: `src/storage/assetStore.js`
   - restore from remote: `src/hooks/useAssetRestore.js` and `src/services/assetSources.js`
   - project import/export: `src/project/transfer/studioProjectBundle.js` (current `.studio.zip` bundle) or `src/project/import/importLegacyScene.js` (older scene archives)
   - media optimization: `useAssetPipeline.js` batch/manual flows
3. Check `serverXR/src/routes/spaceRoutes.js` for the corresponding upload/Drive-import route and asset streaming behavior when server-side changes are needed.
4. If the change adds a new asset type, confirm it is accepted in `getFileTypeForObject` (upload validation), in `src/utils/modelFormats.js` for model formats, and in `src/utils/mediaAssetTypes.js`.
5. Add or update a test that covers the happy path and the failure path.
6. Confirm an upload error still throws rather than returning `null` — see the comment in `uploadAssetToServer`, where a silent `null` once let a whole failed asset sync report "Scene synced to server."

## Asset Path Contract
- server assets resolve against `serverAssetBaseUrl` + the asset id; an absolute `url` in the response wins over the derived one
- local assets use the IDB-backed `assetStore` keyed by asset id (the server's id is reused locally after a successful upload, so one id addresses both copies)
- `upsertRemoteAssetEntry` (from `useAssetRestore`) is the canonical way to register a new server asset into the remote manifest; it also calls `setAssetSource` so the asset resolves immediately
- scene objects carry `assetRef`, and video/audio objects additionally carry `mediaVariants.original` / `mediaVariants.optimized` with `selectedVariant`

## Upload Flow
1. `handleAssetFilesUpload` classifies each file (image / video / audio / model) and rejects unsupported ones.
2. `ingestAssetFile` uploads to serverXR first when `canUploadServerAssets` is set, then saves the blob locally under the server's asset id. With no server, it saves locally only.
3. On success, `upsertRemoteAssetEntry` adds the entry to the remote manifest and the scene object is added with its `assetRef`.
4. On failure, `uploadAssetToServer` throws; `handleAddAssetObject` never reaches `handleAddObject`, so no local asset record and no scene object are created.
5. Assets can also arrive from Google Drive via `importAssetsFromDrive` / `importDriveFilesFromAccount`, which funnel through `absorbImportedAssets` into the same manifest.

## Restore Flow
1. `setRemoteAssetsManifest` registers the manifest and base URL with `assetSources`.
2. `restoreAssetsFromPayload` hydrates each asset (3 in parallel) from an inline `dataUrl`, a supplied `blobLoader`, or a fetch of `item.url`.
3. On success, the blob is saved to the local `assetStore`.
4. If local storage is full, the asset falls back to an in-memory data-URL source instead of being cached — the scene still renders, and the user is alerted once.
5. A single asset failing does not abort the batch; that ref simply has no source and its object renders empty.
6. Two guards exist because they were each a silent-corruption bug: an HTML-like content type is rejected (nginx's SPA fallback answers 200 `text/html` for a stored `/api/…` url), and content-addressed ids are allowed to use the HTTP cache while others are fetched `no-store`.

## Project Import / Export Flow
- `src/project/transfer/studioProjectBundle.js` is the current bundle format (`dii-studio-project` v1, a zip holding `project.json` plus `assets/<id>/<name>`):
  - `createStudioProjectBundle(document, { loadAsset, onProgress })` downloads every asset and packs it
  - `readStudioProjectBundle(file)` returns `{ document, assetFiles }`; a non-zip file is read as raw project JSON
  - both are driven from `src/studio/components/StudioEditor.jsx`
- `src/project/import/importLegacyScene.js` converts older scene archives; `importLegacySceneFile(file)` returns `{ document, assetFiles, warnings }` and is driven from `StudioHub.jsx` and `RawHub.jsx`
- both paths produce a normalized project document (via `src/shared/projectSchema.js`) plus a `Map` of asset id → `File`
- after import, the caller re-uploads those files through the asset pipeline if the project is saved remotely
- export fetches first-party asset URLs with credentials and third-party ones without (`isFirstPartyAssetUrl`) — do not relax that

## Repo Anchors
Anchor paths resolve from this file's directory. They were `../../` until 2026-08-11, which pointed at `.github/` and resolved to nothing; all 15 skills were corrected to `../../../` and every anchor was checked to exist.
- Asset pipeline: ../../../src/hooks/useAssetPipeline.js
- Asset restore: ../../../src/hooks/useAssetRestore.js
- Asset store: ../../../src/storage/assetStore.js
- Asset source resolution: ../../../src/services/assetSources.js
- Server upload client: ../../../src/services/serverSpaces.js
- Project bundle (export/import): ../../../src/project/transfer/studioProjectBundle.js
- Legacy scene import: ../../../src/project/import/importLegacyScene.js
- Server space/asset routes: ../../../serverXR/src/routes/spaceRoutes.js and ../../../serverXR/src/AGENTS.md
- Asset type helpers: ../../../src/utils/mediaAssetTypes.js and ../../../src/utils/modelFormats.js
- Useful tests:
  - ../../../src/hooks/useAssetPipeline.test.jsx
  - ../../../src/hooks/useAssetPipeline.test.js
  - ../../../src/hooks/useAssetRestore.test.jsx
  - ../../../src/project/transfer/studioProjectBundle.test.js
  - ../../../serverXR/src/routes/spaceRoutes.sceneAssetCache.test.js

## Validation
- npm run test
- npm run test:server-contracts when server upload routes changed
- npm run build

## Completion Checks
- A failed upload throws and leaves no local asset record and no scene object.
- Restore falls back correctly when a server asset is unavailable or local storage is full.
- New asset types are accepted in both upload validation and the local type helpers.
- Import produces a normalized document plus its asset files, and the document loads correctly.
- Progress reporting is accurate and resets after completion.
