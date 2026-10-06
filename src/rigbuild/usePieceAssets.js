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
    // In-flight uploads by kind: placing several pieces at once calls this in
    // parallel, and the asset id is only known after fetch + upload, so without
    // this the same GLB is uploaded and upserted once per caller.
    const inflight = useRef(new Map())
    const ensureAsset = useCallback((kind) => {
        const have = assetIdFor(kind)
        if (have) return Promise.resolve(have)
        const pending = inflight.current.get(kind)
        if (pending) return pending
        const job = (async () => {
            const response = await fetch(PIECE_URLS[kind])
            if (!response.ok) throw new Error(`piece ${kind}: HTTP ${response.status}`)
            const blob = await response.blob()
            const asset = await uploadProjectAsset(projectId, new File([blob], pieceAssetName(kind), { type: 'model/gltf-binary' }))
            known.current[kind] = asset.id
            applyOps({ type: 'upsertAsset', payload: { asset: { ...asset, name: pieceAssetName(kind) } } })
            return asset.id
        })().finally(() => { inflight.current.delete(kind) })
        inflight.current.set(kind, job)
        return job
    }, [assetIdFor, projectId, applyOps])
    return { assetIdFor, ensureAsset }
}

export default usePieceAssets
