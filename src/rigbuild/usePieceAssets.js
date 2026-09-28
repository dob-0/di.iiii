import { useCallback, useRef } from 'react'
import { uploadProjectAsset } from '../project/services/projectsApi.js'
import truss1Url from '../../scripts/rigbuild/pieces/truss-1m.glb?url'
import truss2Url from '../../scripts/rigbuild/pieces/truss-2m.glb?url'
import truss3Url from '../../scripts/rigbuild/pieces/truss-3m.glb?url'
import towerUrl from '../../scripts/rigbuild/pieces/tower.glb?url'
import deckUrl from '../../scripts/rigbuild/pieces/deck-2x1.glb?url'

// A piece's body — the catalogue GLB (scripts/rigbuild/pieces-glb.mjs) — uploaded
// once per project as `rigbuild-<kind>.glb` and found again by that name, so every
// view that builds (the plot, the room in first person) shares the same asset.
// docs/architecture/RIG_BUILD.md §10.4.

export const PIECE_URLS = { 'truss-1m': truss1Url, 'truss-2m': truss2Url, 'truss-3m': truss3Url, tower: towerUrl, 'deck-2x1': deckUrl }

export const pieceAssetName = (kind) => `rigbuild-${kind}.glb`

export function usePieceAssets({ projectId, document, applyOps }) {
    const known = useRef({})
    const assetIdFor = useCallback((kind) => known.current[kind]
        || (document?.assets || []).find((a) => a.name === pieceAssetName(kind))?.id
        || null, [document?.assets])
    const ensureAsset = useCallback(async (kind) => {
        const have = assetIdFor(kind)
        if (have) return have
        const blob = await (await fetch(PIECE_URLS[kind])).blob()
        const asset = await uploadProjectAsset(projectId, new File([blob], pieceAssetName(kind), { type: 'model/gltf-binary' }))
        known.current[kind] = asset.id
        applyOps({ type: 'upsertAsset', payload: { asset: { ...asset, name: pieceAssetName(kind) } } })
        return asset.id
    }, [assetIdFor, projectId, applyOps])
    return { assetIdFor, ensureAsset }
}

export default usePieceAssets
