// Every Clip In of a picture network gets its footage playing on this page.
//
// The hookup, one line in useTopNetwork after the engine effect (so the ref is
// already filled when this hook's effects run):
//
//     useClipVideos(split.local, { spaceId, engine: engineRef, assets, projectId })
//
// `assets` (the project document's assets) and `projectId` are what turn an
// asset id picked in the inspector into its file; without them an id resolves
// against the space's own files (resolveClipUrl). A URL plays either way.
//
// Creates a clip video per top.clip node, updates it in place when its values
// change, disposes it when the node goes, and hands each to the engine with
// setVideo — again whenever the engine itself is replaced.

import { useEffect, useMemo, useRef } from 'react'
import { createClipVideo, resolveClipUrl } from './clipVideos.js'

const CLIP_TYPE = 'top.clip'

const engineOf = (engine) => (engine && typeof engine === 'object' && 'current' in engine ? engine.current : engine) || null

/** The Clip In nodes of a network ({nodes} or a node list), as [id, values]. */
export const clipNodesOf = (network) => {
    const nodes = Array.isArray(network) ? network : (network?.nodes || [])
    return nodes
        .filter((node) => node?.id && (node.type || node.typeId) === CLIP_TYPE)
        .map((node) => [node.id, node.values || {}])
}

/**
 * @param {{nodes}|Array} network   the engine's network, or its nodes
 * @param {object} options
 * @param {string} [options.spaceId]
 * @param {object|{current: object}} options.engine   a top engine, or a ref to one
 * @param {Array|Map} [options.assets]
 * @param {string} [options.projectId]
 * @param {(values, options) => {video, update, dispose}} [options.create]  for tests
 */
export function useClipVideos(network, { spaceId = '', engine = null, assets = null, projectId = null, create = createClipVideo } = {}) {
    const clipsRef = useRef(new Map())
    const engineSeen = useRef(null)
    const resolveRef = useRef(null)
    useEffect(() => {
        resolveRef.current = (asset) => resolveClipUrl(asset, spaceId, { assets, projectId })
    })

    // Values as a string, so a re-render with the same document does nothing.
    const clipsKey = useMemo(() => JSON.stringify(clipNodesOf(network)), [network])
    const resolveKey = `${spaceId}|${projectId || ''}|${assets instanceof Map ? [...assets.keys()].join(',') : (assets || []).map((asset) => `${asset?.id}:${asset?.url || ''}`).join(',')}`

    useEffect(() => {
        const clips = clipsRef.current
        const target = engineOf(engine)
        const wanted = new Map(JSON.parse(clipsKey))
        for (const [id, clip] of clips) {
            if (wanted.has(id)) continue
            target?.setVideo(id, null)
            clip.dispose()
            clips.delete(id)
        }
        for (const [id, values] of wanted) {
            const existing = clips.get(id)
            if (existing) {
                existing.update(values)
                continue
            }
            const clip = create(values, { resolveAssetUrl: (asset) => resolveRef.current(asset) })
            clips.set(id, clip)
            target?.setVideo(id, clip.video)
        }
    }, [clipsKey, resolveKey, engine, create])

    // The engine can be replaced (a new canvas, the last node removed and one
    // added back): the new one knows none of the videos.
    useEffect(() => {
        const target = engineOf(engine)
        if (target === engineSeen.current) return
        engineSeen.current = target
        if (!target) return
        for (const [id, clip] of clipsRef.current) target.setVideo(id, clip.video)
    })

    useEffect(() => () => {
        const target = engineOf(engine)
        for (const [id, clip] of clipsRef.current) {
            target?.setVideo(id, null)
            clip.dispose()
        }
        clipsRef.current.clear()
        engineSeen.current = null
    }, [engine])
}
