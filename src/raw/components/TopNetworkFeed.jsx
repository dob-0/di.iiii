import { useCallback, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { toTopNetwork, useTopNetwork } from '../../project/tops/useTopNetwork.js'

// Runs the project's picture operators while the editor is open: feeds every
// card its picture and publishes Analyze's numbers into liveOutputs, where any
// number node can read them. Invisible, like the other feeds in LiveFeeds —
// the pictures are on the cards, not here.
//
// Pictures cross to the rest of the graph both ways:
// - IN: a Webcam's or a Video's Frame wired into an operator's A/B is read
//   straight off its texture's element (liveOutputs `${id}:frame`).
// - OUT: an operator whose Picture is wired to a Monitor, a Plane's texture or
//   an Image gets a THREE.CanvasTexture over a small canvas the runner redraws
//   every few frames, published as `${id}:out` — the same kind of value a
//   Webcam's Frame is, so every texture consumer already knows it.
//
// A number is only re-published when it moved: every publish re-renders the
// whole editor, and a still room would otherwise do that ten times a second.
const MOVED = 0.004

// A Clip In (and every clip a VJ deck plays) finds its footage among the
// PROJECT's files — `assets` and `projectId`, the same ones a Video node reads.
export default function TopNetworkFeed({ document, spaceId = '', projectId = null, liveOutputs = null, cameras = true, onLiveOutputChange }) {
    const network = useMemo(() => toTopNetwork(document), [document])
    const published = useRef(new Map())
    const onMeasure = useCallback((nodeId, numbers) => {
        for (const [portId, value] of Object.entries(numbers)) {
            const key = `${nodeId}:${portId}`
            const before = published.current.get(key)
            if (before !== undefined && Math.abs(before - value) < MOVED) continue
            published.current.set(key, value)
            onLiveOutputChange(nodeId, portId, value)
        }
    }, [onLiveOutputChange])

    const liveRef = useRef(liveOutputs)
    useEffect(() => { liveRef.current = liveOutputs })
    const feedMedia = useCallback((nodeId, portId) => {
        const value = liveRef.current?.get?.(`${nodeId}:${portId}`)
        return value?.image || null
    }, [])

    const textures = useRef(new Map())
    const onPicture = useCallback((nodeId, canvas) => {
        const before = textures.current.get(nodeId)
        if (before) {
            before.dispose()
            textures.current.delete(nodeId)
        }
        if (!canvas) {
            onLiveOutputChange(nodeId, 'out', null)
            return
        }
        const texture = new THREE.CanvasTexture(canvas)
        texture.colorSpace = THREE.SRGBColorSpace
        texture.minFilter = THREE.LinearFilter
        texture.magFilter = THREE.LinearFilter
        textures.current.set(nodeId, texture)
        onLiveOutputChange(nodeId, 'out', texture)
    }, [onLiveOutputChange])
    // Redrawn canvases re-upload on the room's next frame; no editor re-render.
    const onPicturesDrawn = useCallback((nodeIds) => {
        for (const nodeId of nodeIds) {
            const texture = textures.current.get(nodeId)
            if (texture) texture.needsUpdate = true
        }
    }, [])

    useTopNetwork({
        network, spaceId, thumbnails: true, onMeasure, feedMedia, onPicture, onPicturesDrawn, cameras,
        assets: document?.assets || null,
        projectId: projectId || document?.projectMeta?.id || null
    })
    return null
}
