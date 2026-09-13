import { useEffect, useMemo, useRef, useState } from 'react'
import { createTopEngine } from './topEngine.js'
import { TOP_OPERATORS, isTopType } from './topOperators.js'
import { topThumbnailTargets } from './topThumbnails.js'

// The picture operators of a project document, as the engine reads them.
// Only wires from a Picture output into a picture input count; a number wired
// into an operator is the rest of the graph's business.
export const toTopNetwork = (document) => {
    const nodes = (document?.nodes || [])
        .filter((node) => isTopType(node.typeId))
        .map((node) => ({ id: node.id, type: node.typeId, values: node.values || {} }))
    const ids = new Set(nodes.map((node) => node.id))
    const wires = (document?.edges || [])
        .filter((edge) => ids.has(edge.fromNodeId) && ids.has(edge.toNodeId) && edge.fromPort === 'out' && ['a', 'b'].includes(edge.toPort))
        .map((edge) => ({ from: edge.fromNodeId, to: edge.toNodeId, port: edge.toPort }))
    return { nodes, wires }
}

const THUMBNAIL_EVERY = 3

/**
 * Run a picture network on this page.
 *
 * @param {object} options
 * @param {{nodes, wires}} options.network   from toTopNetwork
 * @param {HTMLCanvasElement|null} [options.canvas]  draw the `show` operator here; omitted, the engine draws offscreen
 * @param {string|null} [options.show]        node id whose picture the canvas shows (a Picture Out)
 * @param {boolean} [options.thumbnails]      feed the cards' pictures
 * @param {(nodeId, numbers) => void} [options.onMeasure]
 * @returns {{ error: string }}
 */
export function useTopNetwork({ network, canvas = null, show = null, thumbnails = false, onMeasure = null, width = 640, height = 360 }) {
    const [error, setError] = useState('')
    const engineRef = useRef(null)
    const onMeasureRef = useRef(onMeasure)
    const showRef = useRef(show)
    // Read every frame by the loop below, so they follow the latest props
    // without restarting the engine.
    useEffect(() => {
        onMeasureRef.current = onMeasure
        showRef.current = show
    })

    const hasNodes = network.nodes.length > 0
    const cameraIds = useMemo(
        () => network.nodes.filter((node) => TOP_OPERATORS[node.type].source === 'camera').map((node) => node.id).join(','),
        [network]
    )

    // The engine lives as long as there is anything to run.
    useEffect(() => {
        if (!hasNodes) return undefined
        const target = canvas || globalThis.document?.createElement('canvas')
        if (!target) return undefined
        if (!canvas) { target.width = width; target.height = height }
        let engine
        try {
            engine = createTopEngine({ canvas: target, width, height, onMeasure: (id, numbers) => onMeasureRef.current?.(id, numbers) })
        } catch (caught) {
            setError(String(caught?.message || caught))
            return undefined
        }
        setError('')
        engineRef.current = engine
        let raf = 0
        let count = 0
        const loop = (now) => {
            raf = requestAnimationFrame(loop)
            engine.frame(now)
            count += 1
            if (thumbnails && count % THUMBNAIL_EVERY === 0) {
                const targets = topThumbnailTargets()
                if (targets.size) engine.thumbnails(targets)
            }
            if (showRef.current) engine.show(showRef.current)
        }
        raf = requestAnimationFrame(loop)
        return () => {
            cancelAnimationFrame(raf)
            engine.dispose()
            engineRef.current = null
        }
    }, [hasNodes, canvas, width, height, thumbnails])

    // A parameter drag or a new wire changes the network, not the engine.
    useEffect(() => {
        engineRef.current?.setNetwork(network)
    }, [network, hasNodes, canvas])

    // One camera stream per Camera In. Stopped when the operator goes, so no
    // camera light is left burning behind a deleted node.
    useEffect(() => {
        const ids = cameraIds ? cameraIds.split(',') : []
        if (!ids.length) return undefined
        const media = globalThis.navigator?.mediaDevices
        if (!media?.getUserMedia) { setError('no camera access in this browser'); return undefined }
        const streams = []
        let cancelled = false
        for (const id of ids) {
            media.getUserMedia({ video: true, audio: false })
                .then((stream) => {
                    if (cancelled) { stream.getTracks().forEach((track) => track.stop()); return }
                    streams.push(stream)
                    const video = globalThis.document.createElement('video')
                    video.muted = true
                    video.playsInline = true
                    video.srcObject = stream
                    video.play().catch(() => {})
                    engineRef.current?.setVideo(id, video)
                })
                .catch((caught) => {
                    if (!cancelled) setError(caught?.name === 'NotAllowedError' ? 'camera not permitted' : 'camera unavailable')
                })
        }
        return () => {
            cancelled = true
            for (const id of ids) engineRef.current?.setVideo(id, null)
            streams.forEach((stream) => stream.getTracks().forEach((track) => track.stop()))
        }
    }, [cameraIds, hasNodes, canvas])

    return { error }
}
